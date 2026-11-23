import { useMemo } from 'react'
import { products, recipients, stores } from '../data'
import { formatCoverage, formatKg, formatTime } from '../lib/format'
import type { MatchPlan, Transfer } from '../lib/matching'
import type { HistoryAction, HistoryEntry } from '../lib/journal'
import type { UncoveredSummary } from '../lib/uncovered'
import type { PickupDay } from '../lib/schedule'
import { downloadCsv, planCsvFilename, transfersToCsv } from '../lib/csv'
import { Badge } from './ui'
import UncoveredNeeds from './UncoveredNeeds'
import PickupSchedule from './PickupSchedule'

interface Props {
  plan: MatchPlan | null
  confirmed: Set<string>
  history: HistoryEntry[]
  uncovered: UncoveredSummary | null
  schedule: PickupDay[] | null
  onBuild: () => void
  onReset: () => void
  onConfirm: (transferId: string) => void
  onLog: (action: HistoryAction, label: string) => void
}

const STATUS_BADGE: Record<Transfer['status'], { tone: 'amber' | 'green'; label: string }> = {
  planned: { tone: 'amber', label: 'запланировано' },
  confirmed: { tone: 'green', label: 'подтверждено' },
}

export default function MatchingScreen({
  plan,
  confirmed,
  history,
  uncovered,
  schedule,
  onBuild,
  onReset,
  onConfirm,
  onLog,
}: Props) {
  const storeById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [])
  const recipientById = useMemo(() => new Map(recipients.map((r) => [r.id, r])), [])
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [])

  return (
    <section>
      <h1 className="section-title">Мэтчинг передач</h1>
      <p className="section-sub">
        Жадный алгоритм: сначала излишки, которые скоро испортятся, потом нужды по приоритету
        (высокий раньше среднего). План пересобирается с нуля при каждом запуске; подтверждения
        сохраняются в localStorage.
      </p>

      <div className="toolbar">
        <button type="button" className="btn btn--primary" onClick={onBuild}>
          Подобрать передачи
        </button>
        <button type="button" className="btn btn--ghost" onClick={onReset} disabled={!plan}>
          Сбросить
        </button>
        {plan !== null && (
          <>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                downloadCsv(
                  planCsvFilename(),
                  transfersToCsv({
                    transfers: plan.transfers,
                    confirmed,
                    products,
                    stores,
                    recipients,
                    uncovered: uncovered ?? undefined,
                  }),
                )
                onLog(
                  'export',
                  `план передач экспортирован в CSV (${plan.transfers.length} передач, ${formatKg(plan.totalKg)})`,
                )
              }}
            >
              ⬇ Скачать CSV
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => window.print()}>
              🖨 Печать
            </button>
          </>
        )}
      </div>

      {plan === null ? (
        <div className="empty">
          Нажмите «Подобрать передачи» — алгоритм сопоставит витрину излишков с открытыми нуждами
          и покажет план: магазин → пункт, состав, вес и покрытие.
        </div>
      ) : (
        <>
          <p className="section-sub">
            План: {plan.transfers.length} передач(и) · общий вес {formatKg(plan.totalKg)} ·
            покрытие {Math.round(plan.personDays)} чел.-дн. ({formatCoverage(plan.personDays)})
          </p>

          <div className="cards">
            {plan.transfers.map((t) => {
              const store = storeById.get(t.storeId)
              const recipient = recipientById.get(t.recipientId)
              const isConfirmed = confirmed.has(t.id)
              const badge = STATUS_BADGE[isConfirmed ? 'confirmed' : 'planned']
              return (
                <article className="card transfer" key={t.id}>
                  <div className="transfer__route">
                    <span>{store?.name}</span>
                    <span className="transfer__arrow" aria-hidden="true">
                      →
                    </span>
                    <span>{recipient?.name}</span>
                  </div>
                  <div className="card__sub">
                    {store?.district} · {store?.address} → {recipient?.district}
                  </div>

                  <ul className="list">
                    {t.items.map((item) => {
                      const product = productById.get(item.productId)
                      if (!product) return null
                      return (
                        <li className="list__item" key={item.surplusId}>
                          <span>{product.name}</span>
                          <span>
                            {item.qty} {product.unit} · {formatKg(item.qty * product.unitWeightKg)}
                          </span>
                        </li>
                      )
                    })}
                  </ul>

                  <div className="card__row" style={{ marginTop: 'auto' }}>
                    <span className="card__num">{formatKg(t.totalKg)}</span>
                    <Badge tone="green">покрывает {formatCoverage(t.personDays)}</Badge>
                  </div>
                  <div className="card__row">
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                    {!isConfirmed ? (
                      <button
                        type="button"
                        className="btn btn--small"
                        onClick={() => onConfirm(t.id)}
                      >
                        Подтвердить
                      </button>
                    ) : (
                      <span className="progress-label">
                        Передача подтверждена — излишки зарезервированы за пунктом.
                      </span>
                    )}
                  </div>
                </article>
              )
            })}
          </div>

          <PickupSchedule schedule={schedule} />

          {uncovered && <UncoveredNeeds summary={uncovered} />}
        </>
      )}

      {history.length > 0 && (
        <div className="breakdown">
          <h2 className="section-title" style={{ fontSize: 16 }}>
            Последние действия
          </h2>
          <ul className="list">
            {history
              .slice(-5)
              .reverse()
              .map((h, i) => (
                <li className="list__item" key={`${h.ts}-${i}`}>
                  <span>{h.label}</span>
                  <span>{formatTime(h.ts)}</span>
                </li>
              ))}
          </ul>
          <a
            className="btn btn--small btn--ghost"
            style={{ marginTop: 10 }}
            href="?tab=journal"
          >
            Весь журнал →
          </a>
        </div>
      )}
    </section>
  )
}
