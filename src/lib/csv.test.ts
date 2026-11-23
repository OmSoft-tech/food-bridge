import { describe, expect, it } from 'vitest'
import { csvField, journalToCsv, transfersToCsv } from './csv'
import type { Product, Recipient, Store } from '../types'
import type { Transfer } from './matching'

describe('csvField — защита от formula injection', () => {
  it('префиксует ячейку, начинающуюся с =, +, @ или -', () => {
    expect(csvField('=1+1')).toBe("'=1+1")
    expect(csvField('+79161234567')).toBe("'+79161234567")
    expect(csvField('@import')).toBe("'@import")
    expect(csvField('-2')).toBe("'-2")
  })

  it('не трогает безопасные значения', () => {
    expect(csvField('Молоко пастеризованное')).toBe('Молоко пастеризованное')
    expect(csvField(25)).toBe('25')
  })

  it('экранирует разделитель и кавычки', () => {
    expect(csvField('a;b')).toBe('"a;b"')
    expect(csvField('a"b')).toBe('"a""b"')
  })
})

describe('transfersToCsv — каркас', () => {
  const store: Store = {
    id: 's1',
    name: 'Пятёрочка №1',
    chain: 'Пятёрочка',
    address: 'ул. Тестовая, 1',
    district: 'ЦАО',
    lat: 55.75,
    lon: 37.61,
  }
  const recipient: Recipient = {
    id: 'r1',
    name: 'Фонд «Тест»',
    address: 'ул. Помощи, 2',
    district: 'САО',
    lat: 55.8,
    lon: 37.5,
  }
  const product: Product = {
    id: 'p1',
    name: 'Молоко 2,5%',
    category: 'dairy',
    unit: 'пак.',
    unitWeightKg: 1,
    shelfLifeDays: 7,
    price: 80,
    pricePerKg: 80,
  }
  const transfer: Transfer = {
    id: 't1',
    storeId: 's1',
    recipientId: 'r1',
    items: [{ productId: 'p1', surplusId: 'sv1', qty: 10, needId: 'n1' }],
    totalKg: 10,
    personDays: 20,
    status: 'planned',
  }

  it('содержит заголовок, позицию и итог по передаче', () => {
    const csv = transfersToCsv({
      transfers: [transfer],
      confirmed: new Set(),
      products: [product],
      stores: [store],
      recipients: [recipient],
    })
    const lines = csv.replace(/^\uFEFF/, '').split('\r\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain('Магазин')
    expect(lines[1]).toContain('Молоко 2,5%')
    expect(lines[2]).toContain('ИТОГО по передаче')
    expect(csv.charCodeAt(0)).toBe(0xfeff) // BOM
  })
})

describe('journalToCsv', () => {
  it('записывает время, тип и событие', () => {
    const csv = journalToCsv([{ ts: Date.parse('2026-11-23T12:00:00'), action: 'build', label: 'тест' }])
    const lines = csv.replace(/^\uFEFF/, '').split('\r\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('Тип действия')
    expect(lines[1]).toContain('тест')
    expect(lines[1]).toContain('Построение плана')
  })
})
