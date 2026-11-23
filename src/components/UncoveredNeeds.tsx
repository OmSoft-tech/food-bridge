import { recipients, products } from '../data'
import { PRIORITY_LABEL } from '../lib/nutrition'
import { formatKg, formatMoney, formatNumber } from '../lib/format'
import type { UncoveredSummary } from '../lib/uncovered'
import { StatTile } from './ui'

/**
 * Секция «Непокрытые нужды»: что осталось собрать после плана,
 * за сколько Фонд докупит недостающее и покрытие деньгами/излишками.
 */
export default function UncoveredNeeds({ summary }: { summary: UncoveredSummary }) {
  const recipientById = new Map(recipients.map((r) => [r.id, r]))
  const productById = new Map(products.map((p) => [p.id, p]))

  return (
    <div className="breakdown">
      <h2 className="section-title" style={{ fontSize: 16 }}>
        Непокрытые нужды
      </h2>
      <p className="section-sub">
        Остаток открытых потребностей после плана: сколько не хватает и за сколько Фонд может
        это докупить по розничным ценам.
      </p>

      {summary.items.length === 0 ? (
        <p className="note note--green">
          <span aria-hidden="true">✅</span>
          <span>Все открытые нужды закрыты излишками — докупка не требуется.</span>
        </p>
      ) : (
        <>
          <div className="tiles">
            <StatTile value={formatKg(summary.totalRemainingKg)} label="Осталось собрать" />
            <StatTile
              value={formatMoney(summary.totalCost)}
              label="Докупить за счёт Фонда"
              hint={`${summary.items.length} позиций`}
            />
            <StatTile
              value={formatMoney(summary.highCost)}
              label="Из них по высоким нуждам"
              hint={`вес ${formatKg(summary.highRemainingKg)}`}
            />
            <StatTile
              value={`${summary.coveredPct}%`}
              label="Покрыто излишками"
              hint={`деньгами закроется ${summary.moneyPct}%`}
            />
          </div>

          <table className="table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Пункт помощи</th>
                <th>Товар</th>
                <th>Приоритет</th>
                <th>Остаток</th>
                <th>Вес</th>
                <th>Стоимость</th>
              </tr>
            </thead>
            <tbody>
              {summary.items.map((item) => {
                const recipient = recipientById.get(item.recipientId)
                const product = productById.get(item.productId)
                return (
                  <tr key={item.needId}>
                    <td>{recipient?.name ?? item.recipientId}</td>
                    <td>{product?.name ?? item.productId}</td>
                    <td>{PRIORITY_LABEL[item.priority]}</td>
                    <td>
                      {formatNumber(item.remainingQty)} {product?.unit ?? ''}
                    </td>
                    <td>{formatKg(item.remainingKg)}</td>
                    <td>{formatMoney(item.cost)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
