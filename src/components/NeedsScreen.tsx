import { useState } from 'react'
import { needs, products, recipients, surpluses } from '../data'
import { PRIORITY_LABEL } from '../lib/nutrition'
import type { MatchPlan } from '../lib/matching'
import { validateRequestDraft, type OperatorRequest, type RequestDraft } from '../lib/requests'
import { formatTime } from '../lib/format'
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
    // учёт строго по нужде: ручные заявки того же пункта/товара не попадают
    // в прогресс мок-нужды
    for (const item of t.items) {
      if (item.needId !== need.id) continue
      if (confirmed.has(t.id)) confirmedQty += item.qty
      else plannedQty += item.qty
    }
  }
  return { confirmedQty, plannedQty }
}

export default function NeedsScreen({
  plan,
  confirmed,
  requests,
  onAddRequest,
  onRemoveRequest,
}: {
  plan: MatchPlan | null
  confirmed: Set<string>
  requests: OperatorRequest[]
  onAddRequest: (draft: RequestDraft) => void
  onRemoveRequest: (id: string) => void
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

      <RequestForm onAddRequest={onAddRequest} recipients={recipients} products={products} />

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

      <OperatorRequestsBlock
        requests={requests}
        productById={productById}
        recipientById={new Map(recipients.map((r) => [r.id, r]))}
        onRemoveRequest={onRemoveRequest}
      />
    </section>
  )
}

/** Форма «Добавить заявку»: пункт, товар, количество, приоритет. */
function RequestForm({
  onAddRequest,
  recipients,
  products,
}: {
  onAddRequest: (draft: RequestDraft) => void
  recipients: Recipient[]
  products: Product[]
}) {
  const [recipientId, setRecipientId] = useState('')
  const [productId, setProductId] = useState('')
  const [qty, setQty] = useState('1')
  const [priority, setPriority] = useState<'high' | 'medium'>('high')
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    const draft: RequestDraft = {
      recipientId,
      productId,
      qty: Number(qty.replace(',', '.')),
      priority,
    }
    const problem = validateRequestDraft(draft)
    if (problem !== null) {
      setError(problem)
      return
    }
    setError(null)
    onAddRequest(draft)
    setQty('1')
  }

  return (
    <div className="breakdown">
      <h2 className="section-title" style={{ fontSize: 16 }}>
        Добавить заявку
      </h2>
      <p className="section-sub">
        Ручная заявка пункта помощи: сохраняется локально и участвует в следующем мэтчинге наравне
        с потребностями из моков.
      </p>
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <div className="field">
          <label className="field__label" htmlFor="req-recipient">
            Пункт помощи
          </label>
          <select
            id="req-recipient"
            value={recipientId}
            onChange={(e) => setRecipientId(e.target.value)}
          >
            <option value="">— выберите —</option>
            {recipients.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="req-product">
            Товар
          </label>
          <select id="req-product" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">— выберите —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({CATEGORY_HINTS[p.category]})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="req-qty">
            Количество
          </label>
          <input
            id="req-qty"
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="req-priority">
            Приоритет
          </label>
          <select
            id="req-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as 'high' | 'medium')}
          >
            <option value="high">высокий</option>
            <option value="medium">средний</option>
          </select>
        </div>
        <button type="button" className="btn btn--primary" onClick={submit}>
          Добавить заявку
        </button>
      </div>
      {error && <p className="form-error">⚠️ {error}</p>}
    </div>
  )
}

/** Блок ручных заявок с бейджем «заявка оператора» и кнопкой удаления. */
function OperatorRequestsBlock({
  requests,
  productById,
  recipientById,
  onRemoveRequest,
}: {
  requests: OperatorRequest[]
  productById: Map<string, Product>
  recipientById: Map<string, Recipient>
  onRemoveRequest: (id: string) => void
}) {
  if (requests.length === 0) return null
  return (
    <div className="breakdown">
      <h2 className="section-title" style={{ fontSize: 16 }}>
        Заявки оператора ({requests.length})
      </h2>
      <p className="section-sub">
        Участвуют в следующем мэтчинге и в расчёте дефицита. Удалить — кнопкой справа.
      </p>
      <ul className="list">
        {requests
          .slice()
          .reverse()
          .map((r) => {
            const product = productById.get(r.productId)
            const recipient = recipientById.get(r.recipientId)
            return (
              <li className="list__item" key={r.id}>
                <span>
                  <Badge tone="blue">заявка оператора</Badge> {product?.name ?? r.productId} ×{' '}
                  {r.desiredQty} {product?.unit ?? ''} → {recipient?.name ?? r.recipientId}
                  {r.priority === 'high' && <Badge tone="red">высокий приоритет</Badge>}
                </span>
                <span>
                  добавлена {formatTime(r.createdAt)}
                  <button
                    type="button"
                    className="btn btn--small btn--ghost"
                    style={{ marginLeft: 8 }}
                    onClick={() => onRemoveRequest(r.id)}
                    aria-label="Удалить заявку"
                  >
                    ✕
                  </button>
                </span>
              </li>
            )
          })}
      </ul>
    </div>
  )
}

const CATEGORY_HINTS: Record<string, string> = {
  meat: 'мясо',
  dairy: 'молочка',
  grocery: 'бакалея',
  veg: 'овощи',
  bread: 'хлеб',
  canned: 'консервы',
}
