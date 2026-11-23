import { useMemo, useState } from 'react'
import { products, stores, surpluses } from '../data'
import { CATEGORIES, CATEGORY_LABEL, SURPLUS_STATUS_LABEL } from '../lib/nutrition'
import { expiryUrgency, formatExpiry, formatKg } from '../lib/format'
import type { Category } from '../types'
import { Badge, type BadgeTone } from './ui'

type ChainFilter = string
type ExpiryFilter = 'any' | 'le2' | 'le5'

const EXPIRY_FILTERS: { id: ExpiryFilter; label: string }[] = [
  { id: 'any', label: 'любой' },
  { id: 'le2', label: '≤ 2 дней' },
  { id: 'le5', label: '≤ 5 дней' },
]

const URGENCY_BADGE: Record<ReturnType<typeof expiryUrgency>, { tone: BadgeTone; label: string }> = {
  critical: { tone: 'red', label: 'срочно' },
  soon: { tone: 'amber', label: 'скоро' },
  ok: { tone: 'green', label: 'в запасе' },
}

const STATUS_BADGE: Record<string, { tone: BadgeTone }> = {
  available: { tone: 'green' },
  reserved: { tone: 'amber' },
  transferred: { tone: 'blue' },
}

export default function SurplusScreen() {
  const [category, setCategory] = useState<'all' | Category>('all')
  const [chain, setChain] = useState<ChainFilter>('all')
  const [expiry, setExpiry] = useState<ExpiryFilter>('any')

  const chains = useMemo(() => [...new Set(stores.map((s) => s.chain))], [])

  const storeById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [])
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [])

  const visible = surpluses
    .filter((s) => {
      const product = productById.get(s.productId)
      const store = storeById.get(s.storeId)
      if (category !== 'all' && product?.category !== category) return false
      if (chain !== 'all' && store?.chain !== chain) return false
      if (expiry === 'le2' && s.expiresInDays > 2) return false
      if (expiry === 'le5' && s.expiresInDays > 5) return false
      return true
    })
    .slice()
    .sort((a, b) => a.expiresInDays - b.expiresInDays)

  return (
    <section>
      <h1 className="section-title">Излишки магазинов</h1>
      <p className="section-sub">
        Отсортировано по правилу «скорее испортится» — сверху то, что спасаем в первую очередь.
        Показано {visible.length} из {surpluses.length} позиций.
      </p>

      <div className="toolbar">
        <div className="field">
          <label className="field__label" htmlFor="f-category">
            Категория
          </label>
          <select id="f-category" value={category} onChange={(e) => setCategory(e.target.value as 'all' | Category)}>
            <option value="all">все категории</option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="f-chain">
            Сеть
          </label>
          <select id="f-chain" value={chain} onChange={(e) => setChain(e.target.value)}>
            <option value="all">все сети</option>
            {chains.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="f-expiry">
            Срок годности
          </label>
          <select id="f-expiry" value={expiry} onChange={(e) => setExpiry(e.target.value as ExpiryFilter)}>
            {EXPIRY_FILTERS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="empty">Под фильтры ничего не попало — ослабьте условия.</div>
      ) : (
        <div className="cards">
          {visible.map((s) => {
            const product = productById.get(s.productId)
            const store = storeById.get(s.storeId)
            if (!product || !store) return null
            const urgency = expiryUrgency(s.expiresInDays)
            const weight = s.qty * product.unitWeightKg
            return (
              <article className="card" key={s.id}>
                <div className="card__row">
                  <Badge tone={URGENCY_BADGE[urgency].tone}>{URGENCY_BADGE[urgency].label}</Badge>
                  <Badge tone={STATUS_BADGE[s.status].tone}>{SURPLUS_STATUS_LABEL[s.status]}</Badge>
                  <Badge>{CATEGORY_LABEL[product.category]}</Badge>
                </div>
                <div className="card__title">{product.name}</div>
                <div className="card__sub">
                  {store.chain} · {store.name} · {store.district}
                  <br />
                  {store.address}
                </div>
                <div className="card__row" style={{ marginTop: 'auto' }}>
                  <span className="card__num">{formatKg(weight)}</span>
                  <span className="progress-label">
                    {s.qty} {product.unit}
                  </span>
                </div>
                <div className="card__row">
                  <Badge tone="gray">{formatExpiry(s.expiresInDays)}</Badge>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
