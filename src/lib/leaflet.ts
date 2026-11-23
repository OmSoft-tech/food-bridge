/**
 * Загрузчик Leaflet с CDN unpkg (без npm-зависимости): один инжект CSS+JS
 * на страницу, промис кешируется. Ошибка сети — reject с возможностью
 * повторной попытки.
 */

const LEAFLET_VERSION = '1.9.4'

let leafletPromise: Promise<void> | null = null

function isLoaded(): boolean {
  return typeof window !== 'undefined' && Boolean((window as { L?: unknown }).L)
}

export function loadLeaflet(): Promise<void> {
  if (isLoaded()) return Promise.resolve()
  if (leafletPromise) return leafletPromise

  leafletPromise = new Promise<void>((resolve, reject) => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`
    document.head.appendChild(link)

    const script = document.createElement('script')
    script.src = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      leafletPromise = null // позволить повторную попытку при следующем заходе
      reject(new Error(`Не удалось загрузить Leaflet ${LEAFLET_VERSION} с unpkg`))
    }
    document.head.appendChild(script)
  })

  return leafletPromise
}
