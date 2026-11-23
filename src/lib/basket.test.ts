import { describe, expect, it } from 'vitest'
import { basketsForBudget, computeBasket, basketItemKey, mergeRefillItems, type BasketItem } from './basket'
import { products as mockProducts } from '../data'
import { PRESET } from '../components/CalculatorScreen'
import type { Product } from '../types'

/** Синтетический справочник с точными весами для арифметики. */
const products: Product[] = [
  { id: 'bread', name: 'Хлеб', category: 'bread', unit: 'батон', unitWeightKg: 0.5, shelfLifeDays: 3, price: 50, pricePerKg: 100 },
  { id: 'cereal', name: 'Крупа', category: 'grocery', unit: 'пак.', unitWeightKg: 2.0, shelfLifeDays: 300, price: 90, pricePerKg: 45 },
  { id: 'meat', name: 'Фарш', category: 'meat', unit: 'упак.', unitWeightKg: 0.5, shelfLifeDays: 4, price: 200, pricePerKg: 400 },
]

describe('калькулятор: нормы человеко-дня', () => {
  it('5 кг хлеба → 25 человеко-дней (норма 0,2 кг/чел·день)', () => {
    const s = computeBasket(products, [{ productId: 'bread', qty: 10 }])
    expect(s.totalKg).toBeCloseTo(5)
    expect(s.personDays).toBeCloseTo(25)
  })

  it('калорийность по категории: 2 кг бакалеи × 3300 ккал/кг', () => {
    const s = computeBasket(products, [{ productId: 'cereal', qty: 1 }])
    expect(s.totalKcal).toBeCloseTo(6600)
  })

  it('смешанный набор суммирует человеко-дни по категориям', () => {
    const s = computeBasket(products, [
      { productId: 'bread', qty: 10 }, // 5 кг → 25 чел.-дн.
      { productId: 'meat', qty: 2 }, // 1 кг → 6,25 чел.-дн.
    ])
    expect(s.personDays).toBeCloseTo(25 + 1 / 0.16)
    expect(s.kgByCategory.get('bread')).toBeCloseTo(5)
    expect(s.kgByCategory.get('meat')).toBeCloseTo(1)
  })
})

describe('калькулятор: стоимость и бюджет', () => {
  it('стоимость = количество × цена единицы', () => {
    const s = computeBasket(products, [{ productId: 'bread', qty: 3 }])
    expect(s.totalCost).toBe(150)
  })

  it('пустой набор — нули', () => {
    const s = computeBasket(products, [])
    expect(s.totalKg).toBe(0)
    expect(s.totalKcal).toBe(0)
    expect(s.totalCost).toBe(0)
    expect(s.personDays).toBe(0)
  })

  it('неизвестный товар игнорируется', () => {
    const s = computeBasket(products, [{ productId: 'ghost', qty: 5 }])
    expect(s.totalKg).toBe(0)
    expect(s.totalCost).toBe(0)
  })
})

describe('basketsForBudget', () => {
  it('20000 ₽ / 10000 ₽ → 2 набора', () => {
    expect(basketsForBudget(20000, 10000)).toBe(2)
  })

  it('бюджета не хватает на полный набор → 0', () => {
    expect(basketsForBudget(5000, 10000)).toBe(0)
  })

  it('ноль бюджета или нулевая стоимость → 0 без деления на ноль', () => {
    expect(basketsForBudget(0, 10000)).toBe(0)
    expect(basketsForBudget(10000, 0)).toBe(0)
  })

  it('25 ₽ за человеко-день из демо-набора: стоимость ÷ человеко-дни', () => {
    const s = computeBasket(mockProducts, PRESET)
    expect(basketsForBudget(20000, s.totalCost)).toBe(2)
    expect(s.totalCost).toBe(10000)
    expect(s.totalCost / s.personDays).toBeCloseTo(25, 0)
  })
})

describe('mergeRefillItems: докупки без дублей', () => {
  const refill = (productId: string, recipientId: string, qty = 1): BasketItem => ({
    productId,
    qty,
    refillOf: `need-${productId}-${recipientId}`,
    recipientId,
  })

  it('пустой набор — все позиции добавляются', () => {
    const r = mergeRefillItems([], [refill('p1', 'r1'), refill('p2', 'r2')])
    expect(r.added).toBe(2)
    expect(r.skipped).toBe(0)
    expect(r.items).toHaveLength(2)
  })

  it('повторная отправка того же дефицита не дублирует позиции', () => {
    const refills = [refill('p1', 'r1', 6)]
    const first = mergeRefillItems([], refills)
    const second = mergeRefillItems(first.items, refills)
    expect(second.added).toBe(0)
    expect(second.skipped).toBe(1)
    expect(second.items).toHaveLength(1)
    expect(second.items[0].qty).toBe(6)
  })

  it('дедуп по товару + пункту: другой needId того же товара и пункта пропускается', () => {
    const existing: BasketItem[] = [{ productId: 'p1', qty: 3, refillOf: 'need-old', recipientId: 'r1' }]
    const res = mergeRefillItems(existing, [refill('p1', 'r1', 6)])
    expect(res.added).toBe(0)
  })

  it('тот же товар, но другой пункт — добавляется', () => {
    const existing: BasketItem[] = [{ productId: 'p1', qty: 3, refillOf: 'need-old', recipientId: 'r1' }]
    const res = mergeRefillItems(existing, [refill('p1', 'r2', 6)])
    expect(res.added).toBe(1)
    expect(res.items).toHaveLength(2)
  })

  it('обычная позиция того же товара не блокирует докупку', () => {
    const existing: BasketItem[] = [{ productId: 'p1', qty: 10 }]
    const res = mergeRefillItems(existing, [refill('p1', 'r1', 6)])
    expect(res.added).toBe(1)
    expect(res.items).toHaveLength(2)
  })

  it('ключи позиций уникальны после слияния', () => {
    const res = mergeRefillItems(
      [{ productId: 'p1', qty: 10 }],
      [refill('p1', 'r1'), refill('p1', 'r2')],
    )
    const keys = res.items.map(basketItemKey)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
