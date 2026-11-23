import { describe, expect, it } from 'vitest'
import { buildMatchPlan } from './matching'
import type { Need, Product, Surplus } from '../types'
import { needs as mockNeeds, products as mockProducts, surpluses as mockSurpluses } from '../data'

const products: Product[] = [
  { id: 'p1', name: 'Хлеб чёрный', category: 'bread', unit: 'батон', unitWeightKg: 0.5, shelfLifeDays: 5, price: 50, pricePerKg: 100 },
  { id: 'p2', name: 'Тушёнка говяжья', category: 'canned', unit: 'банка', unitWeightKg: 0.34, shelfLifeDays: 500, price: 120, pricePerKg: 353 },
  { id: 'p3', name: 'Молоко 2,5%', category: 'dairy', unit: 'пак.', unitWeightKg: 1.0, shelfLifeDays: 10, price: 85, pricePerKg: 85 },
]

function makeSurplus(p: Partial<Surplus> & Pick<Surplus, 'id' | 'productId' | 'qty'>): Surplus {
  return { storeId: 's1', expiresInDays: 10, status: 'available', ...p }
}

function makeNeed(p: Partial<Need> & Pick<Need, 'id' | 'productId' | 'desiredQty'>): Need {
  return { recipientId: 'r1', fulfilledQty: 0, priority: 'high', ...p }
}

describe('жадный мэтчинг: приоритет', () => {
  it('высокая нужда закрывается раньше средней при дефиците', () => {
    const plan = buildMatchPlan(
      products,
      [makeSurplus({ id: 'sp1', productId: 'p1', qty: 10 })],
      [
        makeNeed({ id: 'n1', recipientId: 'r2', productId: 'p1', desiredQty: 10, priority: 'medium' }),
        makeNeed({ id: 'n2', recipientId: 'r1', productId: 'p1', desiredQty: 10, priority: 'high' }),
      ],
    )
    // излишек целиком ушёл высокоприоритетной нужде
    expect(plan.transfers).toHaveLength(1)
    expect(plan.transfers[0].recipientId).toBe('r1')
    expect(plan.transfers[0].items[0].qty).toBe(10)
  })

  it('высокоприоритетные нужды получают долю даже при равном дефиците', () => {
    const plan = buildMatchPlan(
      products,
      [makeSurplus({ id: 'sp1', productId: 'p1', qty: 6 })],
      [
        makeNeed({ id: 'n1', recipientId: 'r2', productId: 'p1', desiredQty: 10, priority: 'medium' }),
        makeNeed({ id: 'n2', recipientId: 'r1', productId: 'p1', desiredQty: 10, priority: 'high' }),
      ],
    )
    expect(plan.transfers[0].recipientId).toBe('r1')
    expect(plan.transfers[0].items[0].qty).toBe(6)
  })
})

describe('жадный мэтчинг: сроки годности', () => {
  it('первым расходуется излишек, который скорее испортится', () => {
    const plan = buildMatchPlan(
      products,
      [
        makeSurplus({ id: 'sp-long', productId: 'p1', qty: 5, expiresInDays: 20 }),
        makeSurplus({ id: 'sp-short', productId: 'p1', qty: 5, expiresInDays: 2 }),
      ],
      [makeNeed({ id: 'n1', productId: 'p1', desiredQty: 5 })],
    )
    expect(plan.transfers).toHaveLength(1)
    expect(plan.transfers[0].items).toHaveLength(1)
    expect(plan.transfers[0].items[0].surplusId).toBe('sp-short')
  })

  it('закрывая нужду, алгоритм доедает скоропорт до конца, потом долгий', () => {
    const plan = buildMatchPlan(
      products,
      [
        makeSurplus({ id: 'sp-short', productId: 'p3', qty: 4, expiresInDays: 3 }),
        makeSurplus({ id: 'sp-long', productId: 'p3', qty: 4, expiresInDays: 30 }),
      ],
      [makeNeed({ id: 'n1', productId: 'p3', desiredQty: 8 })],
    )
    const [first, second] = plan.transfers[0].items
    expect(first.surplusId).toBe('sp-short')
    expect(second.surplusId).toBe('sp-long')
    expect(first.qty).toBe(4)
    expect(second.qty).toBe(4)
  })
})

describe('жадный мэтчинг: фильтры и статусы', () => {
  it('зарезервированные и переданные излишки не участвуют', () => {
    const plan = buildMatchPlan(
      products,
      [
        makeSurplus({ id: 'sp-res', productId: 'p1', qty: 5, status: 'reserved' }),
        makeSurplus({ id: 'sp-done', productId: 'p1', qty: 5, status: 'transferred' }),
        makeSurplus({ id: 'sp-ok', productId: 'p1', qty: 5, status: 'available' }),
      ],
      [makeNeed({ id: 'n1', productId: 'p1', desiredQty: 10 })],
    )
    expect(plan.transfers).toHaveLength(1)
    expect(plan.transfers[0].items.map((i) => i.surplusId)).toEqual(['sp-ok'])
    expect(plan.totalKg).toBeCloseTo(2.5)
  })

  it('уже закрытая часть нужды не закрывается повторно', () => {
    const plan = buildMatchPlan(
      products,
      [makeSurplus({ id: 'sp1', productId: 'p1', qty: 10 })],
      [makeNeed({ id: 'n1', productId: 'p1', desiredQty: 10, fulfilledQty: 6 })],
    )
    expect(plan.transfers[0].items[0].qty).toBe(4)
  })

  it('полностью закрытая нужда не порождает передачу', () => {
    const plan = buildMatchPlan(
      products,
      [makeSurplus({ id: 'sp1', productId: 'p1', qty: 10 })],
      [makeNeed({ id: 'n1', productId: 'p1', desiredQty: 10, fulfilledQty: 10 })],
    )
    expect(plan.transfers).toHaveLength(0)
  })
})

describe('жадный мэтчинг: инварианты и группировка', () => {
  it('передачи группируются по паре магазин → пункт', () => {
    const plan = buildMatchPlan(
      products,
      [
        makeSurplus({ id: 'sp1', storeId: 's1', productId: 'p1', qty: 5 }),
        makeSurplus({ id: 'sp2', storeId: 's2', productId: 'p1', qty: 5 }),
        makeSurplus({ id: 'sp3', storeId: 's1', productId: 'p2', qty: 4 }),
      ],
      [
        makeNeed({ id: 'n1', recipientId: 'r1', productId: 'p1', desiredQty: 5 }),
        makeNeed({ id: 'n2', recipientId: 'r2', productId: 'p1', desiredQty: 5 }),
        makeNeed({ id: 'n3', recipientId: 'r1', productId: 'p2', desiredQty: 4 }),
      ],
    )
    // s1→r1 объединяет p1 и p2 в одну передачу, s2→r2 — вторая
    expect(plan.transfers).toHaveLength(2)
    expect(plan.transfers.map((t) => [t.storeId, t.recipientId]).sort()).toEqual([
      ['s1', 'r1'],
      ['s2', 'r2'],
    ])
  })

  it('вес передачи сходится с позициями, излишки не расходуются сверх количества', () => {
    const surpluses: Surplus[] = [
      makeSurplus({ id: 'sp1', productId: 'p1', qty: 10 }),
      makeSurplus({ id: 'sp2', productId: 'p2', qty: 20, storeId: 's2' }),
      makeSurplus({ id: 'sp3', productId: 'p3', qty: 3, storeId: 's3' }),
    ]
    const needs: Need[] = [
      makeNeed({ id: 'n1', productId: 'p1', desiredQty: 8 }),
      makeNeed({ id: 'n2', recipientId: 'r2', productId: 'p2', desiredQty: 25, priority: 'medium' }),
      makeNeed({ id: 'n3', productId: 'p3', desiredQty: 5 }),
    ]
    const plan = buildMatchPlan(products, surpluses, needs)
    const taken = new Map<string, number>()
    for (const t of plan.transfers) {
      let sum = 0
      for (const i of t.items) {
        const product = products.find((p) => p.id === i.productId)
        expect(product).toBeDefined()
        sum += i.qty * (product?.unitWeightKg ?? 0)
        taken.set(i.surplusId, (taken.get(i.surplusId) ?? 0) + i.qty)
      }
      expect(t.totalKg).toBeCloseTo(sum, 9)
    }
    for (const s of surpluses) {
      expect(taken.get(s.id) ?? 0).toBeLessThanOrEqual(s.qty)
    }
  })

  it('алгоритм детерминирован', () => {
    const args = [products, mockSurpluses, mockNeeds] as const
    expect(JSON.stringify(buildMatchPlan(...args))).toBe(JSON.stringify(buildMatchPlan(...args)))
  })
})

describe('мэтчинг на моковых данных проекта', () => {
  it('план непустой и высокоприоритетные нужды с покрытием получают излишки', () => {
    const plan = buildMatchPlan(mockProducts, mockSurpluses, mockNeeds)
    expect(plan.transfers.length).toBeGreaterThan(0)
    const got = new Map<string, number>()
    for (const t of plan.transfers) {
      for (const i of t.items) {
        const need = mockNeeds.find((n) => n.recipientId === t.recipientId && n.productId === i.productId)
        if (!need) continue
        got.set(need.id, (got.get(need.id) ?? 0) + i.qty)
      }
    }
    for (const n of mockNeeds) {
      const open = Math.max(0, n.desiredQty - n.fulfilledQty)
      if (open === 0 || n.priority !== 'high') continue
      expect(got.get(n.id) ?? 0).toBeGreaterThan(0)
    }
  })
})
