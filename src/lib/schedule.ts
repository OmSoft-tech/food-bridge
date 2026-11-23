import type { Recipient, Store, Surplus } from '../types'
import type { MatchPlan } from './matching'
import { haversineKm } from './geo'

/** Реэкспорт: существующий код/tests импортируют haversine из schedule. */
export { haversineKm }

const DAY_MS = 86_400_000

/** Вывозы планируем на неделю: длительно хранимое уезжает в последний день. */
export const PICKUP_WEEK_DAYS = 7

export interface ScheduledTransfer {
  transferId: string
  storeId: string
  recipientId: string
  status: 'planned' | 'confirmed'
  totalKg: number
}

export interface PickupRoute {
  recipientId: string
  /** магазины маршрута: от дальнего к пункту (жадно, «по пути») */
  transfers: ScheduledTransfer[]
  totalKg: number
}

export interface PickupDay {
  /** 0 = сегодня, 1 = завтра, … (в пределах недели) */
  dayOffset: number
  date: Date
  routes: PickupRoute[]
  transferCount: number
  totalKg: number
}

function clampDay(days: number): number {
  return Math.min(PICKUP_WEEK_DAYS - 1, Math.max(0, days))
}

/**
 * План вывозов на неделю: передачи группируются по дням — чем меньше дней до
 * конца срока годности товара в передаче, тем раньше вывоз (длительно хранимое
 * уезжает в последний день недели). Внутри дня передачи к одному пункту
 * сортируются по расстоянию магазин → пункт (haversine, от дальнего к ближнему),
 * чтобы машина собирала груз «по пути».
 */
export function planPickupSchedule(
  plan: MatchPlan,
  surpluses: Surplus[],
  stores: Store[],
  recipients: Recipient[],
  confirmed: Set<string>,
  now = Date.now(),
): PickupDay[] {
  if (plan.transfers.length === 0) return []

  const expiryBySurplus = new Map(surpluses.map((s) => [s.id, s.expiresInDays]))
  const storeById = new Map(stores.map((s) => [s.id, s]))
  const recipientById = new Map(recipients.map((r) => [r.id, r]))

  const byDay = new Map<number, Map<string, ScheduledTransfer[]>>()

  for (const t of plan.transfers) {
    let minExpiry = Number.POSITIVE_INFINITY
    for (const item of t.items) {
      const expiry = expiryBySurplus.get(item.surplusId)
      if (expiry !== undefined) minExpiry = Math.min(minExpiry, expiry)
    }
    const dayOffset = clampDay(Number.isFinite(minExpiry) ? minExpiry : PICKUP_WEEK_DAYS - 1)

    const dayGroups = byDay.get(dayOffset) ?? new Map<string, ScheduledTransfer[]>()
    const bucket = dayGroups.get(t.recipientId) ?? []
    bucket.push({
      transferId: t.id,
      storeId: t.storeId,
      recipientId: t.recipientId,
      status: confirmed.has(t.id) ? 'confirmed' : 'planned',
      totalKg: t.totalKg,
    })
    dayGroups.set(t.recipientId, bucket)
    byDay.set(dayOffset, dayGroups)
  }

  const days: PickupDay[] = [...byDay.keys()]
    .sort((a, b) => a - b)
    .map((dayOffset) => {
      const dayGroups = byDay.get(dayOffset)!
      const routes: PickupRoute[] = [...dayGroups.keys()]
        .sort()
        .map((recipientId) => {
          const recipient = recipientById.get(recipientId)
          const transfers = dayGroups.get(recipientId)!.slice().sort((a, b) => {
            const ra = storeById.get(a.storeId)
            const rb = storeById.get(b.storeId)
            const da = distanceTo(ra, recipient)
            const db = distanceTo(rb, recipient)
            // дальние магазины первыми — машина собирает груз по пути к пункту;
            // при равном расстоянии — стабильный порядок по id магазина
            return db - da || a.storeId.localeCompare(b.storeId)
          })
          return {
            recipientId,
            transfers,
            totalKg: transfers.reduce((sum, s) => sum + s.totalKg, 0),
          }
        })
      const transferCount = routes.reduce((sum, r) => sum + r.transfers.length, 0)
      const totalKg = routes.reduce((sum, r) => sum + r.totalKg, 0)
      return { dayOffset, date: new Date(now + dayOffset * DAY_MS), routes, transferCount, totalKg }
    })

  return days
}

function distanceTo(store: Store | undefined, recipient: Recipient | undefined): number {
  if (!store || !recipient) return 0
  return haversineKm(store.lat, store.lon, recipient.lat, recipient.lon)
}
