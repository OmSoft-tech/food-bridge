import { useEffect, useRef, useState } from 'react'
import { products, recipients, stores } from '../data'
import type { MatchPlan, Transfer } from '../lib/matching'
import { loadLeaflet } from '../lib/leaflet'
import { escapeHtml, formatCoverage, formatKg } from '../lib/format'
import type { Product, Recipient, Store } from '../types'

const MOSCOW_CENTER: [number, number] = [55.751, 37.618]
const LINE_PLANNED = '#e6b345'
const LINE_CONFIRMED = '#46d07c'

interface LineContext {
  productById: Map<string, Product>
  storeById: Map<string, Store>
  recipientById: Map<string, Recipient>
  onConfirm: (transferId: string) => void
}

/**
 * Содержимое попапа линии: маршрут, состав, вес, покрытие и статус —
 * кнопка «Подтвердить» для запланированных, подпись — для подтверждённых.
 */
function makeLinePopup(
  transfer: Transfer,
  store: Store,
  recipient: Recipient,
  isConfirmed: boolean,
  ctx: LineContext,
): HTMLElement {
  const content = document.createElement('div')
  content.className = 'map-popup'
  const itemsHtml = transfer.items
    .map((item) => {
      const product = ctx.productById.get(item.productId)
      if (!product) return ''
      return `<li>${escapeHtml(product.name)} — ${item.qty} ${escapeHtml(product.unit)} · ${formatKg(item.qty * product.unitWeightKg)}</li>`
    })
    .join('')
  content.innerHTML = [
    `<b>${escapeHtml(store.name)} → ${escapeHtml(recipient.name)}</b>`,
    `<ul>${itemsHtml}</ul>`,
    `Итого ${formatKg(transfer.totalKg)} · покрывает ${formatCoverage(transfer.personDays)}`,
  ].join('<br>')

  const status = document.createElement('div')
  if (isConfirmed) {
    status.className = 'map-status map-status--confirmed'
    status.textContent = '✅ Подтверждено — излишки зарезервированы за пунктом.'
  } else {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'btn btn--small'
    btn.textContent = 'Подтвердить'
    btn.dataset.transferId = transfer.id
    // Обработчик вешаем нативным Leaflet DOM API на узел попапа.
    L.DomEvent.on(btn, 'click', () => ctx.onConfirm(transfer.id))
    status.appendChild(btn)
  }
  content.appendChild(status)
  return content
}

/** Создание линии передачи со стилем по статусу и попапом. */
function createTransferLine(
  transfer: Transfer,
  isConfirmed: boolean,
  ctx: LineContext,
): LeafletPolyline {
  const store = ctx.storeById.get(transfer.storeId)
  const recipient = ctx.recipientById.get(transfer.recipientId)
  if (!store || !recipient) return L.polyline([], {})
  const line = L.polyline([[store.lat, store.lon], [recipient.lat, recipient.lon]], {
    color: isConfirmed ? LINE_CONFIRMED : LINE_PLANNED,
    weight: 3.5,
    opacity: 0.85,
    dashArray: isConfirmed ? undefined : '7 7',
  })
  line.bindPopup(makeLinePopup(transfer, store, recipient, isConfirmed, ctx))
  return line
}

export default function MapScreen({
  plan,
  confirmed,
  onConfirm,
}: {
  plan: MatchPlan | null
  confirmed: Set<string>
  onConfirm: (transferId: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [loadError, setLoadError] = useState(false)

  // Актуальные колбэки/статусы для асинхронного эффекта карты — по ref.
  const confirmedRef = useRef(confirmed)
  confirmedRef.current = confirmed
  const onConfirmRef = useRef(onConfirm)
  onConfirmRef.current = onConfirm

  const linesRef = useRef<LeafletPolyline[]>([])

  // Эффект A: карта, тайлы, маркеры и линии — создаётся один раз на план;
  // изменение confirmed не пересоздаёт карту.
  useEffect(() => {
    if (!plan) return
    let cancelled = false

    loadLeaflet()
      .then(() => {
        const el = containerRef.current
        if (cancelled || el === null || typeof window === 'undefined') return
        const map = L.map(el, { center: MOSCOW_CENTER, zoom: 10 })
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution:
            '© участники <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map)

        const ctx: LineContext = {
          productById: new Map(products.map((p) => [p.id, p])),
          storeById: new Map(stores.map((s) => [s.id, s])),
          recipientById: new Map(recipients.map((r) => [r.id, r])),
          onConfirm: (id) => onConfirmRef.current(id),
        }
        const points: [number, number][] = []

        for (const s of stores) {
          points.push([s.lat, s.lon])
          L.marker([s.lat, s.lon], {
            title: `${s.name} · ${s.address}`,
            icon: L.divIcon({
              className: 'map-pin map-pin--store',
              html: '<span aria-hidden="true">🏪</span>',
              iconSize: [30, 30],
              iconAnchor: [15, 15],
            }),
          })
            .addTo(map)
            .bindPopup(
              `<b>${escapeHtml(s.name)}</b><br>${escapeHtml(s.address)} · ${escapeHtml(s.district)}<br>сеть: ${escapeHtml(s.chain)}`,
            )
        }

        for (const r of recipients) {
          points.push([r.lat, r.lon])
          L.marker([r.lat, r.lon], {
            title: `${r.name} · ${r.address}`,
            icon: L.divIcon({
              className: 'map-pin map-pin--recipient',
              html: '<span aria-hidden="true">💚</span>',
              iconSize: [30, 30],
              iconAnchor: [15, 15],
            }),
          })
            .addTo(map)
            .bindPopup(`<b>${escapeHtml(r.name)}</b><br>${escapeHtml(r.address)} · ${escapeHtml(r.district)}`)
        }

        linesRef.current = plan.transfers.map((t) => {
          const line = createTransferLine(t, confirmedRef.current.has(t.id), ctx)
          line.addTo(map)
          const store = ctx.storeById.get(t.storeId)
          const recipient = ctx.recipientById.get(t.recipientId)
          if (store && recipient) {
            points.push([store.lat, store.lon], [recipient.lat, recipient.lon])
          }
          return line
        })

        if (points.length > 0) {
          map.fitBounds(L.latLngBounds(points), { padding: [30, 30] })
        }

        if (!cancelled) {
          mapRef.current = map
          setMapReady(true)
        } else {
          map.remove()
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })

    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      linesRef.current = []
      setMapReady(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- карта пересоздаётся только при смене плана
  }, [plan])

  // Эффект B: стили и попапы линий по статусу — без пересоздания карты.
  useEffect(() => {
    if (!mapReady || !plan) return
    const ctx: LineContext = {
      productById: new Map(products.map((p) => [p.id, p])),
      storeById: new Map(stores.map((s) => [s.id, s])),
      recipientById: new Map(recipients.map((r) => [r.id, r])),
      onConfirm,
    }
    plan.transfers.forEach((t, i) => {
      const line = linesRef.current[i]
      if (!line) return
      const isConfirmed = confirmed.has(t.id)
      line.setStyle({
        color: isConfirmed ? LINE_CONFIRMED : LINE_PLANNED,
        dashArray: isConfirmed ? undefined : '7 7',
      })
      const store = ctx.storeById.get(t.storeId)
      const recipient = ctx.recipientById.get(t.recipientId)
      if (store && recipient) {
        line.setPopupContent(makeLinePopup(t, store, recipient, isConfirmed, ctx))
      }
    })
  }, [mapReady, plan, confirmed, onConfirm])

  if (!plan) {
    return (
      <section>
        <h1 className="section-title">Карта передач</h1>
        <p className="section-sub">
          Магазины, пункты помощи и маршруты плана передач на карте Москвы (OpenStreetMap).
        </p>
        <div className="empty">
          Карта активна после запуска мэтчинга: постройте план на вкладке «Мэтчинг» — здесь
          появятся маркеры и маршруты с составом передач. Цвет линии: янтарный пунктир —
          запланировано, зелёная сплошная — подтверждено. Подтвердить передачу можно прямо в
          попапе линии.
          <br />
          <br />
          <a className="btn btn--primary" href="?tab=matching&run=demo">
            Построить план и открыть карту
          </a>
        </div>
      </section>
    )
  }

  return (
    <section>
      <h1 className="section-title">Карта передач</h1>
      <p className="section-sub">
        🏪 магазины · 💚 пункты помощи · янтарный пунктир — запланированные передачи, зелёная
        сплошная — подтверждённые. Кликните по линии: в попапе состав и кнопка «Подтвердить».
      </p>

      {loadError && (
        <p className="note">
          <span aria-hidden="true">⚠️</span>
          <span>
            Leaflet не загрузился с unpkg — проверьте интернет и обновите страницу. Остальные
            вкладки работают без сети.
          </span>
        </p>
      )}

      <div className="map" ref={containerRef} />
    </section>
  )
}
