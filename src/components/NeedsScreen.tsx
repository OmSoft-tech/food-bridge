import { needs, products, recipients, surpluses } from '../data'
import { PRIORITY_LABEL } from '../lib/nutrition'
import type { MatchPlan } from '../lib/matching'
import { Bar, Badge } from './ui'
import type { Need, Product, Recipient } from '../types'

interface NeedRow {
  need: Need
  product: Product
  /** единиц на эту нужду в подтверждённых передачах плана */
  planConfirmed: number
  /** единиц на эту нужду в незапланированных (ещё не подтверждённых) передачах */
  planPlanned: number
  /** сколько единиц того же товара сейчас в витрине излишков */
  openQty: number
}

interface RecipientCard {
  recipient: Recipient
  rows: NeedRow[]
  desiredKg: number
  closedKg: number
  confirmedKg: number
  plannedKg: number
}

/** Прогресс нужды: закрыто (mock fulfilledQty) + подтверждено + в плане (план передач). */
function planQtyFor(
  plan: MatchPlan | null,
  need: Need,
  confirmed: Set<string>,
): { confirmedQty: number; plannedQty: number } {
  if (!plan) return { confirmedQty: 0, plannedQty: 0 }
  let confirmedQty = 0
  let plannedQty = 0
  for (const t of plan.transfers) {
    if (t.recipientId !== need.recipientId) continue
    for (const item of t.items) {
      if (item.productId !== need.productId) continue
      if (confirmed.has(t.id)) confirmedQty += item.qty
      else plannedQty += item.qty
    }
  }
  return { confirmedQty, plannedQty }
}

export default function NeedsScreen({
  plan,
  confirmed,
}: {
  plan: MatchPlan | null
  confirmed: Set<string>
}) {
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
        const { confirmedQty, plannedQty } = planQtyFor(plan, n, confirmed)
        const row: NeedRow = {
          need: n,
          product,
          planConfirmed: confirmedQty,
          planPlanned: plannedQty,
          openQty: openQtyByProduct.get(n.productId) ?? 0,
        }
        return [row]
      })
    const kg = (qty: (row: NeedRow) => number) =>
      rows.reduce((sum, row) => sum + qty(row) * row.product.unitWeightKg, 0)
    const closedKg = kg((row) => row.need.fulfilledQty)
    const confirmedKg = kg((row) => row.planConfirmed)
    const plannedKg = kg((row) => row.planPlanned)
    const desiredKg = kg((row) => row.need.desiredQty)
    return { recipient: r, rows, desiredKg, closedKg, confirmedKg, plannedKg }
  })

  return (
    <section>
      <h1 className="section-title">Нужды пунктов помощи</h1>
      <p className="section-sub">
        Прогресс закрытия потребности: тёмно-зелёная — уже получено, ярко-зелёная — подтверждённая
        передача, штриховка — ещё в плане (вкладка «Мэтчинг»).
      </p>

      <div className="cards">
        {cards.map((card) => {
          const total =
            (card.closedKg + card.confirmedKg + card.plannedKg) / (card.desiredKg || 1)
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
                    { value: card.confirmedKg / card.desiredKg, tone: 'confirmed' },
                    { value: card.plannedKg / card.desiredKg, tone: 'planned' },
                  ]}
                />
                <span className="progress-label">{Math.round(total * 100)}%</span>
              </div>

              <ul className="list">
                {card.rows.map(({ need, product, planConfirmed, planPlanned, openQty }) => (
                  <li className="list__item" key={need.id}>
                    <span>
                      {product.name}
                      {need.priority === 'high' && (
                        <>
                          {' '}
                          <Badge tone="red">{PRIORITY_LABEL[need.priority]} приоритет</Badge>
                        </>
                      )}
                      {planConfirmed > 0 && (
                        <>
                          {' '}
                          <Badge tone="green">+{planConfirmed} подтверждено</Badge>
                        </>
                      )}
                      {planPlanned > 0 && (
                        <>
                          {' '}
                          <Badge>+{planPlanned} в плане</Badge>
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
