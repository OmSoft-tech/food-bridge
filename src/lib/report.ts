import type { Product } from '../types'
import { escapeHtml, formatCoverage, formatKg, formatMoney, formatNumber, formatTime } from './format'
import { PRIORITY_LABEL } from './nutrition'
import type { MatchPlan } from './matching'
import { actionLabel, type HistoryEntry } from './journal'
import type { PickupDay } from './schedule'
import type { UncoveredSummary } from './uncovered'

/** Единый источник печатного лейаута: и для печати, и для HTML-файла. */
export const REPORT_CSS = `
* { box-sizing: border-box }
body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #1a1a1a; margin: 24px; font-size: 12px; line-height: 1.45 }
h1 { font-size: 20px; margin: 0 0 4px }
h2 { font-size: 14px; margin: 18px 0 6px; border-bottom: 1px solid #ccc; padding-bottom: 3px }
.report__meta { color: #555; font-size: 11px; margin-bottom: 12px }
table { width: 100%; border-collapse: collapse; margin: 6px 0 12px }
th, td { border: 1px solid #bbb; padding: 4px 6px; text-align: left; vertical-align: top; font-size: 11px }
th { background: #eee; font-weight: 600 }
.summary td { border: none; padding: 2px 14px 2px 0; font-size: 12px; vertical-align: bottom }
.summary b { font-size: 15px }
.route { margin: 2px 0 8px; padding-left: 12px }
.total td { font-weight: 700; background: #f5f5f5 }
.muted { color: #777 }
`

export interface ReportData {
  plan: MatchPlan
  /** подтверждённые id текущего (базового) плана; для сценария — пусто */
  confirmed: Set<string>
  scenarioLabel: string
  schedule: PickupDay[]
  uncovered: UncoveredSummary
  history: HistoryEntry[]
  products: Product[]
  /** для резолва имён в секциях */
  storeNames: Map<string, string>
  recipientNames: Map<string, string>
  productNames: Map<string, string>
}

const DAY_MS = 86_400_000
const JOURNAL_WINDOW_DAYS = 7

/** Отчёт для координатора одним HTML-документом (самодостаточный, со стилями). */
export function buildReportHtml(data: ReportData, now = Date.now()): string {
  const { plan, uncovered, schedule } = data
  const dateLabel = new Date(now).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  // План передач таблицей
  const transfersRows = plan.transfers
    .map((t, i) => {
      const storeName = data.storeNames.get(t.storeId) ?? t.storeId
      const recipientName = data.recipientNames.get(t.recipientId) ?? t.recipientId
      const items = t.items
        .map((item) => {
          const name = data.productNames.get(item.productId) ?? item.productId
          return `${escapeHtml(name)} — ${item.qty}`
        })
        .join('<br>')
      const status = data.confirmed.has(t.id) ? 'подтверждено' : 'запланировано'
      return [
        `<tr>`,
        `<td>${i + 1}</td>`,
        `<td>${escapeHtml(storeName)}</td>`,
        `<td>${escapeHtml(recipientName)}</td>`,
        `<td>${items}</td>`,
        `<td>${escapeHtml(formatKg(t.totalKg))}</td>`,
        `<td>${escapeHtml(formatCoverage(t.personDays))}</td>`,
        `<td>${status}</td>`,
        `</tr>`,
      ].join('')
    })
    .join('')

  // План вывозов по дням
  const scheduleBlocks = schedule
    .map((day) => {
      const date = day.date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
      const routes = day.routes
        .map((route) => {
          const chain = route.transfers
            .map((s) => `${escapeHtml(data.storeNames.get(s.storeId) ?? s.storeId)} (${escapeHtml(formatKg(s.totalKg))})`)
            .join(' → ')
          return `<div class="route">${chain} → <b>${escapeHtml(data.recipientNames.get(route.recipientId) ?? route.recipientId)}</b></div>`
        })
        .join('')
      return `<h3>${escapeHtml(date)} — ${day.transferCount} передач(и), ${escapeHtml(formatKg(day.totalKg))}</h3>${routes}`
    })
    .join('')

  // Непокрытые нужды
  const uncoveredRows = uncovered.items
    .map((item) => {
      const recipientName = data.recipientNames.get(item.recipientId) ?? item.recipientId
      const productName = data.productNames.get(item.productId) ?? item.productId
      return [
        `<tr>`,
        `<td>${escapeHtml(recipientName)}</td>`,
        `<td>${escapeHtml(productName)}</td>`,
        `<td>${PRIORITY_LABEL[item.priority]}</td>`,
        `<td>${item.remainingQty}</td>`,
        `<td>${escapeHtml(formatKg(item.remainingKg))}</td>`,
        `<td>${escapeHtml(formatMoney(item.cost))}</td>`,
        `</tr>`,
      ].join('')
    })
    .join('')

  // Журнал за последние 7 дней
  const journal = data.history
    .filter((e) => e.ts >= now - JOURNAL_WINDOW_DAYS * DAY_MS)
    .slice()
    .reverse()
    .map(
      (e) =>
        `<tr><td>${escapeHtml(formatTime(e.ts))}</td><td>${escapeHtml(actionLabel(e.action))}</td><td>${escapeHtml(e.label)}</td></tr>`,
    )
    .join('')
  const journalBody = journal || `<tr><td colspan="3" class="muted">нет записей за последние 7 дней</td></tr>`

  const coveredPct = uncovered.coveredPct
  const moneyPct = uncovered.moneyPct

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Отчёт для Фонда — план передач</title>
<style>${REPORT_CSS}</style>
</head>
<body>
<h1>Отчёт для Фонда — план передач</h1>
<div class="report__meta">Дата отчёта: ${escapeHtml(dateLabel)} · Сценарий: ${escapeHtml(data.scenarioLabel)}</div>

<h2>Сводка</h2>
<table class="summary">
<tr><td><b>${plan.transfers.length}</b><br>передач</td><td><b>${escapeHtml(formatKg(plan.totalKg))}</b><br>общий вес</td><td><b>${formatNumber(plan.personDays)}</b><br>чел.-дней покрытия</td><td><b>${coveredPct}%</b><br>покрыто излишками</td><td><b>${moneyPct}%</b><br>закрывается деньгами</td></tr>
</table>

<h2>План передач (${plan.transfers.length})</h2>
<table>
<thead><tr><th>№</th><th>Магазин</th><th>Пункт помощи</th><th>Состав</th><th>Вес</th><th>Покрытие</th><th>Статус</th></tr></thead>
<tbody>${transfersRows}</tbody>
</table>

<h2>План вывозов на неделю</h2>
${scheduleBlocks || '<p class="muted">нет передач</p>'}

<h2>Непокрытые нужды — докупить за счёт Фонда</h2>
${
  uncovered.items.length > 0
    ? `<table>
<thead><tr><th>Пункт помощи</th><th>Товар</th><th>Приоритет</th><th>Остаток</th><th>Вес</th><th>Стоимость</th></tr></thead>
<tbody>${uncoveredRows}
<tr class="total"><td colspan="5">Итого докупка</td><td>${escapeHtml(formatMoney(uncovered.totalCost))}</td></tr>
<tr class="total"><td colspan="5">В том числе по высоким нуждам</td><td>${escapeHtml(formatMoney(uncovered.highCost))}</td></tr>
</tbody>
</table>
<p class="muted">Покрытие открытых нужд: ${coveredPct}% излишками, ${moneyPct}% — деньгами.</p>`
    : '<p>Все открытые нужды закрыты излишками — докупка не требуется.</p>'
}

<h2>Журнал действий за последние 7 дней</h2>
<table>
<thead><tr><th>Время</th><th>Тип действия</th><th>Событие</th></tr></thead>
<tbody>${journalBody}</tbody>
</table>
</body>
</html>`
}

export function reportFilename(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `food-bridge-report-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.html`
}
