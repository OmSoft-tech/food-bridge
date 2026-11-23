import { stores, recipients } from '../data'
import { formatKg } from '../lib/format'
import type { PickupDay } from '../lib/schedule'
import { Badge } from './ui'

function dayLabel(day: PickupDay): string {
  const date = day.date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  if (day.dayOffset === 0) return `Сегодня, ${date}`
  if (day.dayOffset === 1) return `Завтра, ${date}`
  return date
}

/**
 * Секция «План вывозов на неделю»: дни вывоза, маршруты магазин → пункт
 * (от дальнего к пункту), суммарный вес по дням. Кластеры дней в духе
 * карточек приложения.
 */
export default function PickupSchedule({ schedule }: { schedule: PickupDay[] | null }) {
  const storeById = new Map(stores.map((s) => [s.id, s]))
  const recipientById = new Map(recipients.map((r) => [r.id, r]))

  if (!schedule) {
    return (
      <div className="breakdown">
        <h2 className="section-title" style={{ fontSize: 16 }}>
          План вывозов на неделю
        </h2>
        <p className="section-sub">
          Группировка передач по дням вывоза и маршруты «по пути» к каждому пункту.
        </p>
        <div className="empty">Нет передач — постройте план, чтобы распланировать вывозы.</div>
      </div>
    )
  }

  return (
    <div className="breakdown">
      <h2 className="section-title" style={{ fontSize: 16 }}>
        План вывозов на неделю
      </h2>
      <p className="section-sub">
        Чем ближе конец срока годности, тем раньше вывоз (длительно хранимое — в конце недели);
        магазины одного пункта идут от дальнего к ближнему, чтобы объезд был «по пути». ✓ —
        подтверждённые передачи.
      </p>

      {schedule.map((day) => (
        <div className="pickup-day" key={day.dayOffset}>
          <div className="card__row">
            <Badge tone={day.dayOffset === 0 ? 'red' : day.dayOffset === 1 ? 'amber' : 'green'}>
              {dayLabel(day)}
            </Badge>
            <span className="progress-label">
              {day.transferCount} передач(и) · {formatKg(day.totalKg)} · {day.routes.length} пункт(а)
            </span>
          </div>
          {day.routes.map((route) => (
            <div className="pickup-route" key={route.recipientId}>
              <span className="progress-label">Маршрут:</span>
              <span className="pickup-chain">
                {route.transfers.map((s, i) => {
                  const store = storeById.get(s.storeId)
                  return (
                    <span key={s.transferId}>
                      {i > 0 && <span className="transfer__arrow"> → </span>}
                      🏪 {store?.name ?? s.storeId} · {formatKg(s.totalKg)}
                      {s.status === 'confirmed' && ' ✓'}
                    </span>
                  )
                })}
                <span className="transfer__arrow"> → </span>💚{' '}
                {recipientById.get(route.recipientId)?.name ?? route.recipientId}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
