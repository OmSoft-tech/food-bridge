/**
 * Минимальные типы для Leaflet 1.9.x, загружаемого через CDN (unpkg),
 * без npm-зависимости. Покрывает только API, используемый MapScreen.
 */

interface LeafletLayer {
  addTo(map: LeafletMap): this
  bindPopup(html: string): this
}

interface LeafletBounds {}

interface LeafletMap {
  remove(): void
  fitBounds(bounds: LeafletBounds, options?: { padding?: [number, number] }): LeafletMap
}

interface LeafletMarker extends LeafletLayer {}

interface LeafletTileLayer extends LeafletLayer {}

interface LeafletPolyline extends LeafletLayer {}

interface LeafletDivIcon {}

declare const L: {
  map(container: HTMLElement | string, options?: { center?: [number, number]; zoom?: number }): LeafletMap
  tileLayer(
    url: string,
    options?: { attribution?: string; maxZoom?: number },
  ): LeafletTileLayer
  marker(
    coords: [number, number],
    options?: { icon?: LeafletDivIcon; title?: string },
  ): LeafletMarker
  polyline(
    coords: [number, number][],
    options?: { color?: string; weight?: number; opacity?: number; dashArray?: string },
  ): LeafletPolyline
  divIcon(options: {
    className?: string
    html?: string
    iconSize?: [number, number]
    iconAnchor?: [number, number]
  }): LeafletDivIcon
  latLngBounds(points: [number, number][]): LeafletBounds
}
