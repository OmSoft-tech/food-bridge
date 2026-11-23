import type { Need, Product, Recipient, Store, Surplus } from '../types'
import { kgToPersonDays } from './nutrition'
import { haversineKm } from './geo'

export interface TransferItem {
  surplusId: string
  productId: string
  /** сколько единиц излишка уходит в передачу */
  qty: number
  /** какая нужда закрывается этой позицией (мок n…, ручная заявка req-…) */
  needId: string
}

export type TransferStatus = 'planned' | 'confirmed'

export interface Transfer {
  id: string
  storeId: string
  recipientId: string
  items: TransferItem[]
  totalKg: number
  /** сколько человеко-дней покрывает передача (по нормам категорий) */
  personDays: number
  status: TransferStatus
}

export interface MatchPlan {
  transfers: Transfer[]
  totalKg: number
  personDays: number
}

/**
 * Стратегия мэтчинга (сценарии что-если):
 * - expiry — базовая: излишки расходуются по сроку годности (спасти скоропорт),
 *   нужды по приоритету и весу;
 * - distance — излишки для нужды берутся из ближайшего к пункту магазина
 *   (минимум транспортного плеча), скоропорт — вторичен;
 * - priority — жёсткий порядок нужд: сначала все высокие (в порядке списка
 *   нужд фонда, без пересортировки по весу), затем средние.
 */
export type MatchStrategy = 'expiry' | 'distance' | 'priority'

export interface BuildPlanOptions {
  strategy?: MatchStrategy
  /**
   * Лимит распределённого веса вывоза в день, кг; 0/undefined — без лимита.
   * Сверх лимита излишки остаются в витрине (попадают в «Непокрытые нужды»).
   */
  dailyLimitKg?: number
  /** координаты магазинов и пунктов — нужны стратегии distance */
  stores?: Store[]
  recipients?: Recipient[]
}

const PICKUP_WEEK_DAYS = 7

function clampDay(days: number): number {
  return Math.min(PICKUP_WEEK_DAYS - 1, Math.max(0, days))
}

/**
 * Жадный алгоритм мэтчинга (MVP) со сценариями:
 *  1) открытые нужды обходятся в порядке стратегии;
 *  2) для каждой нужды — кандидаты из доступных излишков того же товара
 *     в порядке стратегии (срок / расстояние);
 *  3) дневной лимит веса: излишек распределяется, пока не превышен лимит
 *     дня вывоза (день = срок годности излишка), остаток остаётся непокрытым.
 * Веса считаются из количества единиц и веса единицы товара.
 */
export function buildMatchPlan(
  products: Product[],
  surpluses: Surplus[],
  needs: Need[],
  options: BuildPlanOptions = {},
): MatchPlan {
  const strategy: MatchStrategy = options.strategy ?? 'expiry'
  const dailyLimitKg =
    options.dailyLimitKg !== undefined && options.dailyLimitKg > 0
      ? options.dailyLimitKg
      : Number.POSITIVE_INFINITY
  const geoReady =
    options.strategy === 'distance' &&
    options.stores !== undefined &&
    options.recipients !== undefined

  const weight = new Map(products.map((p) => [p.id, p.unitWeightKg]))
  const categoryOf = new Map(products.map((p) => [p.id, p.category]))
  const storeById = new Map((options.stores ?? []).map((s) => [s.id, s]))
  const recipientById = new Map((options.recipients ?? []).map((r) => [r.id, r]))

  const available = surpluses.filter((s) => s.status === 'available')
  const leftBySurplus = new Map(available.map((s) => [s.id, s.qty]))
  const usedByDay = new Map<number, number>()

  const openNeeds = needs
    .map((n) => ({ need: n, remaining: Math.max(0, n.desiredQty - n.fulfilledQty) }))
    .filter((x) => x.remaining > 0)

  const priorityWeight = (p: Need['priority']): number => (p === 'high' ? 0 : 1)
  const remainingKg = (x: { need: Need; remaining: number }): number =>
    x.remaining * (weight.get(x.need.productId) ?? 0)

  if (strategy === 'priority') {
    // жёсткий порядок: все высокие (как в списке нужд), затем средние —
    // без пересортировки по весу внутри приоритета
    openNeeds.sort((a, b) => priorityWeight(a.need.priority) - priorityWeight(b.need.priority))
  } else {
    openNeeds.sort(
      (a, b) =>
        priorityWeight(a.need.priority) - priorityWeight(b.need.priority) ||
        remainingKg(b) - remainingKg(a),
    )
  }

  const byKey = new Map<string, Transfer>()
  let seq = 0

  const push = (storeId: string, recipientId: string, item: TransferItem): void => {
    const key = `${storeId}→${recipientId}`
    const transfer = byKey.get(key)
    if (transfer) {
      transfer.items.push(item)
    } else {
      seq += 1
      byKey.set(key, {
        id: `t${seq}`,
        storeId,
        recipientId,
        items: [item],
        totalKg: 0,
        personDays: 0,
        status: 'planned',
      })
    }
  }

  const candidateOrder = (s: Surplus, need: Need): number => {
    if (geoReady) {
      const store = storeById.get(s.storeId)
      const recipient = recipientById.get(need.recipientId)
      if (store && recipient) {
        // близкие магазины первыми — вывоз «по пути», скоропорт вторичен
        return haversineKm(store.lat, store.lon, recipient.lat, recipient.lon)
      }
    }
    return s.expiresInDays
  }

  for (const { need, remaining } of openNeeds) {
    let want = remaining
    const candidates = available
      .filter((s) => s.productId === need.productId && (leftBySurplus.get(s.id) ?? 0) > 0)
      .sort((a, b) => {
        if (strategy === 'distance') {
          const da = candidateOrder(a, need)
          const db = candidateOrder(b, need)
          if (da !== db) return da - db
        }
        // скоропорт первым — и в базовой стратегии, и как tiebreak
        return a.expiresInDays - b.expiresInDays || a.id.localeCompare(b.id)
      })

    for (const s of candidates) {
      if (want === 0) break
      const left = leftBySurplus.get(s.id) ?? 0
      if (left <= 0) continue

      const unitWeight = weight.get(s.productId) ?? 0
      const day = clampDay(s.expiresInDays)
      const used = usedByDay.get(day) ?? 0
      const allowedQty = Math.floor((dailyLimitKg - used) / unitWeight)
      if (allowedQty <= 0) continue

      const take = Math.min(left, want, allowedQty)
      if (take <= 0) continue
      leftBySurplus.set(s.id, left - take)
      usedByDay.set(day, used + take * unitWeight)
      want -= take
      push(s.storeId, need.recipientId, {
        surplusId: s.id,
        productId: s.productId,
        qty: take,
        needId: need.id,
      })
    }
  }

  const transfers = [...byKey.values()]
  let totalKg = 0
  let personDays = 0
  for (const t of transfers) {
    for (const item of t.items) {
      const kg = item.qty * (weight.get(item.productId) ?? 0)
      const category = categoryOf.get(item.productId)
      t.totalKg += kg
      t.personDays += category ? kgToPersonDays(category, kg) : 0
    }
    totalKg += t.totalKg
    personDays += t.personDays
  }

  return { transfers, totalKg, personDays }
}
