import { describe, expect, it } from 'vitest'
import { filterJournal, type HistoryEntry, type JournalFilters } from './journal'
import { journalToCsv } from './csv'

/** Локальные конструкторы дат — согласованы с dayStart/dayEnd filterJournal. */
const ts = (iso: string): number => new Date(iso).getTime()

const entries: HistoryEntry[] = [
  { ts: ts('2026-11-20T10:00:00'), action: 'build', label: 'построен план: 21 передача, 351,7 кг' },
  { ts: ts('2026-11-20T10:05:00'), action: 'confirm', label: 'подтверждена передача #t1: Пятёрочка №4534 → Продуктовый фонд «Накормим всех», 25 кг' },
  { ts: ts('2026-11-21T12:30:00'), action: 'calc-add', label: 'добавлен товар: Молоко пастеризованное 2,5% × 40 пак.' },
  { ts: ts('2026-11-22T09:15:00'), action: 'reset', label: 'план сброшен' },
  { ts: ts('2026-11-22T09:20:00'), action: 'export', label: 'план передач экспортирован в CSV (21 передач, 351,7 кг)' },
  { ts: ts('2026-11-23T08:00:00'), action: 'confirm', label: 'подтверждена передача #t3: Карусель №201 → Продуктовый фонд «Накормим всех», 15 кг' },
]

const all: JournalFilters = { action: 'all', from: null, to: null, query: '' }

describe('журнал: фильтр по типу действия', () => {
  it('возвращает только записи выбранного типа', () => {
    const visible = filterJournal(entries, { ...all, action: 'confirm' })
    expect(visible).toHaveLength(2)
    expect(visible.every((e) => e.action === 'confirm')).toBe(true)
  })

  it('тип без записей → пусто', () => {
    expect(filterJournal(entries, { ...all, action: 'calc-clear' })).toEqual([])
  })

  it('all возвращает всё', () => {
    expect(filterJournal(entries, all)).toHaveLength(entries.length)
  })
})

describe('журнал: фильтр по диапазону дат (включительно)', () => {
  it('дата «с» включает события этого же дня', () => {
    const visible = filterJournal(entries, { ...all, from: '2026-11-21' })
    expect(visible).toHaveLength(4)
    expect(visible.every((e) => e.ts >= ts('2026-11-21T00:00:00'))).toBe(true)
  })

  it('дата «по» включает события до конца дня', () => {
    const visible = filterJournal(entries, { ...all, to: '2026-11-21' })
    expect(visible).toHaveLength(3)
    expect(visible.every((e) => e.ts <= ts('2026-11-21T23:59:59.999'))).toBe(true)
  })

  it('обе границы — инвервал по датам', () => {
    const visible = filterJournal(entries, { ...all, from: '2026-11-21', to: '2026-11-22' })
    expect(visible).toHaveLength(3)
  })

  it('вне диапазона → пусто', () => {
    expect(filterJournal(entries, { ...all, from: '2025-01-01', to: '2025-12-31' })).toEqual([])
  })
})

describe('журнал: поиск по тексту', () => {
  it('регистронезависимый поиск по подстроке', () => {
    const visible = filterJournal(entries, { ...all, query: 'ПЯТЁРОЧКА' })
    expect(visible).toHaveLength(1)
    expect(visible[0].action).toBe('confirm')
  })

  it('ищет и по товару в событиях калькулятора', () => {
    const visible = filterJournal(entries, { ...all, query: 'молоко' })
    expect(visible).toHaveLength(1)
    expect(visible[0].action).toBe('calc-add')
  })

  it('пробелы в запросе обрезаются', () => {
    expect(filterJournal(entries, { ...all, query: '  план  ' })).toHaveLength(3)
  })

  it('нет совпадений → пусто', () => {
    expect(filterJournal(entries, { ...all, query: 'авторизация' })).toEqual([])
  })
})

describe('журнал: комбинированные фильтры (И)', () => {
  it('тип + дата + поиск одновременно', () => {
    const visible = filterJournal(entries, {
      action: 'confirm',
      from: '2026-11-20',
      to: '2026-11-20',
      query: 'передача',
    })
    expect(visible).toHaveLength(1)
    expect(visible[0].ts).toBe(ts('2026-11-20T10:05:00'))
  })
})

describe('журнал: CSV-экспорт', () => {
  it('BOM, заголовок и строка на запись с учётом фильтров', () => {
    const visible = filterJournal(entries, { ...all, action: 'reset' })
    const csv = journalToCsv(visible)
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    const lines = csv.slice(1).split('\r\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('Время;Тип действия;Событие')
    expect(lines[1]).toContain('Сброс плана')
    expect(lines[1]).toContain('план сброшен')
  })

  it('пустой журнал → только заголовок', () => {
    const csv = journalToCsv([])
    expect(csv.slice(1)).toBe('Время;Тип действия;Событие')
  })

})
