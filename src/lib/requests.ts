import type { Need, Priority } from '../types'

export const REQUESTS_KEY = 'food-bridge.requests.v1'

/**
 * Ручная заявка пункта помощи, добавленная оператором. Структурно
 * совместима с Need — участвует в мэтчинге как дополнительная нужда.
 */
export interface OperatorRequest extends Need {
  /** метка времени добавления */
  createdAt: number
}

/** Разбор и валидация заявок из JSON (localStorage): битые записи отбрасываются. */
export function parseRequests(raw: string | null): OperatorRequest[] {
  if (raw === null) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.filter(
    (e): e is OperatorRequest =>
      typeof e === 'object' &&
      e !== null &&
      typeof (e as OperatorRequest).id === 'string' &&
      (e as OperatorRequest).id.length > 0 &&
      typeof (e as OperatorRequest).recipientId === 'string' &&
      (e as OperatorRequest).recipientId.length > 0 &&
      typeof (e as OperatorRequest).productId === 'string' &&
      (e as OperatorRequest).productId.length > 0 &&
      typeof (e as OperatorRequest).desiredQty === 'number' &&
      (e as OperatorRequest).desiredQty > 0 &&
      typeof (e as OperatorRequest).fulfilledQty === 'number' &&
      (e as OperatorRequest).fulfilledQty >= 0 &&
      (e as OperatorRequest).fulfilledQty <= (e as OperatorRequest).desiredQty &&
      ((e as OperatorRequest).priority === 'high' || (e as OperatorRequest).priority === 'medium') &&
      typeof (e as OperatorRequest).createdAt === 'number',
  )
}

export function loadRequests(): OperatorRequest[] {
  try {
    return parseRequests(window.localStorage.getItem(REQUESTS_KEY))
  } catch {
    return []
  }
}

export function saveRequests(list: OperatorRequest[]): void {
  try {
    window.localStorage.setItem(REQUESTS_KEY, JSON.stringify(list))
  } catch {
    /* приватный режим — заявки живут только в сессии */
  }
}

/** Дедуп по id: защита от повторных ключей в localStorage. */
export function dedupeRequests(list: OperatorRequest[]): OperatorRequest[] {
  const seen = new Set<string>()
  return list.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
}

/** Уникальный id заявки: req-<ts>-<n>, n — счётчик внутри той же секунды. */
export function nextRequestId(existing: OperatorRequest[], now = Date.now()): string {
  const base = `req-${now}`
  const n = existing.filter((r) => r.id.startsWith(`${base}-`)).length
  return `${base}-${n + 1}`
}

export interface RequestDraft {
  recipientId: string
  productId: string
  qty: number
  priority: Priority
}

/** Валидация формы заявки: текст ошибки или null, если всё заполнено. */
export function validateRequestDraft(draft: RequestDraft): string | null {
  if (draft.recipientId === '') return 'выберите пункт помощи'
  if (draft.productId === '') return 'выберите товар'
  if (!Number.isFinite(draft.qty) || draft.qty <= 0) return 'количество должно быть больше нуля'
  return null
}
