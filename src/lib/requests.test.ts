import { describe, expect, it } from 'vitest'
import {
  dedupeRequests,
  nextRequestId,
  parseRequests,
  validateRequestDraft,
  type OperatorRequest,
} from './requests'
import { buildMatchPlan } from './matching'
import { computeUncovered } from './uncovered'
import type { Need, Product, Surplus } from '../types'

const products: Product[] = [
  { id: 'p1', name: 'Хлеб чёрный', category: 'bread', unit: 'батон', unitWeightKg: 0.5, shelfLifeDays: 5, price: 50, pricePerKg: 100 },
]

function makeSurplus(p: Partial<Surplus> & Pick<Surplus, 'id' | 'productId' | 'qty'>): Surplus {
  return { storeId: 's1', expiresInDays: 10, status: 'available', ...p }
}

function makeNeed(p: Partial<Need> & Pick<Need, 'id' | 'productId' | 'desiredQty'>): Need {
  return { recipientId: 'r1', fulfilledQty: 0, priority: 'high', ...p }
}

function makeRequest(id: string, desiredQty = 5, productId = 'p1'): OperatorRequest {
  return {
    id,
    recipientId: 'r1',
    productId,
    desiredQty,
    fulfilledQty: 0,
    priority: 'high',
    createdAt: 1764000000000,
  }
}

describe('валидация формы заявки', () => {
  it('пустой пункт — ошибка', () => {
    expect(
      validateRequestDraft({ recipientId: '', productId: 'p1', qty: 5, priority: 'high' }),
    ).toContain('пункт помощи')
  })

  it('пустой товар — ошибка', () => {
    expect(
      validateRequestDraft({ recipientId: 'r1', productId: '', qty: 5, priority: 'high' }),
    ).toContain('товар')
  })

  it('количество 0, отрицательное и NaN — ошибка', () => {
    for (const qty of [0, -3, Number.NaN]) {
      expect(
        validateRequestDraft({ recipientId: 'r1', productId: 'p1', qty, priority: 'high' }),
      ).toContain('количество')
    }
  })

  it('валидный черновик — null', () => {
    expect(
      validateRequestDraft({ recipientId: 'r1', productId: 'p1', qty: 5, priority: 'medium' }),
    ).toBeNull()
  })
})

describe('localStorage: парсинг и дедуп', () => {
  it('валидные записи читаются, битые отбрасываются', () => {
    const raw = JSON.stringify([
      makeRequest('req-1'),
      { id: 'req-2', recipientId: 'r1', productId: 'p1', desiredQty: 0, fulfilledQty: 0, priority: 'high', createdAt: 1 },
      { id: 'req-3', recipientId: 'r1', productId: 'p1', desiredQty: 5, fulfilledQty: 9, priority: 'high', createdAt: 1 },
      { id: 'req-4', recipientId: 'r1', productId: 'p1', desiredQty: 5, fulfilledQty: 0, priority: 'критический', createdAt: 1 },
      'мусор',
      { id: 'req-5', recipientId: 'r1', productId: 'p1', desiredQty: 5, fulfilledQty: 0, priority: 'medium' },
    ])
    const parsed = parseRequests(raw)
    expect(parsed.map((r) => r.id)).toEqual(['req-1'])
  })

  it('битый JSON и null дают пустой список', () => {
    expect(parseRequests(null)).toEqual([])
    expect(parseRequests('{broken')).toEqual([])
    expect(parseRequests('"строка"')).toEqual([])
  })

  it('dedupeRequests убирает повторные id', () => {
    const list = [makeRequest('req-1'), makeRequest('req-1'), makeRequest('req-2')]
    expect(dedupeRequests(list).map((r) => r.id)).toEqual(['req-1', 'req-2'])
  })

  it('nextRequestId выдаёт уникальные id', () => {
    const existing = [makeRequest('req-1764000000000-1'), makeRequest('req-1764000000000-2')]
    const id = nextRequestId(existing, 1764000000000)
    expect(existing.some((r) => r.id === id)).toBe(false)
    expect(dedupeRequests([...existing, makeRequest(id)]).length).toBe(3)
  })
})

describe('заявки в мэтчинге', () => {
  it('заявка того же товара, что уже полностью покрыта моком, создаёт дефицит', () => {
    const surpluses = [makeSurplus({ id: 'sp1', productId: 'p1', qty: 10 })]
    const mockNeeds = [makeNeed({ id: 'n1', productId: 'p1', desiredQty: 10 })]
    const request = makeRequest('req-1', 5)

    // без заявки: всё покрыто
    const base = buildMatchPlan(products, surpluses, mockNeeds)
    expect(computeUncovered(products, mockNeeds, base).items).toHaveLength(0)

    // с заявкой: дефицит 5 шт = 250 ₽
    const withRequest = buildMatchPlan(products, surpluses, [...mockNeeds, request])
    const uncovered = computeUncovered(products, [...mockNeeds, request], withRequest)
    expect(uncovered.items).toHaveLength(1)
    expect(uncovered.items[0].remainingQty).toBe(5)
    expect(uncovered.items[0].needId).toBe('req-1')
    expect(uncovered.totalCost).toBe(250)
  })

  it('заявка на новый товар добавляет передачу в план', () => {
    const p2: Product = { id: 'p2', name: 'Тушёнка', category: 'canned', unit: 'банка', unitWeightKg: 0.34, shelfLifeDays: 500, price: 120, pricePerKg: 353 }
    const surpluses = [
      makeSurplus({ id: 'sp1', productId: 'p1', qty: 10 }),
      makeSurplus({ id: 'sp2', productId: 'p2', qty: 5 }),
    ]
    const mockNeeds = [makeNeed({ id: 'n1', productId: 'p1', desiredQty: 10 })]
    const request = makeRequest('req-1', 3, 'p2')

    const plan = buildMatchPlan([...products, p2], surpluses, [...mockNeeds, request])
    const item = plan.transfers.flatMap((t) => t.items).find((i) => i.needId === 'req-1')
    expect(item?.qty).toBe(3)
    expect(item?.productId).toBe('p2')
  })
})
