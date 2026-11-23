import { useEffect, useRef, useState } from 'react'
import { products, recipients, stores } from '../data'
import type { MatchPlan } from '../lib/matching'
import { loadLeaflet } from '../lib/leaflet'
import { escapeHtml, formatCoverage, formatKg } from '../lib/format'

const MOSCOW_CENTER: [number, number] = [55.751, 37.618]

/** HTML попапа передачи: маршрут, состав, вес, покрытие, статус. */
function transferPopup(
  storeName: string,
  recipientName: string,
  itemsHtml: string,
  totalKg: number,
  personDays: number,
  isConfirmed: boolean,
): string {
  return [
    `<b>${escapeHtml(storeName)} → ${escapeHtml(recipientName)}</b>`,
    `<ul>${itemsHtml}</ul>`,
    `Итого ${formatKg(totalKg)} · покрывает ${formatCoverage(personDays)}`,
    `Статус: ${isConfirmed ? '✅ подтверждено' : '🕓 запланировано'}`,
  ].join('<br>')
}

export default function MapScreen({
  plan,
  confirmed,
}: {
  plan: MatchPlan | null
  confirmed: Set<string>
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    if (!plan || containerRef.current === null) return
    let map: LeafletMap | null = null
    let cancelled = false

    loadLeaflet()
      .then(() => {
        const el = containerRef.current
        if (cancelled || el === null || typeof window === 'undefined') return
        map = L.map(el, { center: MOSCOW_CENTER, zoom: 10 })
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution:
            '© участники <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map)

        const productById = new Map(products.map((p) => [p.id, p]))
        const storeById = new Map(stores.map((s) => [s.id, s]))
        const recipientById = new Map(recipients.map((r) => [r.id, r]))
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

        for (const t of plan.transfers) {
          const store = storeById.get(t.storeId)
          const recipient = recipientById.get(t.recipientId)
          if (!store || !recipient) continue
          const isConfirmed = confirmed.has(t.id)
          const itemsHtml = t.items
            .map((item) => {
              const product = productById.get(item.productId)
              if (!product) return ''
              return `<li>${escapeHtml(product.name)} — ${item.qty} ${escapeHtml(product.unit)} · ${formatKg(item.qty * product.unitWeightKg)}</li>`
            })
            .join('')
          L.polyline([[store.lat, store.lon], [recipient.lat, recipient.lon]], {
            color: isConfirmed ? '#46d07c' : '#e6b345',
            weight: 3.5,
            opacity: 0.85,
            dashArray: isConfirmed ? undefined : '7 7',
          })
            .addTo(map)
            .bindPopup(
              transferPopup(
                store.name,
                recipient.name,
                itemsHtml,
                t.totalKg,
                t.personDays,
                isConfirmed,
              ),
            )
        }

        if (points.length > 0) {
          map.fitBounds(L.latLngBounds(points), { padding: [30, 30] })
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })

    return () => {
      cancelled = true
      map?.remove()
      map = null
    }
  }, [plan, confirmed])

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
          запланировано, зелёная сплошная — подтверждено.
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
        сплошная — подтверждённые. Кликните по линии — состав передачи.
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
