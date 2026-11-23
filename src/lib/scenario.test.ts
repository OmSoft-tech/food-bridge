import { describe, expect, it } from 'vitest'
import { buildMatchPlan } from './matching'
import { buildPlanDelta, formatDelta, isBaseScenario } from './scenario'
import { computeUncovered } from './uncovered'
import type { Need, Product, Recipient, Store, Surplus } from '../types'

const products: Product[] = [
  { id: 'p1', name: 'Хлеб чёрный', category: 'bread', unit: 'батон', unitWeightKg: 0.5, shelfLifeDays: 5, price: 50, pricePerKg: 100 },
  { id: 'p2', name: 'Тушёнка говяжья', category: 'canned', unit: 'банка', unitWeightKg: 0.34, shelfLifeDays: 500, price: 120, pricePerKg: 353 },
]

const stores: Store[] = [
  { id: 's-near', name: 'Ближний магазин', chain: 'X', address: 'а', district: 'Ц', lat: 55.75, lon: 37.63 },
  { id: 's-far', name: 'Дальний магазин', chain: 'X', address: 'б', district: 'Ц', lat: 55.76, lon: 37.78 },
]
const recipients: Recipient[] = [
  { id: 'r1', name: 'Пункт', address: 'в', district: 'Ц', lat: 55.75, lon: 37.62 },
]

function makeSurplus(p: Partial<Surplus> & Pick<Surplus, 'id' | 'productId' | 'qty'>): Surplus {
  return { storeId: 's-near', expiresInDays: 10, status: 'available', ...p }
}

function makeNeed(p: Partial<Need> & Pick<Need, 'id' | 'productId' | 'desiredQty'>): Need {
  return { recipientId: 'r1', fulfilledQty: 0, priority: 'high', ...p }
}

describe('стратегии мэтчинга', () => {
  it('expiry берёт скоропорт, distance берёт ближайший магазин — планы различаются', () => {
    const surpluses = [
      makeSurplus({ id: 'sp-far', storeId: 's-far', productId: 'p1', qty: 6, expiresInDays: 1 }),
      makeSurplus({ id: 'sp-near', storeId: 's-near', productId: 'p1', qty: 6, expiresInDays: 30 }),
    ]
    const needs = [makeNeed({ id: 'n1', productId: 'p1', desiredQty: 6 })]

    const expiry = buildMatchPlan(products, surpluses, needs, { strategy: 'expiry' })
    const distance = buildMatchPlan(products, surpluses, needs, {
      strategy: 'distance',
      stores,
      recipients,
    })
    // база спасает скоропорт (дальний), расстояние везёт из ближнего
    expect(expiry.transfers[0].items[0].surplusId).toBe('sp-far')
    expect(distance.transfers[0].items[0].surplusId).toBe('sp-near')
  })

  it('priority жёсткий порядок нужд: лёгкая high из списка фонда закрывается раньше тяжёлой', () => {
    // high-нужды в порядке моков: n1 (лёгкая, 2 шт) раньше n2 (тяжёлая, 20 шт);
    // один излишек на 4 шт: база (вес desc) целиком уходит n2 — 1 позиция,
    // priority — n1 берёт 2, n2 добирает остаток — 2 позиции
    const surpluses = [makeSurplus({ id: 'sp1', productId: 'p1', qty: 4, expiresInDays: 3 })]
    const needs = [
      makeNeed({ id: 'n1', productId: 'p1', desiredQty: 2 }),
      makeNeed({ id: 'n2', productId: 'p1', desiredQty: 20 }),
    ]
    const base = buildMatchPlan(products, surpluses, needs) // expiry: по весу desc
    const priority = buildMatchPlan(products, surpluses, needs, { strategy: 'priority' })

    expect(base.transfers[0].items).toHaveLength(1)
    expect(base.transfers[0].items[0].qty).toBe(4)
    expect(priority.transfers[0].items.map((i) => i.qty)).toEqual([2, 2])
  })
})

describe('дневной лимит веса', () => {
  const surpluses = [
    makeSurplus({ id: 'sp0', productId: 'p1', qty: 8, expiresInDays: 0 }),
    makeSurplus({ id: 'sp1', productId: 'p1', qty: 8, expiresInDays: 1 }),
    makeSurplus({ id: 'sp2', productId: 'p1', qty: 8, expiresInDays: 2 }),
  ]
  const needs = [makeNeed({ id: 'n1', productId: 'p1', desiredQty: 24 })]

  it('без лимита распределяется всё', () => {
    const plan = buildMatchPlan(products, surpluses, needs)
    expect(plan.transfers[0].items.map((i) => i.qty)).toEqual([8, 8, 8])
    const s = computeUncovered(products, needs, plan)
    expect(s.items).toEqual([])
  })

  it('лимит 4 кг/день: ровно 8 шт (4 кг) в день по срокам, всё покрыто', () => {
    const plan = buildMatchPlan(products, surpluses, needs, { dailyLimitKg: 4 })
    expect(plan.transfers[0].items.map((i) => i.qty)).toEqual([8, 8, 8])
  })

  it('лимит 3 кг/день обрезает: 6 шт в день, остаток 6 шт остаётся непокрытым', () => {
    const plan = buildMatchPlan(products, surpluses, needs, { dailyLimitKg: 3 })
    expect(plan.transfers[0].items.map((i) => i.qty)).toEqual([6, 6, 6])
    const s = computeUncovered(products, needs, plan)
    expect(s.items).toHaveLength(1)
    expect(s.items[0].remainingQty).toBe(6)
    expect(s.totalRemainingKg).toBeCloseTo(3)
    expect(s.totalCost).toBe(300)
  })

  it('лимит не дробит излишки до нуля: частичное взятие до лимита', () => {
    // излишек 8 шт (4 кг), лимит 2,5 кг/день → берём 5 шт (2,5 кг), остаток не влезает
    const single = [makeSurplus({ id: 'sp0', productId: 'p1', qty: 8, expiresInDays: 0 })]
    const need = [makeNeed({ id: 'n1', productId: 'p1', desiredQty: 8 })]
    const plan = buildMatchPlan(products, single, need, { dailyLimitKg: 2.5 })
    expect(plan.transfers[0].items[0].qty).toBe(5)
    const s = computeUncovered(products, need, plan)
    expect(s.items[0].remainingQty).toBe(3)
  })
})

describe('дельта сценариев', () => {
  it('идентичные планы — нулевая дельта', () => {
    const surpluses = [makeSurplus({ id: 'sp1', productId: 'p1', qty: 6, expiresInDays: 3 })]
    const needs = [makeNeed({ id: 'n1', productId: 'p1', desiredQty: 6 })]
    const base = buildMatchPlan(products, surpluses, needs)
    const d = buildPlanDelta(base, base, products, needs)
    expect(d).toEqual({ transfers: 0, kg: 0, personDays: 0, deficitCost: 0 })
  })

  it('сценарий с лимитом показывает: −кг, −чел.-дней, +₽ дефицита', () => {
    const surpluses = [
      makeSurplus({ id: 'sp0', productId: 'p1', qty: 8, expiresInDays: 0 }),
      makeSurplus({ id: 'sp1', productId: 'p1', qty: 8, expiresInDays: 1 }),
      makeSurplus({ id: 'sp2', productId: 'p1', qty: 8, expiresInDays: 2 }),
    ]
    const needs = [makeNeed({ id: 'n1', productId: 'p1', desiredQty: 24 })]
    const base = buildMatchPlan(products, surpluses, needs)
    const limited = buildMatchPlan(products, surpluses, needs, { dailyLimitKg: 3 })
    const d = buildPlanDelta(base, limited, products, needs)
    expect(d.transfers).toBe(0)
    expect(d.kg).toBeCloseTo(-3)
    expect(d.personDays).toBeLessThan(0)
    expect(d.deficitCost).toBeCloseTo(300)
  })

  it('formatDelta со знаком', () => {
    expect(formatDelta(3, 'перед.')).toBe('+3 перед.')
    expect(formatDelta(-12.5, 'кг')).toBe('−12,5 кг')
    expect(formatDelta(0, 'кг')).toBe('0 кг')
  })
})

describe('базовый сценарий', () => {
  it('isBaseScenario: только expiry + лимит 0', () => {
    expect(isBaseScenario({ strategy: 'expiry', dailyLimitKg: 0 })).toBe(true)
    expect(isBaseScenario({ strategy: 'distance', dailyLimitKg: 0 })).toBe(false)
    expect(isBaseScenario({ strategy: 'expiry', dailyLimitKg: 500 })).toBe(false)
  })
})
