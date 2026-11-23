import { surpluses, needs, products } from '../data'
import { computeDashboardStats, type CategoryStat } from '../lib/stats'
import { formatCoverage, formatKg, formatNumber } from '../lib/format'
import { CATEGORY_LABEL, kgToPersonDays } from '../lib/nutrition'
import { Bar, StatTile } from './ui'

export default function Dashboard() {
  const stats = computeDashboardStats(products, surpluses, needs)
  const maxKg = Math.max(1, ...stats.categories.map((c) => c.availableKg))

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
    </section>
  )
}
