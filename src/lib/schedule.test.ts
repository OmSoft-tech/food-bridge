import { describe, expect, it } from 'vitest'
import { haversineKm, planPickupSchedule } from './schedule'
import { buildMatchPlan, type MatchPlan } from './matching'
import type { Need, Product, Recipient, Store, Surplus } from '../types'

const products: Product[] = [
  { id: 'p1', name: 'Хлеб чёрный', category: 'bread', unit: 'батон', unitWeightKg: 0.5, shelfLifeDays: 5, price: 50, pricePerKg: 100 },
  { id: 'p2', name: 'Тушёнка говяжья', category: 'canned', unit: 'банка', unitWeightKg: 0.34, shelfLifeDays: 500, price: 120, pricePerKg: 353 },
]

const stores: Store[] = [
  { id: 's-near', name: 'Магазин рядом', chain: 'X', address: 'а', district: 'Ц', lat: 55.75, lon: 37.63 },
  { id: 's-far', name: 'Магазин далеко', chain: 'X', address: 'б', district: 'Ц', lat: 55.76, lon: 37.75 },
  { id: 's-a', name: 'Магазин А', chain: 'X', address: 'в', district: 'Ц', lat: 55.75, lon: 37.64 },
  { id: 's-b', name: 'Магазин Б', chain: 'X', address: 'г', district: 'Ц', lat: 55.75, lon: 37.64 },
]

const recipients: Recipient[] = [
  { id: 'r1', name: 'Пункт один', address: 'д', district: 'Ц', lat: 55.75, lon: 37.62 },
  { id: 'r2', name: 'Пункт два', address: 'е', district: 'Ц', lat: 55.75, lon: 37.62 },
]

function makeSurplus(p: Partial<Surplus> & Pick<Surplus, 'id' | 'productId' | 'qty'>): Surplus {
  return { storeId: 's-near', expiresInDays: 10, status: 'available', ...p }
}

function makeNeed(p: Partial<Need> & Pick<Need, 'id' | 'productId' | 'desiredQty'>): Need {
  return { recipientId: 'r1', fulfilledQty: 0, priority: 'high', ...p }
}

const NOW = new Date('2026-11-23T12:00:00').getTime()

describe('haversine', () => {
  it('нулевое расстояние для одинаковых точек', () => {
    expect(haversineKm(55.75, 37.62, 55.75, 37.62)).toBe(0)
  })

  it('Москва — Санкт-Петербург ≈ 630–650 км', () => {
    const d = haversineKm(55.7558, 37.6173, 59.9343, 30.3351)
    expect(d).toBeGreaterThan(620)
    expect(d).toBeLessThan(650)
  })
})

describe('план вывозов: группировка по дням', () => {
  it('день = минимальный срок годности товара в передаче (вывоз в последний допустимый день)', () => {
    // передача из двух излишков (срок 5 и 2 дня) → вывоз через 2 дня,
    // пока не истёк самый скоропортящийся товар
    const plan = buildMatchPlan(products, [
      makeSurplus({ id: 'sp-long', productId: 'p1', qty: 4, expiresInDays: 5 }),
      makeSurplus({ id: 'sp-short', productId: 'p1', qty: 4, expiresInDays: 2 }),
    ], [makeNeed({ id: 'n1', productId: 'p1', desiredQty: 8 })])
    const days = planPickupSchedule(plan, [
      makeSurplus({ id: 'sp-long', productId: 'p1', qty: 4, expiresInDays: 5 }),
      makeSurplus({ id: 'sp-short', productId: 'p1', qty: 4, expiresInDays: 2 }),
    ], stores, recipients, new Set(), NOW)
    expect(days).toHaveLength(1)
    expect(days[0].dayOffset).toBe(2)
    expect(days[0].transferCount).toBe(1)
    expect(days[0].totalKg).toBeCloseTo(plan.totalKg)
  })

  it('скоропорт (истекает сегодня) везут сегодня, долго хранимое — в последний день недели', () => {
    const plan = buildMatchPlan(products, [
      makeSurplus({ id: 'sp-bread', productId: 'p1', qty: 6, expiresInDays: 0 }),
      makeSurplus({ id: 'sp-canned', productId: 'p2', qty: 10, expiresInDays: 300 }),
    ], [
      makeNeed({ id: 'n1', productId: 'p1', desiredQty: 6 }),
      makeNeed({ id: 'n2', recipientId: 'r2', productId: 'p2', desiredQty: 10 }),
    ])
    const days = planPickupSchedule(plan, [
      makeSurplus({ id: 'sp-bread', productId: 'p1', qty: 6, expiresInDays: 0 }),
      makeSurplus({ id: 'sp-canned', productId: 'p2', qty: 10, expiresInDays: 300 }),
    ], stores, recipients, new Set(), NOW)
    expect(days.map((d) => d.dayOffset)).toEqual([0, 6])
    expect(days[0].date.getTime()).toBe(NOW)
    expect(days[1].routes[0].transfers[0].storeId).toBe('s-near')
  })

  it('пустой план → пустой список дней', () => {
    const plan: MatchPlan = { transfers: [], totalKg: 0, personDays: 0 }
    expect(planPickupSchedule(plan, [], stores, recipients, new Set(), NOW)).toEqual([])
  })
})

describe('план вывозов: маршруты по расстоянию', () => {
  it('магазины одного пункта в один день сортируются от дальнего к пункту', () => {
    // s-far дальше от r1, чем s-near; оба товара истекают в один срок
    const surpluses = [
      makeSurplus({ id: 'sp1', storeId: 's-near', productId: 'p1', qty: 4, expiresInDays: 3 }),
      makeSurplus({ id: 'sp2', storeId: 's-far', productId: 'p1', qty: 4, expiresInDays: 3 }),
    ]
    const needs = [makeNeed({ id: 'n1', productId: 'p1', desiredQty: 8 })]
    const plan = buildMatchPlan(products, surpluses, needs)
    const days = planPickupSchedule(plan, surpluses, stores, recipients, new Set(), NOW)
    const route = days[0].routes[0]
    expect(route.transfers.map((s) => s.storeId)).toEqual(['s-far', 's-near'])
  })

  it('при равном расстоянии — стабильный порядок по id магазина', () => {
    const surpluses = [
      makeSurplus({ id: 'sp-a', storeId: 's-a', productId: 'p1', qty: 2, expiresInDays: 3 }),
      makeSurplus({ id: 'sp-b', storeId: 's-b', productId: 'p1', qty: 2, expiresInDays: 3 }),
    ]
    const needs = [makeNeed({ id: 'n1', productId: 'p1', desiredQty: 4 })]
    const plan = buildMatchPlan(products, surpluses, needs)
    const days = planPickupSchedule(plan, surpluses, stores, recipients, new Set(), NOW)
    expect(days[0].routes[0].transfers.map((s) => s.storeId)).toEqual(['s-a', 's-b'])
  })

  it('разные пункты назначения в один день дают отдельные маршруты', () => {
    const surpluses = [
      makeSurplus({ id: 'sp1', storeId: 's-near', productId: 'p1', qty: 6, expiresInDays: 2 }),
    ]
    const needs = [
      makeNeed({ id: 'n1', recipientId: 'r1', productId: 'p1', desiredQty: 3 }),
      makeNeed({ id: 'n2', recipientId: 'r2', productId: 'p1', desiredQty: 3 }),
    ]
    const plan = buildMatchPlan(products, surpluses, needs)
    const days = planPickupSchedule(plan, surpluses, stores, recipients, new Set(), NOW)
    expect(days[0].routes).toHaveLength(2)
    expect(days[0].transferCount).toBe(2)
  })

  it('статус передачи отражает подтверждение', () => {
    const surpluses = [makeSurplus({ id: 'sp1', productId: 'p1', qty: 6, expiresInDays: 2 })]
    const needs = [
      makeNeed({ id: 'n1', recipientId: 'r1', productId: 'p1', desiredQty: 3 }),
      makeNeed({ id: 'n2', recipientId: 'r2', productId: 'p1', desiredQty: 3 }),
    ]
    const plan = buildMatchPlan(products, surpluses, needs)
    const confirmed = new Set([plan.transfers[0].id])
    const days = planPickupSchedule(plan, surpluses, stores, recipients, confirmed, NOW)
    const statuses = days[0].routes.flatMap((r) => r.transfers.map((s) => s.status))
    expect(statuses).toContain('confirmed')
    expect(statuses).toContain('planned')
  })
})

describe('план вывозов на моках проекта', () => {
  it('дни отсортированы по возрастанию, суммы сходятся с планом', () => {
    const mockStores = stores
    const plan = buildMatchPlan(products, [
      makeSurplus({ id: 'sp-bread', productId: 'p1', qty: 8, expiresInDays: 1 }),
      makeSurplus({ id: 'sp-canned', productId: 'p2', qty: 12, expiresInDays: 200 }),
    ], [
      makeNeed({ id: 'n1', productId: 'p1', desiredQty: 8 }),
      makeNeed({ id: 'n2', recipientId: 'r2', productId: 'p2', desiredQty: 12 }),
    ])
    const days = planPickupSchedule(plan, [
      makeSurplus({ id: 'sp-bread', productId: 'p1', qty: 8, expiresInDays: 1 }),
      makeSurplus({ id: 'sp-canned', productId: 'p2', qty: 12, expiresInDays: 200 }),
    ], mockStores, recipients, new Set(), NOW)
    const offsets = days.map((d) => d.dayOffset)
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets)
    expect(days.reduce((sum, d) => sum + d.totalKg, 0)).toBeCloseTo(plan.totalKg)
    expect(days.reduce((sum, d) => sum + d.transferCount, 0)).toBe(plan.transfers.length)
  })
})
