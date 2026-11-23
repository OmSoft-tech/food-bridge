import { describe, expect, it } from 'vitest'
import { buildMatchPlan } from './matching'
import { computeUncovered } from './uncovered'
import { planPickupSchedule } from './schedule'
import { buildReportHtml, reportFilename } from './report'
import { needs as mockNeeds, products as mockProducts, surpluses as mockSurpluses, stores as mockStores, recipients as mockRecipients } from '../data'

const NOW = new Date('2026-11-23T12:00:00').getTime()

function makeData(now = NOW) {
  const plan = buildMatchPlan(mockProducts, mockSurpluses, mockNeeds)
  return {
    plan,
    confirmed: new Set([plan.transfers[0]?.id ?? '']),
    scenarioLabel: 'базовый — сроки годности, без лимита',
    schedule: planPickupSchedule(plan, mockSurpluses, mockStores, mockRecipients, new Set(), now),
    uncovered: computeUncovered(mockProducts, mockNeeds, plan),
    history: [
      { ts: now - 86_400_000, action: 'confirm' as const, label: 'подтверждена передача #t1' },
      { ts: now - 30 * 86_400_000, action: 'build' as const, label: 'старый план — месяц назад' },
    ],
    products: mockProducts,
    storeNames: new Map(mockStores.map((s) => [s.id, `${s.name} (${s.address})`])),
    recipientNames: new Map(mockRecipients.map((r) => [r.id, `${r.name} (${r.address})`])),
    productNames: new Map(mockProducts.map((p) => [p.id, p.name])),
  }
}

describe('отчёт для координатора', () => {
  it('самодостаточный HTML: doctype, стили, шапка с датой и сценарием', () => {
    const html = buildReportHtml(makeData(), NOW)
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html.includes('lang="ru"')).toBe(true)
    expect(html.includes('Отчёт для Фонда — план передач')).toBe(true)
    expect(html.includes('Сценарий: базовый — сроки годности, без лимита')).toBe(true)
    expect(html.includes('<style>')).toBe(true)
    expect(html.includes('charset="utf-8"')).toBe(true)
  })

  it('сводка, таблица передач, статусы подтверждений', () => {
    const html = buildReportHtml(makeData(), NOW)
    expect(html.includes('21</b><br>передач') || html.includes('передач</td>')).toBe(true)
    expect(html.includes('общий вес')).toBe(true)
    expect(html.includes('чел.-дней покрытия')).toBe(true)
    expect(html.includes('>подтверждено<')).toBe(true)
    expect(html.includes('>запланировано<')).toBe(true)
  })

  it('план вывозов по дням и непокрытые нужды с суммой докупки', () => {
    const html = buildReportHtml(makeData(), NOW)
    expect(html.includes('План вывозов на неделю')).toBe(true)
    expect(html.includes('Непокрытые нужды — докупить за счёт Фонда')).toBe(true)
    expect(html.includes('Итого докупка')).toBe(true)
    expect(html.includes('В том числе по высоким нуждам')).toBe(true)
    expect(html.includes('Покрытие открытых нужд')).toBe(true)
  })

  it('журнал: записи за 7 дней включены, старые — исключены', () => {
    const html = buildReportHtml(makeData(), NOW)
    expect(html.includes('подтверждена передача #t1')).toBe(true)
    expect(html.includes('старый план — месяц назад')).toBe(false)
  })

  it('имя файла с датой', () => {
    expect(reportFilename(new Date('2026-11-23'))).toBe('food-bridge-report-2026-11-23.html')
  })
})
