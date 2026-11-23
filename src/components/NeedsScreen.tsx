import { needs, products, recipients, surpluses } from '../data'
import { PRIORITY_LABEL } from '../lib/nutrition'
import type { MatchPlan } from '../lib/matching'
import { Bar, Badge } from './ui'
import type { Need, Product, Recipient } from '../types'

interface NeedRow {
  need: Need
  product: Product
  /** сколько на эту нужду уходит в текущем плане передач */
  planQty: number
  /** сколько единиц того же товара сейчас в витрине излишков */
  openQty: number
}

interface RecipientCard {
  recipient: Recipient
  rows: NeedRow[]
  desiredKg: number
  closedKg: number
  plannedKg: number
}

/** Прогресс нужды: закрыто (mock fulfilledQty) + в плане (текущий план передач). */
function planQtyFor(plan: MatchPlan | null, need: Need): number {
  if (!plan) return 0
  let qty = 0
  for (const t of plan.transfers) {
    if (t.recipientId !== need.recipientId) continue
    for (const item of t.items) {
      if (item.productId === need.productId) qty += item.qty
    }
  }
  return qty
}

export default function NeedsScreen({ plan }: { plan: MatchPlan | null }) {
  const productById = new Map(products.map((p) => [p.id, p]))
  const openQtyByProduct = new Map<string, number>()
  for (const s of surpluses) {
    if (s.status === 'available') {
      openQtyByProduct.set(s.productId, (openQtyByProduct.get(s.productId) ?? 0) + s.qty)
    }
  }

  const cards: RecipientCard[] = recipients.map((r) => {
    const rows = needs
      .filter((n) => n.recipientId === r.id)
      .flatMap((n) => {
        const product = productById.get(n.productId)
        if (!product) return []
        const row: NeedRow = {
          need: n,
          product,
          planQty: planQtyFor(plan, n),
          openQty: openQtyByProduct.get(n.productId) ?? 0,
        }
        return [row]
      })
    const closedKg = rows.reduce((sum, r) => sum + r.need.fulfilledQty * r.product.unitWeightKg, 0)
    const plannedKg = rows.reduce((sum, r) => sum + r.planQty * r.product.unitWeightKg, 0)
    const desiredKg = rows.reduce((sum, r) => sum + r.need.desiredQty * r.product.unitWeightKg, 0)
    return { recipient: r, rows, desiredKg, closedKg, plannedKg }
  })

  return (
    <section>
      <h1 className="section-title">Нужды пунктов помощи</h1>
      <p className="section-sub">
        Прогресс закрытия потребности: сплошная зелень — уже получено, штриховка — уходит в текущем
        плане передач (вкладка «Мэтчинг»).
      </p>

      <div className="cards">
        {cards.map((card) => {
          const pct =
            card.desiredKg > 0 ? ((card.closedKg + card.plannedKg) / card.desiredKg) * 100 : 0
          return (
            <article className="card" key={card.recipient.id}>
              <div>
                <div className="card__title">{card.recipient.name}</div>
                <div className="card__sub">
                  {card.recipient.district} · {card.recipient.address}
                </div>
              </div>

              <div className="card__row">
                <Bar
                  segments={[
                    { value: card.closedKg / card.desiredKg, tone: 'done' },
                    { value: card.plannedKg / card.desiredKg, tone: 'planned' },
                  ]}
                />
                <span className="progress-label">{Math.round(pct)}%</span>
              </div>

              <ul className="list">
                {card.rows.map(({ need, product, planQty, openQty }) => (
                  <li className="list__item" key={need.id}>
                    <span>
                      {product.name}
                      {need.priority === 'high' && (
                        <>
                          {' '}
                          <Badge tone="red">{PRIORITY_LABEL[need.priority]} приоритет</Badge>
                        </>
                      )}
                      {planQty > 0 && (
                        <>
                          {' '}
                          <Badge tone="green">+{planQty} в плане</Badge>
                        </>
                      )}
                    </span>
                    <span>
                      {need.fulfilledQty} / {need.desiredQty} {product.unit}
                      {openQty > 0 && (
                        <>
                          <br />
                          в витрине: {openQty} {product.unit}
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          )
        })}
      </div>
    </section>
  )
}
