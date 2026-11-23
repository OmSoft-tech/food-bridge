import type { Category, Product } from '../types'
import { KCAL_PER_KG, NORM_KG_PER_PERSON_DAY } from './nutrition'

export interface BasketItem {
  productId: string
  qty: number
  /** пометка «докупка»: id непокрытой нужды, которую закрывает позиция */
  refillOf?: string
  /** пункт помощи, для которого покупается позиция */
  recipientId?: string
}

/** Ключ позиции в наборе: товар + источник (для докупок — по нужде). */
export function basketItemKey(item: BasketItem): string {
  return `${item.productId}|${item.refillOf ?? ''}|${item.recipientId ?? ''}`
}

/**
 * Слияние позиций докупки в набор без дублей: позиция с тем же товаром
 * и пунктом уже есть в наборе (даже если план пересобран) — пропускается.
 */
export function mergeRefillItems(
  items: BasketItem[],
  refills: BasketItem[],
): { items: BasketItem[]; added: number; skipped: number } {
  const next = [...items]
  const seen = new Set(
    next.filter((i) => i.refillOf).map((i) => `${i.productId}|${i.recipientId}`),
  )
  let added = 0
  let skipped = 0
  for (const refill of refills) {
    const key = `${refill.productId}|${refill.recipientId}`
    if (seen.has(key)) {
      skipped += 1
      continue
    }
    next.push(refill)
    seen.add(key)
    added += 1
  }
  return { items: next, added, skipped }
}

export interface BasketSummary {
  totalKg: number
  totalKcal: number
  totalCost: number
  /** человеко-дни покрытия по нормам категорий */
  personDays: number
  kgByCategory: Map<Category, number>
}

/** Расчёт набора из товаров: вес, калорийность, стоимость, покрытие. */
export function computeBasket(products: Product[], items: BasketItem[]): BasketSummary {
  const byId = new Map(products.map((p) => [p.id, p]))
  const kgByCategory = new Map<Category, number>()
  let totalKg = 0
  let totalKcal = 0
  let totalCost = 0

  for (const item of items) {
    const product = byId.get(item.productId)
    if (!product) continue
    const kg = item.qty * product.unitWeightKg
    totalKg += kg
    totalKcal += kg * KCAL_PER_KG[product.category]
    totalCost += item.qty * product.price
    kgByCategory.set(product.category, (kgByCategory.get(product.category) ?? 0) + kg)
  }

  let personDays = 0
  for (const [category, kg] of kgByCategory) {
    personDays += kg / NORM_KG_PER_PERSON_DAY[category]
  }

  return { totalKg, totalKcal, totalCost, personDays, kgByCategory }
}

/** Сколько полных наборов стоимостью basketCost влезает в бюджет. */
export function basketsForBudget(budget: number, basketCost: number): number {
  if (!(budget > 0) || !(basketCost > 0)) return 0
  return Math.floor(budget / basketCost)
}
