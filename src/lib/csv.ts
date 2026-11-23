import type { Product, Recipient, Store } from '../types'
import type { Transfer } from './matching'

/**
 * CSV плана передач: строка на позицию передачи + итог по передаче.
 * Разделитель «;» (Excel с русской локалью), десятичная запятая, BOM для
 * корректной кодировки при открытии в Excel.
 */
export function transfersToCsv({
  transfers,
  confirmed,
  products,
  stores,
  recipients,
}: {
  transfers: Transfer[]
  confirmed: Set<string>
  products: Product[]
  stores: Store[]
  recipients: Recipient[]
}): string {
  const sep = ';'
  const productById = new Map(products.map((p) => [p.id, p]))
  const storeById = new Map(stores.map((s) => [s.id, s]))
  const recipientById = new Map(recipients.map((r) => [r.id, r]))

  const field = (value: string | number): string => {
    const s = String(value)
    return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const row = (cells: (string | number)[]): string => cells.map(field).join(sep)

  const lines = [
    row([
      'Магазин',
      'Адрес магазина',
      'Пункт помощи',
      'Адрес пункта',
      'Товар',
      'Кол-во',
      'Ед.',
      'Вес, кг',
      'Покрытие',
      'Статус',
    ]),
  ]

  for (const t of transfers) {
    const store = storeById.get(t.storeId)
    const recipient = recipientById.get(t.recipientId)
    const coverage = `${Math.round(t.personDays)} чел.-дн.`
    const status = confirmed.has(t.id) ? 'подтверждено' : 'запланировано'
    const common = [store?.name ?? '', store?.address ?? '', recipient?.name ?? '', recipient?.address ?? '']

    for (const item of t.items) {
      const product = productById.get(item.productId)
      lines.push(
        row([
          ...common,
          product?.name ?? '',
          item.qty,
          product?.unit ?? '',
          (item.qty * (product?.unitWeightKg ?? 0)).toLocaleString('ru-RU', {
            maximumFractionDigits: 1,
          }),
          coverage,
          status,
        ]),
      )
    }
    lines.push(
      row([...common, 'ИТОГО по передаче', '', '', t.totalKg.toLocaleString('ru-RU', { maximumFractionDigits: 1 }), coverage, status]),
    )
  }

  return '\uFEFF' + lines.join('\r\n')
}

/** Триггерит скачивание файла в браузере. */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function planCsvFilename(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `food-bridge-plan-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.csv`
}
