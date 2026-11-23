import { surpluses, needs, products } from '../data'
import { computeDashboardStats, type CategoryStat } from '../lib/stats'
import { formatCoverage, formatKg, formatNumber } from '../lib/format'
import { CATEGORY_LABEL, kgToPersonDays } from '../lib/nutrition'
import type { MatchPlan } from '../lib/matching'
import type { UncoveredSummary } from '../lib/uncovered'
import { Bar, StatTile } from './ui'
import UncoveredNeeds from './UncoveredNeeds'

export default function Dashboard({
  plan,
  confirmed,
  uncovered,
}: {
  plan: MatchPlan | null
  confirmed: Set<string>
  uncovered: UncoveredSummary | null
}) {
  const stats = computeDashboardStats(products, surpluses, needs)
  const maxKg = Math.max(1, ...stats.categories.map((c) => c.availableKg))
  const confirmedTransfers = plan ? plan.transfers.filter((t) => confirmed.has(t.id)) : []
  const confirmedKg = confirmedTransfers.reduce((sum, t) => sum + t.totalKg, 0)

  return (
    <section>
      <h1 className="section-title">Дашборд</h1>
      <p className="section-sub">
        Сводка по моковым данным: излишки 18 магазинов трёх сетей против нужд 4 пунктов помощи.
      </p>

      <div className="tiles">
        <StatTile
          value={formatKg(stats.availableKg)}
          label="Излишков доступно"
          hint={`${surpluses.filter((s) => s.status === 'available').length} позиций в витрине`}
        />
        <StatTile
          value={`${formatNumber(stats.matchPct)}%`}
          label="Совпадает с нуждами"
          hint={`${formatKg(stats.matchedKg)} можно передать`}
        />
        <StatTile
          value={formatNumber(stats.personDays)}
          label="Человеко-дней покрытия"
          hint={`это ${formatCoverage(stats.personDays)}`}
        />
        <StatTile
          value={formatKg(stats.matchedKg)}
          label="Списаний можно избежать"
          hint="излишки, совпавшие с открытыми нуждами"
        />
      </div>

      {confirmedTransfers.length > 0 && (
        <p className="note note--green">
          <span aria-hidden="true">✅</span>
          <span>
            Подтверждено передач: {confirmedTransfers.length} — передано {formatKg(confirmedKg)}.
            Прогресс в «Нуждах» учитывает подтверждённое.
          </span>
        </p>
      )}

      {stats.urgentCount > 0 && (
        <p className="note">
          <span aria-hidden="true">⚠️</span>
          <span>
            Скоропорт: {formatKg(stats.urgentKg)} излишков истекает в ближайшие 3 дня — приоритет
            №1 для вывоза (см. вкладку «Излишки», сортировка «скорее испортится»).
          </span>
        </p>
      )}

      <div className="breakdown">
        <h2 className="section-title" style={{ fontSize: 16 }}>
          Разбивка по категориям
        </h2>
        <p className="section-sub" style={{ marginBottom: 8 }}>
          Полоса — доступные излишки, зелёная часть — совпавшие с нуждами.
        </p>
        {stats.categories
          .slice()
          .sort((a, b) => b.availableKg - a.availableKg)
          .map((c: CategoryStat) => {
            const personDays = kgToPersonDays(c.category, c.matchedKg)
            return (
              <div className="breakdown__row" key={c.category}>
                <div className="breakdown__name">{CATEGORY_LABEL[c.category]}</div>
                <Bar
                  segments={[
                    { value: c.matchedKg / maxKg, tone: 'done' },
                    { value: (c.availableKg - c.matchedKg) / maxKg, tone: 'planned' },
                  ]}
                />
                <div className="breakdown__value">
                  {formatKg(c.availableKg)} · {formatNumber(personDays)} чел.-дн.
                </div>
              </div>
            )
          })}
      </div>

      {uncovered && <UncoveredNeeds summary={uncovered} />}
    </section>
  )
}
