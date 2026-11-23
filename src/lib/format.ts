/** Форматирование значений для витрин и сводок (ru-RU). */

export function formatKg(kg: number): string {
  return `${kg.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} кг`
}

export function formatNumber(n: number): string {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 0 })
}

export function formatKcal(kcal: number): string {
  return `${formatNumber(kcal)} ккал`
}

export function formatMoney(rub: number): string {
  return `${formatNumber(rub)} ₽`
}

/** «23 ноя, 15:12» — для истории действий. */
export function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Экранирование для вставки в HTML-попапы карты. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPE_MAP[c] ?? c)
}

const dayMs = 86_400_000

/** Дата истечения срока годности излишка. */
export function expiryDate(expiresInDays: number, now = Date.now()): Date {
  return new Date(now + expiresInDays * dayMs)
}

/** «24 ноя» — компактная дата для карточки. */
export function formatExpiryDate(expiresInDays: number, now = Date.now()): string {
  return expiryDate(expiresInDays, now).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  })
}

/**
 * Порог «срочности» излишка: critical — исчезнет из витрины в первую очередь.
 * Хлеб и скоропорт (≤2 дней) — red, ≤5 дней — amber, дальше — ok.
 */
export function expiryUrgency(expiresInDays: number): 'critical' | 'soon' | 'ok' {
  if (expiresInDays <= 2) return 'critical'
  if (expiresInDays <= 5) return 'soon'
  return 'ok'
}

export function formatExpiry(expiresInDays: number, now = Date.now()): string {
  const d = expiresInDays === 1 ? '1 день' : expiresInDays < 5 ? `${expiresInDays} дня` : `${expiresInDays} дн.`
  return `${formatExpiryDate(expiresInDays, now)} · через ${d}`
}

/**
 * «Покроет X человек на Y дней» — грубая интерпретация человеко-дней:
 * выбираем горизонт (1/2/3/7 дней) и делим на него. Для демо этого достаточно,
 * в реальном продукте горизонт задаёт пункт помощи.
 */
export function coveragePeopleDays(personDays: number): { people: number; days: number } {
  const days = personDays >= 210 ? 7 : personDays >= 90 ? 3 : personDays >= 30 ? 2 : 1
  return { people: Math.max(1, Math.round(personDays / days)), days }
}

export function formatCoverage(personDays: number): string {
  const { people, days } = coveragePeopleDays(personDays)
  return `≈ ${people} чел. × ${days} дн.`
}
