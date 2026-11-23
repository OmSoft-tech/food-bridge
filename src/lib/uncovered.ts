import type { Need, Priority, Product } from '../types'
import type { MatchPlan } from './matching'
import type { BasketItem } from './basket'

export interface UncoveredItem {
  needId: string
  recipientId: string
  productId: string
  /** сколько единиц осталось собрать */
  remainingQty: number
  /** остаток в кг */
  remainingKg: number
  priority: Priority
  /** стоимость закрытия остатка по розничной цене, ₽ */
  cost: number
}

export interface UncoveredSummary {
  /** отсортировано: высокие нужды раньше, внутри — по стоимости убыванию */
  items: UncoveredItem[]
  totalRemainingKg: number
  /** за сколько Фонд докупит всё недостающее, ₽ */
  totalCost: number
  /** докупка по нуждам высокого приоритета, ₽ */
  highCost: number
  highRemainingKg: number
  /** доля открытого веса нужд, закрытая излишками плана, 0..100 */
  coveredPct: number
  /** доля, закрываемая деньгами Фонда, 0..100 */
  moneyPct: number
}

/**
 * Непокрытые нужды после построения плана: остаток открытой потребности
 * (желаемое − полученное − распределённое планом) по каждой нужде,
 * вес и стоимость докупки по розничным ценам.
 */
export function computeUncovered(
  products: Product[],
  needs: Need[],
  plan: MatchPlan,
): UncoveredSummary {
  const byId = new Map(products.map((p) => [p.id, p]))

  const allocated = new Map<string, number>()
  let coveredKg = 0
  for (const t of plan.transfers) {
    for (const item of t.items) {
      const key = `${t.recipientId}|${item.productId}`
      allocated.set(key, (allocated.get(key) ?? 0) + item.qty)
      coveredKg += item.qty * (byId.get(item.productId)?.unitWeightKg ?? 0)
    }
  }

  const items: UncoveredItem[] = []
  let openKg = 0
  let totalRemainingKg = 0
  let totalCost = 0
  let highCost = 0
  let highRemainingKg = 0

  for (const n of needs) {
    const product = byId.get(n.productId)
    if (!product) continue
    const open = Math.max(0, n.desiredQty - n.fulfilledQty)
    openKg += open * product.unitWeightKg
    const allocatedQty = allocated.get(`${n.recipientId}|${n.productId}`) ?? 0
    const remaining = open - allocatedQty
    if (remaining <= 0) continue
    const remainingKg = remaining * product.unitWeightKg
    const cost = remaining * product.price
    items.push({
      needId: n.id,
      recipientId: n.recipientId,
      productId: n.productId,
      remainingQty: remaining,
      remainingKg,
      priority: n.priority,
      cost,
    })
    totalRemainingKg += remainingKg
    totalCost += cost
    if (n.priority === 'high') {
      highCost += cost
      highRemainingKg += remainingKg
    }
  }

  items.sort(
    (a, b) =>
      (a.priority === 'high' ? 0 : 1) - (b.priority === 'high' ? 0 : 1) || b.cost - a.cost,
  )

  const coveredPct = openKg > 0 ? Math.round((coveredKg / openKg) * 100) : 100
  return {
    items,
    totalRemainingKg,
    totalCost,
    highCost,
    highRemainingKg,
    coveredPct,
    moneyPct: 100 - coveredPct,
  }
}

/** Позиция докупки из элемента непокрытых нужд (пометка «докупка»). */
export function uncoveredToRefillItem(item: UncoveredItem): BasketItem {
  return {
    productId: item.productId,
    qty: item.remainingQty,
    refillOf: item.needId,
    recipientId: item.recipientId,
  }
}

/** Весь дефицит → позиции набора калькулятора. */
export function uncoveredToBasketItems(summary: UncoveredSummary): BasketItem[] {
  return summary.items.map(uncoveredToRefillItem)
}
