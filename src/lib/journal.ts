/**
 * Журнал действий оператора: единый тип записи, фильтрация и словарь типов.
 * Записи персистятся в localStorage (food-bridge.history.v1).
 */

export type HistoryAction =
  | 'build' // построен план передач
  | 'confirm' // подтверждена передача
  | 'reset' // план сброшен
  | 'export' // план экспортирован в CSV
  | 'calc-add' // в калькулятор добавлена позиция
  | 'calc-remove' // из калькулятора удалена позиция
  | 'calc-clear' // калькулятор очищен
  | 'calc-preset' // подставлен пример набора

export interface HistoryEntry {
  ts: number
  action: HistoryAction
  label: string
}

export interface JournalFilters {
  /** конкретный тип или 'all' */
  action: HistoryAction | 'all'
  /** дата «с», 'YYYY-MM-DD' включительно, null — не задано */
  from: string | null
  /** дата «по», 'YYYY-MM-DD' включительно, null — не задано */
  to: string | null
  /** поиск по тексту события, регистронезависимый */
  query: string
}

export const JOURNAL_ACTIONS: { id: HistoryAction; label: string }[] = [
  { id: 'build', label: 'Построение плана' },
  { id: 'confirm', label: 'Подтверждение передачи' },
  { id: 'reset', label: 'Сброс плана' },
  { id: 'export', label: 'Экспорт плана' },
  { id: 'calc-add', label: 'Добавление в набор' },
  { id: 'calc-remove', label: 'Удаление из набора' },
  { id: 'calc-clear', label: 'Очистка набора' },
  { id: 'calc-preset', label: 'Пример набора' },
]

export const HISTORY_KEY = 'food-bridge.history.v1'

/** Вместимость журнала в localStorage. */
export const HISTORY_LIMIT = 200

const ACTION_IDS: string[] = JOURNAL_ACTIONS.map((a) => a.id)

/** Чтение журнала из localStorage с валидацией записей. */
export function loadJournal(): HistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (e): e is HistoryEntry =>
          typeof e === 'object' &&
          e !== null &&
          typeof (e as HistoryEntry).ts === 'number' &&
          typeof (e as HistoryEntry).label === 'string' &&
          ACTION_IDS.includes((e as HistoryEntry).action),
      )
      .slice(-HISTORY_LIMIT)
  } catch {
    return []
  }
}

export const ACTION_LABEL: Record<HistoryAction, string> = Object.fromEntries(
  JOURNAL_ACTIONS.map((a) => [a.id, a.label]),
) as Record<HistoryAction, string>

/** Человекочитаемый тип для CSV журнала. */
export function actionLabel(action: HistoryAction): string {
  return ACTION_LABEL[action]
}

function dayStart(iso: string): number {
  return new Date(`${iso}T00:00:00`).getTime()
}

function dayEnd(iso: string): number {
  return new Date(`${iso}T23:59:59.999`).getTime()
}

/**
 * Фильтрация журнала (все условия применяются одновременно — И):
 * тип действия, диапазон дат (обе границы включительно) и поиск по тексту.
 */
export function filterJournal(entries: HistoryEntry[], filters: JournalFilters): HistoryEntry[] {
  const query = filters.query.trim().toLowerCase()

  const fromTs = filters.from ? dayStart(filters.from) : null
  const toTs = filters.to ? dayEnd(filters.to) : null

  return entries.filter((e) => {
    if (filters.action !== 'all' && e.action !== filters.action) return false
    if (fromTs !== null && e.ts < fromTs) return false
    if (toTs !== null && e.ts > toTs) return false
    if (query !== '' && !e.label.toLowerCase().includes(query)) return false
    return true
  })
}
