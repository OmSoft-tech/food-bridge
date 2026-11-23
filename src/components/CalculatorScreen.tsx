import { useMemo, useState } from 'react'
import { products } from '../data'
import { CATEGORIES, CATEGORY_LABEL, KCAL_PER_KG, NORM_KG_PER_PERSON_DAY } from '../lib/nutrition'
import { computeBasket, basketsForBudget, type BasketItem } from '../lib/basket'
import { formatCoverage, formatKcal, formatKg, formatMoney, formatNumber } from '../lib/format'

/** Условный «средний набор» — быстрый старт для демо и жюри. Экспортируется для тестов. */
export const PRESET: BasketItem[] = [
  { productId: 'p04', qty: 40 }, // молоко 2,5%
  { productId: 'p10', qty: 20 }, // гречка
  { productId: 'p26', qty: 15 }, // тушёнка
  { productId: 'p17', qty: 10 }, // картофель
  { productId: 'p23', qty: 30 }, // хлеб белый
  { productId: 'p21', qty: 15 }, // яблоки
]

/** Демо-бюджет для «Пример набора», чтобы сразу показать бюджетные тайлы. */
const PRESET_BUDGET = '20000'

/**
 * initialDemo=true (deep-link ?tab=calc&run=demo) — открывается сразу
 * с примером набора в бюджете, как после кнопки «Пример набора».
 */
export default function CalculatorScreen({ initialDemo = false }: { initialDemo?: boolean }) {
  const [items, setItems] = useState<BasketItem[]>(() =>
    initialDemo ? PRESET.map((p) => ({ ...p })) : [],
  )
  const [productId, setProductId] = useState(products[0].id)
  const [qty, setQty] = useState('10')
  const [budget, setBudget] = useState(() => (initialDemo ? PRESET_BUDGET : ''))

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [])

  const add = () => {
    const n = Number(qty.replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) return
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === productId)
      if (existing) {
        return prev.map((i) => (i.productId === productId ? { ...i, qty: i.qty + n } : i))
      }
      return [...prev, { productId, qty: n }]
    })
  }

  const remove = (id: string) => setItems((prev) => prev.filter((i) => i.productId !== id))

  const { totalKg, totalKcal, totalCost, personDays, kgByCategory } = computeBasket(products, items)

  const budgetValue = Number(budget.replace(/\s/g, '').replace(',', '.'))
  const budgetSet = budget.trim() !== '' && Number.isFinite(budgetValue) && budgetValue > 0
  const baskets = budgetSet ? basketsForBudget(budgetValue, totalCost) : null
  const costPerDay =
    budgetSet && totalCost > 0 && personDays > 0 ? totalCost / personDays : null

  return (
    <section>
      <h1 className="section-title">Калькулятор покрытия</h1>
      <p className="section-sub">
        Соберите набор товаров и посмотрите по нормам «человеко-дня», на сколько людей и на сколько
        дней его хватит. Цены — реалистичные розничные X5; задайте бюджет, чтобы увидеть, сколько
        наборов в него влезает.
      </p>

      <div className="toolbar">
        <div className="field">
          <label className="field__label" htmlFor="calc-product">
            Товар
          </label>
          <select id="calc-product" value={productId} onChange={(e) => setProductId(e.target.value)}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({CATEGORY_LABEL[p.category]} · {p.price} ₽/{p.unit})
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
        <div className="field">
          <label className="field__label" htmlFor="calc-budget">
            Бюджет, ₽
          </label>
          <input
            id="calc-budget"
            type="number"
            inputMode="numeric"
            min="0"
            step="any"
            placeholder="не задан"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
        </div>
        <button type="button" className="btn btn--primary" onClick={add}>
          Добавить
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            setItems(PRESET.map((p) => ({ ...p })))
            setBudget(PRESET_BUDGET)
          }}
        >
          Пример набора
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => setItems([])}
          disabled={items.length === 0}
        >
          Очистить
        </button>
      </div>

      {items.length === 0 ? (
        <div className="empty">
          Добавьте позиции или нажмите «Пример набора» — увидите вес, калорийность, стоимость и
          покрытие «X человек на Y дней».
        </div>
      ) : (
        <>
          <div className="tiles">
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
            <div className="tile">
              <div className="tile__value">{formatMoney(totalCost)}</div>
              <div className="tile__label">Стоимость набора</div>
            </div>
            {baskets !== null && (
              <div className="tile">
                <div className="tile__value">
                  {baskets > 0 ? `${baskets} наб.` : '0 наборов'}
                </div>
                <div className="tile__label">Влезает в бюджет {formatMoney(budgetValue)}</div>
                <div className="tile__hint">
                  {baskets > 0
                    ? `останется ${formatMoney(budgetValue - baskets * totalCost)}`
                    : `не хватает ${formatMoney(totalCost - budgetValue)}`}
                </div>
              </div>
            )}
            {costPerDay !== null && (
              <div className="tile">
                <div className="tile__value">{formatMoney(costPerDay)}</div>
                <div className="tile__label">Цена человеко-дня</div>
                <div className="tile__hint">стоимость набора ÷ человеко-дни</div>
              </div>
            )}
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
                      {item.qty} {product.unit} · {formatKg(item.qty * product.unitWeightKg)} ·{' '}
                      {formatMoney(item.qty * product.price)}
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
