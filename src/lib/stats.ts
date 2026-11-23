import type { Category, Need, Product, Surplus } from '../types'
import { kgToPersonDays } from './nutrition'

export interface CategoryStat {
  category: Category
  availableKg: number
  /** кг излишков, которые реально закрывают открытые нужды */
  matchedKg: number
  /** открытая потребность в кг */
  openNeedKg: number
}

export interface DashboardStats {
  /** кг излишков со статусом «доступно» */
  availableKg: number
  /** кг, совпадающие с открытыми нуждами (их и спасаем от списания) */
  matchedKg: number
  /** доля совпадения, 0..100 */
  matchPct: number
  /** человеко-дней покрытия по нормам */
  personDays: number
  /** скоропорт: доступные излишки с истечением ≤3 дней */
  urgentKg: number
  urgentCount: number
  categories: CategoryStat[]
}

const URGENCY_DAYS = 3

/**
 * Сводка дашборда. Совпадение считается по товарам:
 * min(доступный излишек, открытая потребность) в кг.
 */
export function computeDashboardStats(
  products: Product[],
  surpluses: Surplus[],
  needs: Need[],
): DashboardStats {
  const weight = new Map<string, number>(products.map((p) => [p.id, p.unitWeightKg]))
  const categoryOf = new Map(products.map((p) => [p.id, p.category]))

  const availableKgByProduct = new Map<string, number>()
  let urgentKg = 0
  let urgentCount = 0
  for (const s of surpluses) {
    if (s.status !== 'available') continue
    const kg = s.qty * (weight.get(s.productId) ?? 0)
    availableKgByProduct.set(s.productId, (availableKgByProduct.get(s.productId) ?? 0) + kg)
    if (s.expiresInDays <= URGENCY_DAYS) {
      urgentKg += kg
      urgentCount += 1
    }
  }

  const openNeedKgByProduct = new Map<string, number>()
  for (const n of needs) {
    const open = Math.max(0, n.desiredQty - n.fulfilledQty) * (weight.get(n.productId) ?? 0)
    if (open > 0) {
      openNeedKgByProduct.set(n.productId, (openNeedKgByProduct.get(n.productId) ?? 0) + open)
    }
  }

  const categories = new Map<Category, CategoryStat>()
  let availableKg = 0
  let matchedKg = 0
  for (const [productId, kg] of availableKgByProduct) {
    const category = categoryOf.get(productId)
    if (!category) continue
    availableKg += kg
    const open = openNeedKgByProduct.get(productId) ?? 0
    const matched = Math.min(kg, open)
    matchedKg += matched
    const stat = categories.get(category) ?? {
      category,
      availableKg: 0,
      matchedKg: 0,
      openNeedKg: 0,
    }
    stat.availableKg += kg
    stat.matchedKg += matched
    stat.openNeedKg += open
    categories.set(category, stat)
  }

  let personDays = 0
  for (const c of categories.values()) {
    personDays += kgToPersonDays(c.category, c.matchedKg)
  }

  return {
    availableKg,
    matchedKg,
    matchPct: availableKg > 0 ? (matchedKg / availableKg) * 100 : 0,
    personDays,
    urgentKg,
    urgentCount,
    categories: [...categories.values()],
  }
}

