import type { Need, Product, Surplus } from '../types'
import { kgToPersonDays } from './nutrition'

export interface TransferItem {
  surplusId: string
  productId: string
  /** сколько единиц излишка уходит в передачу */
  qty: number
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
 * Жадный алгоритм мэтчинга (MVP):
 *  1) доступные излишки сортируются по сроку годности — сначала то, что скоро
 *     испортится (спасти нельзя потом, списание необратимо);
 *  2) открытые нужды закрываются по приоритету: высокий раньше среднего;
 *  3) излишки раздаются до полного закрытия нужды, остаток — следующей.
 * Веса считаются из количества единиц и веса единицы товара.
 */
export function buildMatchPlan(
  products: Product[],
  surpluses: Surplus[],
  needs: Need[],
): MatchPlan {
  const weight = new Map(products.map((p) => [p.id, p.unitWeightKg]))

  const available = surpluses
    .filter((s) => s.status === 'available')
    .sort((a, b) => a.expiresInDays - b.expiresInDays)
  const leftBySurplus = new Map(available.map((s) => [s.id, s.qty]))

  const openNeeds = needs
    .map((n) => ({ need: n, remaining: Math.max(0, n.desiredQty - n.fulfilledQty) }))
    .filter((x) => x.remaining > 0)
    .sort(
      (a, b) =>
        (a.need.priority === 'high' ? 0 : 1) - (b.need.priority === 'high' ? 0 : 1) ||
        b.remaining * (weight.get(b.need.productId) ?? 0) -
          a.remaining * (weight.get(a.need.productId) ?? 0),
    )

  const buckets = new Map<string, Transfer>()
  let seq = 0

  const push = (storeId: string, recipientId: string, item: TransferItem): void => {
    const key = `${storeId}→${recipientId}`
    const transfer = buckets.get(key)
    if (transfer) {
      transfer.items.push(item)
    } else {
      seq += 1
      buckets.set(key, {
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

  for (const { need, remaining } of openNeeds) {
    let want = remaining
    for (const s of available) {
      if (want === 0) break
      if (s.productId !== need.productId) continue
      const left = leftBySurplus.get(s.id) ?? 0
      if (left <= 0) continue
      const take = Math.min(left, want)
      leftBySurplus.set(s.id, left - take)
      want -= take
      push(s.storeId, need.recipientId, { surplusId: s.id, productId: s.productId, qty: take })
    }
  }

  const categoryOf = new Map(products.map((p) => [p.id, p.category]))
  const transfers = [...buckets.values()]
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
