import { describe, expect, it } from 'vitest'
import { buildMatchPlan } from './matching'
import { computeUncovered, uncoveredToBasketItems, uncoveredToRefillItem } from './uncovered'
import { transfersToCsv } from './csv'
import type { Need, Product, Surplus } from '../types'
import { needs as mockNeeds, products as mockProducts, surpluses as mockSurpluses } from '../data'

const products: Product[] = [
  { id: 'p1', name: 'Хлеб чёрный', category: 'bread', unit: 'батон', unitWeightKg: 0.5, shelfLifeDays: 5, price: 50, pricePerKg: 100 },
  { id: 'p2', name: 'Тушёнка говяжья', category: 'canned', unit: 'банка', unitWeightKg: 0.34, shelfLifeDays: 500, price: 120, pricePerKg: 353 },
]

function makeSurplus(p: Partial<Surplus> & Pick<Surplus, 'id' | 'productId' | 'qty'>): Surplus {
  return { storeId: 's1', expiresInDays: 10, status: 'available', ...p }
}

function makeNeed(p: Partial<Need> & Pick<Need, 'id' | 'productId' | 'desiredQty'>): Need {
  return { recipientId: 'r1', fulfilledQty: 0, priority: 'high', ...p }
}

describe('непокрытые нужды: остатки', () => {
  it('полностью закрытая нужда не попадает в список', () => {
    const plan = buildMatchPlan(products, [makeSurplus({ id: 'sp1', productId: 'p1', qty: 10 })], [
      makeNeed({ id: 'n1', productId: 'p1', desiredQty: 10 }),
    ])
    const s = computeUncovered(products, [makeNeed({ id: 'n1', productId: 'p1', desiredQty: 10 })], plan)
    expect(s.items).toEqual([])
    expect(s.coveredPct).toBe(100)
    expect(s.moneyPct).toBe(0)
  })

  it('частично покрытая нужда даёт остаток по количеству и весу', () => {
    const need = makeNeed({ id: 'n1', productId: 'p1', desiredQty: 10 })
    const plan = buildMatchPlan(products, [makeSurplus({ id: 'sp1', productId: 'p1', qty: 4 })], [need])
    const s = computeUncovered(products, [need], plan)
    expect(s.items).toHaveLength(1)
    expect(s.items[0].remainingQty).toBe(6)
    expect(s.items[0].remainingKg).toBeCloseTo(3) // 6 × 0,5 кг
  })

  it('уже полученное (fulfilled) вычитается из остатка', () => {
    const need = makeNeed({ id: 'n1', productId: 'p1', desiredQty: 10, fulfilledQty: 6 })
    const plan = buildMatchPlan(products, [makeSurplus({ id: 'sp1', productId: 'p1', qty: 10 })], [need])
    const s = computeUncovered(products, [need], plan)
    // закрыто ранее 6, план добирает 4 → остатка нет
    expect(s.items).toEqual([])
  })

  it('потребность сверх витрины целиком остаётся непокрытой', () => {
    const need = makeNeed({ id: 'n1', productId: 'p2', desiredQty: 20 })
    const plan = buildMatchPlan(products, [makeSurplus({ id: 'sp1', productId: 'p2', qty: 5 })], [need])
    const s = computeUncovered(products, [need], plan)
    expect(s.items[0].remainingQty).toBe(15)
    expect(s.totalRemainingKg).toBeCloseTo(15 * 0.34)
  })
})

describe('непокрытые нужды: стоимость закрытия', () => {
  it('стоимость позиции = остаток × цена единицы', () => {
    const need = makeNeed({ id: 'n1', productId: 'p1', desiredQty: 10 })
    const plan = buildMatchPlan(products, [makeSurplus({ id: 'sp1', productId: 'p1', qty: 4 })], [need])
    const s = computeUncovered(products, [need], plan)
    expect(s.items[0].cost).toBe(300) // 6 × 50 ₽
    expect(s.totalCost).toBe(300)
  })

  it('итого по высоким нуждам считается отдельно', () => {
    const high = makeNeed({ id: 'n1', recipientId: 'r1', productId: 'p1', desiredQty: 10, priority: 'high' })
    const medium = makeNeed({ id: 'n2', recipientId: 'r2', productId: 'p2', desiredQty: 10, priority: 'medium' })
    const plan = buildMatchPlan(products, [], [high, medium])
    const s = computeUncovered(products, [high, medium], plan)
    expect(s.highCost).toBe(500) // 10 × 50
    expect(s.totalCost).toBe(500 + 1200) // + 10 × 120
  })

  it('сортировка: высокие нужды раньше, внутри — по стоимости убыванию', () => {
    const needs = [
      makeNeed({ id: 'n1', recipientId: 'r1', productId: 'p1', desiredQty: 10, priority: 'medium' }),
      makeNeed({ id: 'n2', recipientId: 'r2', productId: 'p2', desiredQty: 10, priority: 'high' }),
      makeNeed({ id: 'n3', recipientId: 'r3', productId: 'p1', desiredQty: 5, priority: 'high' }),
    ]
    const s = computeUncovered(products, needs, buildMatchPlan(products, [], needs))
    expect(s.items.map((i) => i.needId)).toEqual(['n2', 'n3', 'n1'])
  })

  it('стоимость согласована с ценой за кг (допуск округления pricePerKg)', () => {
    const need = makeNeed({ id: 'n1', productId: 'p2', desiredQty: 20 })
    const s = computeUncovered(products, [need], buildMatchPlan(products, [], [need]))
    for (const item of s.items) {
      const product = products.find((p) => p.id === item.productId)
      expect(Math.abs(item.cost - item.remainingKg * (product?.pricePerKg ?? 0))).toBeLessThanOrEqual(1.01)
    }
  })
})

describe('непокрытые нужды: процент покрытия', () => {
  it('доля закрытого веса от открытых нужд', () => {
    // открытая потребность: 10 батонов = 5 кг; план покрывает 2 шт = 1 кг → 20%
    const need = makeNeed({ id: 'n1', productId: 'p1', desiredQty: 10 })
    const plan = buildMatchPlan(products, [makeSurplus({ id: 'sp1', productId: 'p1', qty: 2 })], [need])
    const s = computeUncovered(products, [need], plan)
    expect(s.coveredPct).toBe(20)
    expect(s.moneyPct).toBe(80)
  })

  it('пустой план при открытых нуждах — покрытие 0%', () => {
    const need = makeNeed({ id: 'n1', productId: 'p1', desiredQty: 10 })
    const s = computeUncovered(products, [need], buildMatchPlan(products, [], [need]))
    expect(s.coveredPct).toBe(0)
    expect(s.moneyPct).toBe(100)
  })
})

describe('непокрытые нужды на моках проекта', () => {
  const plan = buildMatchPlan(mockProducts, mockSurpluses, mockNeeds)
  const s = computeUncovered(mockProducts, mockNeeds, plan)

  it('итоговая стоимость равна сумме позиций', () => {
    expect(s.totalCost).toBe(s.items.reduce((sum, i) => sum + i.cost, 0))
  })

  it('остаток каждой нужды = желаемое − полученное − распределённое планом', () => {
    const allocated = new Map<string, number>()
    for (const t of plan.transfers) {
      for (const i of t.items) {
        const key = `${t.recipientId}|${i.productId}`
        allocated.set(key, (allocated.get(key) ?? 0) + i.qty)
      }
    }
    for (const n of mockNeeds) {
      const open = Math.max(0, n.desiredQty - n.fulfilledQty) - (allocated.get(`${n.recipientId}|${n.productId}`) ?? 0)
      const item = s.items.find((i) => i.needId === n.id)
      const expected = Math.max(0, open)
      if (expected === 0) {
        expect(item).toBeUndefined()
      } else {
        expect(item?.remainingQty).toBe(expected)
      }
    }
  })

  it('деньгами + излишками = 100%', () => {
    expect(s.coveredPct + s.moneyPct).toBe(100)
  })
})

describe('CSV-блок «Докупить за счёт Фонда»', () => {
  it('блок с позициями и итогом в конце файла плана', () => {
    const plan = buildMatchPlan(mockProducts, mockSurpluses, mockNeeds)
    const s = computeUncovered(mockProducts, mockNeeds, plan)
    const csv = transfersToCsv({
      transfers: plan.transfers,
      confirmed: new Set(),
      products: mockProducts,
      stores: [],
      recipients: [],
      uncovered: s,
    })
    expect(csv.includes('Докупить за счёт Фонда')).toBe(true)
    expect(csv.includes('ИТОГО за счёт Фонда')).toBe(true)
    expect(csv.includes(`Излишками покрыто;${s.coveredPct}% веса открытых нужд`)).toBe(true)
    // позиция с приоритетом и стоимостью
    expect(csv.includes('Высокий')).toBe(true)
    expect(csv.includes(s.totalCost.toLocaleString('ru-RU'))).toBe(true)
  })

  it('без непокрытых нужд блок не добавляется', () => {
    const csv = transfersToCsv({
      transfers: [],
      confirmed: new Set(),
      products: mockProducts,
      stores: [],
      recipients: [],
    })
    expect(csv.includes('Докупить за счёт Фонда')).toBe(false)
  })
})

describe('дефицит → позиции набора калькулятора', () => {
  it('одна позиция: товар, остаток, пометка докупки и пункт', () => {
    const item = uncoveredToRefillItem({
      needId: 'n03',
      recipientId: 'r1',
      productId: 'p26',
      remainingQty: 7,
      remainingKg: 2.4,
      priority: 'medium',
      cost: 840,
    })
    expect(item).toEqual({ productId: 'p26', qty: 7, refillOf: 'n03', recipientId: 'r1' })
  })

  it('весь дефицит маппится 1:1 по позициям', () => {
    const plan = buildMatchPlan(mockProducts, mockSurpluses, mockNeeds)
    const s = computeUncovered(mockProducts, mockNeeds, plan)
    const refills = uncoveredToBasketItems(s)
    expect(refills).toHaveLength(s.items.length)
    for (const [i, item] of s.items.entries()) {
      expect(refills[i].productId).toBe(item.productId)
      expect(refills[i].qty).toBe(item.remainingQty)
      expect(refills[i].refillOf).toBe(item.needId)
      expect(refills[i].recipientId).toBe(item.recipientId)
    }
  })
})
