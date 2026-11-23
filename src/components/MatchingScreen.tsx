import { useMemo, useState } from 'react'
import { products, recipients, stores, surpluses, needs } from '../data'
import { formatCoverage, formatKg, formatTime } from '../lib/format'
import { buildMatchPlan, type MatchPlan, type Transfer } from '../lib/matching'
import { computeUncovered, uncoveredToBasketItems, uncoveredToRefillItem, type UncoveredSummary } from '../lib/uncovered'
import { planPickupSchedule, type PickupDay } from '../lib/schedule'
import type { HistoryAction, HistoryEntry } from '../lib/journal'
import type { BasketItem } from '../lib/basket'
import {
  BASE_SCENARIO,
  buildPlanDelta,
  formatDelta,
  isBaseScenario,
  STRATEGIES,
  type ScenarioParams,
} from '../lib/scenario'
import { downloadCsv, downloadTextFile, planCsvFilename, transfersToCsv } from '../lib/csv'
import { buildReportHtml, reportFilename, type ReportData } from '../lib/report'
import { Badge } from './ui'
import UncoveredNeeds from './UncoveredNeeds'
import CoordinatorReport from './CoordinatorReport'
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
  /** дефицит → набор калькулятора (журнал + переход на вкладку) */
  onAddRefills: (refills: BasketItem[]) => void
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
  onAddRefills,
}: Props) {
  const storeById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [])
  const recipientById = useMemo(() => new Map(recipients.map((r) => [r.id, r])), [])
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [])

  // Сценарные параметры — сессионные (в localStorage не пишутся).
  const [scenario, setScenario] = useState<ScenarioParams>(BASE_SCENARIO)
  const scenarioActive = !isBaseScenario(scenario)

  // Сценарный план пересчитывается сразу при смене параметров — без «Подобрать».
  const scenarioPlan: MatchPlan | null = useMemo(() => {
    if (plan === null) return null
    if (!scenarioActive) return plan
    return buildMatchPlan(products, surpluses, needs, {
      strategy: scenario.strategy,
      dailyLimitKg: scenario.dailyLimitKg,
      stores,
      recipients,
    })
  }, [plan, scenario, scenarioActive])

  // Сценарные производные (дельта, непокрытые, вывозы) — по отображаемому плану.
  const scenarioUncovered = useMemo(
    () =>
      scenarioPlan !== null && scenarioActive
        ? computeUncovered(products, needs, scenarioPlan)
        : uncovered,
    [scenarioPlan, scenarioActive, uncovered],
  )
  const scenarioSchedule = useMemo(
    () =>
      scenarioPlan !== null && scenarioActive
        ? planPickupSchedule(scenarioPlan, surpluses, stores, recipients, new Set())
        : schedule,
    [scenarioPlan, scenarioActive, schedule],
  )
  const planDelta = useMemo(
    () =>
      plan !== null && scenarioPlan !== null && scenarioActive
        ? buildPlanDelta(plan, scenarioPlan, products, needs)
        : null,
    [plan, scenarioPlan, scenarioActive],
  )
  const displayed = scenarioPlan ?? plan

  // Данные отчёта для координатора — по отображаемому (сценарному) плану.
  const reportData: ReportData | null = useMemo(() => {
    if (displayed === null) return null
    const scenarioLabel = isBaseScenario(scenario)
      ? 'базовый — сроки годности, без лимита'
      : `${
          STRATEGIES.find((s) => s.id === scenario.strategy)?.label ?? scenario.strategy
        }${scenario.dailyLimitKg > 0 ? ` · лимит вывоза ${scenario.dailyLimitKg} кг/день` : ''}`
    return {
      plan: displayed,
      confirmed: scenarioActive ? new Set() : confirmed,
      scenarioLabel,
      schedule: scenarioSchedule ?? [],
      uncovered:
        scenarioUncovered ??
        computeUncovered(products, needs, displayed),
      history,
      products,
      storeNames: new Map(stores.map((s) => [s.id, `${s.name} (${s.address})`])),
      recipientNames: new Map(recipients.map((r) => [r.id, `${r.name} (${r.address})`])),
      productNames: new Map(products.map((p) => [p.id, p.name])),
    }
  }, [displayed, scenario, scenarioActive, confirmed, scenarioSchedule, scenarioUncovered, history])

  const [reportPrintMode, setReportPrintMode] = useState(false)

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
        {displayed !== null && (
          <>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                if (displayed === null) return
                downloadCsv(
                  planCsvFilename(),
                  transfersToCsv({
                    transfers: displayed.transfers,
                    confirmed,
                    products,
                    stores,
                    recipients,
                    uncovered: scenarioUncovered ?? undefined,
                  }),
                )
                onLog(
                  'export',
                  `план передач экспортирован в CSV (${displayed.transfers.length} передач, ${formatKg(displayed.totalKg)})`,
                )
              }}
            >
              ⬇ Скачать CSV
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                setReportPrintMode(true)
                onLog(
                  'report',
                  `сформирован печатный отчёт для Фонда (${displayed.transfers.length} передач, ${formatKg(displayed.totalKg)})`,
                )
              }}
            >
              🖨 Отчёт для Фонда
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                if (reportData === null) return
                downloadTextFile(
                  reportFilename(),
                  buildReportHtml(reportData),
                  'text/html;charset=utf-8',
                )
                onLog(
                  'report',
                  `скачан HTML-отчёт для Фонда (${displayed.transfers.length} передач, ${formatKg(displayed.totalKg)})`,
                )
              }}
            >
              ⬇ Скачать HTML отчёт
            </button>
          </>
        )}
      </div>

      {displayed !== null && (
        <div className="breakdown scenarios">
          <h2 className="section-title" style={{ fontSize: 16 }}>
            Сценарии что-если
          </h2>
          <p className="section-sub">
            План пересчитывается сразу при смене сценария. Подтверждать передачи можно только в
            базовом сценарии.
          </p>
          <div className="toolbar" style={{ marginBottom: 8 }}>
            <div className="field">
              <span className="field__label">Приоритет мэтчинга</span>
              <div className="segmented" role="group" aria-label="Приоритет мэтчинга">
                {STRATEGIES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`segment${scenario.strategy === s.id ? ' segment--active' : ''}`}
                    title={s.hint}
                    onClick={() => setScenario({ ...scenario, strategy: s.id })}
                  >
                    {s.label}
                    {s.id === 'expiry' && ' (базовый)'}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="sc-limit">
                Лимит вывоза в день, кг
              </label>
              <input
                id="sc-limit"
                type="number"
                inputMode="numeric"
                min="0"
                step="any"
                value={scenario.dailyLimitKg}
                onChange={(e) =>
                  setScenario({ ...scenario, dailyLimitKg: Math.max(0, Number(e.target.value) || 0) })
                }
              />
            </div>
          </div>
          {planDelta !== null && (
            <div className="card__row" role="status">
              <Badge tone={planDelta.transfers > 0 ? 'green' : planDelta.transfers < 0 ? 'red' : 'gray'}>
                {formatDelta(planDelta.transfers, 'перед.')}
              </Badge>
              <Badge tone={planDelta.kg > 0 ? 'green' : planDelta.kg < 0 ? 'red' : 'gray'}>
                {formatDelta(planDelta.kg, 'кг')}
              </Badge>
              <Badge tone={planDelta.personDays > 0 ? 'green' : planDelta.personDays < 0 ? 'red' : 'gray'}>
                {formatDelta(planDelta.personDays, 'чел.-дн.')}
              </Badge>
              <Badge tone={planDelta.deficitCost < 0 ? 'green' : planDelta.deficitCost > 0 ? 'amber' : 'gray'}>
                {formatDelta(planDelta.deficitCost, '₽ дефицита')}
              </Badge>
            </div>
          )}
        </div>
      )}

      {displayed === null ? (
        <div className="empty">
          Нажмите «Подобрать передачи» — алгоритм сопоставит витрину излишков с открытыми нуждами
          и покажет план: магазин → пункт, состав, вес и покрытие.
        </div>
      ) : (
        <>
          <p className="section-sub">
            План: {displayed.transfers.length} передач(и) · общий вес {formatKg(displayed.totalKg)} ·
            покрытие {Math.round(displayed.personDays)} чел.-дн. (
            {formatCoverage(displayed.personDays)})
            {scenarioActive && ' — сценарий, подтверждения недоступны'}
          </p>

          <div className="cards">
            {displayed.transfers.map((t) => {
              const store = storeById.get(t.storeId)
              const recipient = recipientById.get(t.recipientId)
              const isConfirmed = !scenarioActive && confirmed.has(t.id)
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
                    {scenarioActive ? (
                      <Badge tone="blue">сценарий — подтверждение в базовом</Badge>
                    ) : (
                      <>
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
                      </>
                    )}
                  </div>
                </article>
              )
            })}
          </div>

          <PickupSchedule schedule={scenarioSchedule} />

          {scenarioUncovered && (
            <UncoveredNeeds
              summary={scenarioUncovered}
              onSend={(item) => onAddRefills([uncoveredToRefillItem(item)])}
              onSendAll={() => onAddRefills(uncoveredToBasketItems(scenarioUncovered))}
            />
          )}
        </>
      )}

      {/* Отчёт для координатора: скрытый iframe-контейнер, печать по флагу */}
      {reportData && (
        <CoordinatorReport data={reportData} print={reportPrintMode} onPrinted={() => setReportPrintMode(false)} />
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
