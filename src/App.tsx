import { useEffect, useState } from 'react'
import { needs, products, recipients, stores, surpluses } from './data'
import { buildMatchPlan, type MatchPlan } from './lib/matching'
import { formatKg } from './lib/format'
import Dashboard from './components/Dashboard'
import SurplusScreen from './components/SurplusScreen'
import NeedsScreen from './components/NeedsScreen'
import MatchingScreen from './components/MatchingScreen'
import MapScreen from './components/MapScreen'
import CalculatorScreen from './components/CalculatorScreen'

export type TabId = 'dashboard' | 'surpluses' | 'needs' | 'matching' | 'calc' | 'map'

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Дашборд', icon: '📊' },
  { id: 'surpluses', label: 'Излишки', icon: '🛒' },
  { id: 'needs', label: 'Нужды', icon: '🤝' },
  { id: 'matching', label: 'Мэтчинг', icon: '🔁' },
  { id: 'calc', label: 'Калькулятор', icon: '🧮' },
  { id: 'map', label: 'Карта', icon: '🗺️' },
]

const isTabId = (v: string): v is TabId => TABS.some((t) => t.id === v)

interface LaunchParams {
  tab: TabId
  runDemo: boolean
}

/**
 * Разбор deep-link параметров: ?tab=dashboard|surpluses|needs|matching|calc
 * и &run=demo (на мэтчинге сразу строит план, на калькуляторе подставляет
 * пример набора). Старые #hash-ссылки тоже понимаем.
 */
function parseLaunchParams(): LaunchParams {
  const sp = new URLSearchParams(window.location.search)
  const raw = sp.get('tab') ?? window.location.hash.replace(/^#/, '')
  const tab = raw && isTabId(raw) ? raw : 'dashboard'
  // run=demo: план строится сразу на мэтчинге; calc подставляет набор;
  // map показывает карту с готовым планом
  return {
    tab,
    runDemo:
      sp.get('run') === 'demo' &&
      (tab === 'matching' || tab === 'calc' || tab === 'map'),
  }
}

/** Вкладка живёт в URL (?tab=…) — ссылки шарябельные, back/forward синхронен. */
function useTabFromUrl(): [TabId, (t: TabId) => void] {
  const [tab, setTab] = useState<TabId>(() => parseLaunchParams().tab)
  useEffect(() => {
    const sync = () => setTab(parseLaunchParams().tab)
    window.addEventListener('popstate', sync)
    window.addEventListener('hashchange', sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener('hashchange', sync)
    }
  }, [])
  const select = (t: TabId) => {
    setTab(t)
    const sp = new URLSearchParams(window.location.search)
    sp.set('tab', t)
    sp.delete('run') // run=demo — одноразовый параметр запуска
    const qs = sp.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
  }
  return [tab, select]
}

/* ── Подтверждения и история: localStorage ─────────────────────────── */

const CONFIRMED_KEY = 'food-bridge.confirmed.v1'
const HISTORY_KEY = 'food-bridge.history.v1'
const HISTORY_LIMIT = 50

export type HistoryAction = 'build' | 'confirm' | 'reset'

export interface HistoryEntry {
  ts: number
  action: HistoryAction
  label: string
}

const HISTORY_ACTIONS: HistoryAction[] = ['build', 'confirm', 'reset']

function loadConfirmed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(CONFIRMED_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    const ids = Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string')
      : []
    return new Set(ids)
  } catch {
    return new Set()
  }
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (e): e is HistoryEntry =>
          typeof e === 'object' &&
          e !== null &&
          typeof (e as HistoryEntry).ts === 'number' &&
          typeof (e as HistoryEntry).label === 'string' &&
          HISTORY_ACTIONS.includes((e as HistoryEntry).action),
      )
      .slice(-HISTORY_LIMIT)
  } catch {
    return []
  }
}

export default function App() {
  const [launch] = useState(parseLaunchParams) // параметры запуска — один раз на загрузку
  const [tab, selectTab] = useTabFromUrl()
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(loadConfirmed)
  // План строится на старте, если есть подтверждения в localStorage (id передач
  // детерминированы) или если открыли демо-ссылку run=demo (мэтчинг/карта).
  const [plan, setPlan] = useState<MatchPlan | null>(() => {
    if ((launch.runDemo && (launch.tab === 'matching' || launch.tab === 'map')) || confirmedIds.size > 0) {
      return buildMatchPlan(products, surpluses, needs)
    }
    return null
  })
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory)

  useEffect(() => {
    try {
      window.localStorage.setItem(CONFIRMED_KEY, JSON.stringify([...confirmedIds]))
    } catch {
      /* приватный режим — подтверждения живут только в сессии */
    }
  }, [confirmedIds])

  useEffect(() => {
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
    } catch {
      /* см. выше */
    }
  }, [history])

  const storeById = new Map(stores.map((s) => [s.id, s]))
  const recipientById = new Map(recipients.map((r) => [r.id, r]))

  const logHistory = (action: HistoryAction, label: string) =>
    setHistory((prev) => [...prev, { ts: Date.now(), action, label }].slice(-HISTORY_LIMIT))

  const handleBuild = () => {
    const next = buildMatchPlan(products, surpluses, needs)
    setPlan(next)
    logHistory('build', `построен план: ${next.transfers.length} передач, ${formatKg(next.totalKg)}`)
  }
  const handleReset = () => {
    setPlan(null)
    logHistory('reset', 'план сброшен')
  }
  const handleConfirm = (transferId: string) => {
    setConfirmedIds((prev) => new Set(prev).add(transferId))
    const t = plan?.transfers.find((x) => x.id === transferId)
    if (t) {
      const store = storeById.get(t.storeId)
      const recipient = recipientById.get(t.recipientId)
      logHistory(
        'confirm',
        `подтверждена передача #${transferId}: ${store?.name} → ${recipient?.name}, ${formatKg(t.totalKg)}`,
      )
    }
  }
  const handleClearHistory = () => setHistory([])

  return (
    <div className="app">
      <header className="header">
        <div className="header__inner">
          <div className="logo">
            <span className="logo__icon" aria-hidden="true">
              🌉
            </span>
            <div>
              <div className="logo__name">Фуд-мост</div>
              <div className="logo__tagline">мостим излишки магазинов и нужды фондов</div>
            </div>
          </div>
        </div>
        <nav className="tabs" aria-label="Разделы приложения">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`tab${tab === t.id ? ' tab--active' : ''}`}
              aria-pressed={tab === t.id}
              onClick={() => selectTab(t.id)}
            >
              <span aria-hidden="true">{t.icon}</span> {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="main">
        {tab === 'dashboard' && <Dashboard plan={plan} confirmed={confirmedIds} />}
        {tab === 'surpluses' && <SurplusScreen />}
        {tab === 'needs' && <NeedsScreen plan={plan} confirmed={confirmedIds} />}
        {tab === 'matching' && (
          <MatchingScreen
            plan={plan}
            confirmed={confirmedIds}
            history={history}
            onBuild={handleBuild}
            onReset={handleReset}
            onConfirm={handleConfirm}
            onClearHistory={handleClearHistory}
          />
        )}
        {tab === 'calc' && <CalculatorScreen initialDemo={launch.runDemo && launch.tab === 'calc'} />}
        {tab === 'map' && <MapScreen plan={plan} confirmed={confirmedIds} />}
      </main>

      <footer className="footer">
        Фуд-мост · конкурс X5 «Вайбкодинг добрых дел» · демо на моковых данных, без бэкенда
      </footer>
    </div>
  )
}
