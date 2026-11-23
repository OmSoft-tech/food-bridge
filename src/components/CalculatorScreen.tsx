import { useMemo, useState } from 'react'
import { products } from '../data'
import { CATEGORIES, CATEGORY_LABEL, KCAL_PER_KG, NORM_KG_PER_PERSON_DAY } from '../lib/nutrition'
import { formatCoverage, formatKcal, formatKg, formatNumber } from '../lib/format'
import type { Category } from '../types'

interface CalcItem {
  productId: string
  qty: number
}

/** Условный «средний набор» — быстрый старт для демо и жюри. */
const PRESET: CalcItem[] = [
  { productId: 'p04', qty: 40 }, // молоко 2,5%
  { productId: 'p10', qty: 20 }, // гречка
  { productId: 'p26', qty: 15 }, // тушёнка
  { productId: 'p17', qty: 10 }, // картофель
  { productId: 'p23', qty: 30 }, // хлеб белый
  { productId: 'p21', qty: 15 }, // яблоки
]

export default function CalculatorScreen() {
  const [items, setItems] = useState<CalcItem[]>([])
  const [productId, setProductId] = useState(products[0].id)
  const [qty, setQty] = useState('10')

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [])

  const add = () => {
    const n = Number(qty.replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) return
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === productId)
      if (existing) {
        return prev.map((i) =>
          i.productId === productId ? { ...i, qty: i.qty + n } : i,
        )
      }
      return [...prev, { productId, qty: n }]
    })
  }

  const remove = (id: string) => setItems((prev) => prev.filter((i) => i.productId !== id))

  const kgByCategory = new Map<Category, number>()
  let totalKg = 0
  let totalKcal = 0
  for (const item of items) {
    const product = productById.get(item.productId)
    if (!product) continue
    const kg = item.qty * product.unitWeightKg
    totalKg += kg
    totalKcal += kg * KCAL_PER_KG[product.category]
    kgByCategory.set(
      product.category,
      (kgByCategory.get(product.category) ?? 0) + kg,
    )
  }
  let personDays = 0
  for (const [category, kg] of kgByCategory) {
    personDays += kg / NORM_KG_PER_PERSON_DAY[category]
  }

  return (
    <section>
      <h1 className="section-title">Калькулятор покрытия</h1>
      <p className="section-sub">
        Бюджет условный: соберите набор товаров и посмотрите по нормам «человеко-дня», на сколько
        людей и на сколько дней его хватит. Расчёт не привязан к ценам.
      </p>

      <div className="toolbar">
        <div className="field">
          <label className="field__label" htmlFor="calc-product">
            Товар
          </label>
          <select id="calc-product" value={productId} onChange={(e) => setProductId(e.target.value)}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({CATEGORY_LABEL[p.category]})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="calc-qty">
            Количество
          </label>
          <input
            id="calc-qty"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </div>
        <button type="button" className="btn btn--primary" onClick={add}>
          Добавить
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => setItems(PRESET.map((p) => ({ ...p })))}
        >
          Пример набора
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => setItems([])} disabled={items.length === 0}>
          Очистить
        </button>
      </div>

      {items.length === 0 ? (
        <div className="empty">
          Добавьте позиции или нажмите «Пример набора» — увидите вес, калорийность и покрытие
          «X человек на Y дней».
        </div>
      ) : (
        <>
          <div className="tiles" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="tile">
              <div className="tile__value">{formatKg(totalKg)}</div>
              <div className="tile__label">Суммарный вес</div>
            </div>
            <div className="tile">
              <div className="tile__value">{formatKcal(totalKcal)}</div>
              <div className="tile__label">Калорийность набора</div>
            </div>
            <div className="tile">
              <div className="tile__value">{formatCoverage(personDays)}</div>
              <div className="tile__label">
                Покроет {formatNumber(personDays)} человеко-дней по нормам
              </div>
            </div>
          </div>

          <div className="breakdown">
            <h2 className="section-title" style={{ fontSize: 16 }}>
              Раскладка по категориям
            </h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Категория</th>
                  <th>Вес</th>
                  <th>Доля</th>
                  <th>Ккал</th>
                  <th>Чел.-дни</th>
                </tr>
              </thead>
              <tbody>
                {CATEGORIES.filter((c) => (kgByCategory.get(c.id) ?? 0) > 0).map((c) => {
                  const kg = kgByCategory.get(c.id) ?? 0
                  return (
                    <tr key={c.id}>
                      <td>{c.label}</td>
                      <td>{formatKg(kg)}</td>
                      <td>{Math.round((kg / totalKg) * 100)}%</td>
                      <td>{formatNumber(kg * KCAL_PER_KG[c.id])}</td>
                      <td>{formatNumber(kg / NORM_KG_PER_PERSON_DAY[c.id])}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            <ul className="list" style={{ marginTop: 12 }}>
              {items.map((item) => {
                const product = productById.get(item.productId)
                if (!product) return null
                return (
                  <li className="list__item" key={item.productId}>
                    <span>{product.name}</span>
                    <span>
                      {item.qty} {product.unit} · {formatKg(item.qty * product.unitWeightKg)}
                      <button
                        type="button"
                        className="btn btn--small btn--ghost"
                        style={{ marginLeft: 8 }}
                        onClick={() => remove(item.productId)}
                        aria-label={`Убрать ${product.name}`}
                      >
                        ✕
                      </button>
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        </>
      )}
    </section>
  )
}
