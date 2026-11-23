import { useEffect, useState } from 'react'
import { needs, products, surpluses } from './data'
import { buildMatchPlan, type MatchPlan } from './lib/matching'
import Dashboard from './components/Dashboard'
import SurplusScreen from './components/SurplusScreen'
import NeedsScreen from './components/NeedsScreen'
import MatchingScreen from './components/MatchingScreen'
import CalculatorScreen from './components/CalculatorScreen'

export type TabId = 'dashboard' | 'surpluses' | 'needs' | 'matching' | 'calc'

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Дашборд', icon: '📊' },
  { id: 'surpluses', label: 'Излишки', icon: '🛒' },
  { id: 'needs', label: 'Нужды', icon: '🤝' },
  { id: 'matching', label: 'Мэтчинг', icon: '🔁' },
  { id: 'calc', label: 'Калькулятор', icon: '🧮' },
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
  return { tab, runDemo: sp.get('run') === 'demo' && (tab === 'matching' || tab === 'calc') }
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

export default function App() {
  const [launch] = useState(parseLaunchParams) // параметры запуска — один раз на загрузку
  const [tab, selectTab] = useTabFromUrl()
  const [plan, setPlan] = useState<MatchPlan | null>(() =>
    launch.runDemo && launch.tab === 'matching' ? buildMatchPlan(products, surpluses, needs) : null,
  )

  const handleBuild = () => setPlan(buildMatchPlan(products, surpluses, needs))
  const handleReset = () => setPlan(null)
  const handleConfirm = (transferId: string) =>
    setPlan((prev) =>
      prev
        ? {
            ...prev,
            transfers: prev.transfers.map((t) =>
              t.id === transferId ? { ...t, status: 'confirmed' as const } : t,
            ),
          }
        : prev,
    )

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
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'surpluses' && <SurplusScreen />}
        {tab === 'needs' && <NeedsScreen plan={plan} />}
        {tab === 'matching' && (
          <MatchingScreen plan={plan} onBuild={handleBuild} onReset={handleReset} onConfirm={handleConfirm} />
        )}
        {tab === 'calc' && <CalculatorScreen initialDemo={launch.runDemo && launch.tab === 'calc'} />}
      </main>

      <footer className="footer">
        Фуд-мост · конкурс X5 «Вайбкодинг добрых дел» · демо на моковых данных, без бэкенда
      </footer>
    </div>
  )
}
