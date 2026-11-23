import { useEffect, useState } from 'react'
import { needs, products, surpluses } from './data'
import { buildMatchPlan, type MatchPlan } from './lib/matching'
import Dashboard from './components/Dashboard'
import SurplusScreen from './components/SurplusScreen'
import NeedsScreen from './components/NeedsScreen'
import MatchingScreen from './components/MatchingScreen'
import CalculatorScreen from './components/CalculatorScreen'

export type TabId = 'dashboard' | 'surplus' | 'needs' | 'matching' | 'calculator'

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Дашборд', icon: '📊' },
  { id: 'surplus', label: 'Излишки', icon: '🛒' },
  { id: 'needs', label: 'Нужды', icon: '🤝' },
  { id: 'matching', label: 'Мэтчинг', icon: '🔁' },
  { id: 'calculator', label: 'Калькулятор', icon: '🧮' },
]

function parseHash(fallback: TabId): TabId {
  const id = window.location.hash.replace('#', '') as TabId
  return TABS.some((t) => t.id === id) ? id : fallback
}

function useHashTab(): [TabId, (t: TabId) => void] {
  const [tab, setTab] = useState<TabId>(() => parseHash('dashboard'))
  useEffect(() => {
    const onHashChange = () => setTab(parseHash('dashboard'))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  const select = (t: TabId) => {
    window.location.hash = t
  }
  return [tab, select]
}

export default function App() {
  const [tab, selectTab] = useHashTab()
  const [plan, setPlan] = useState<MatchPlan | null>(null)

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
        {tab === 'surplus' && <SurplusScreen />}
        {tab === 'needs' && <NeedsScreen plan={plan} />}
        {tab === 'matching' && (
          <MatchingScreen plan={plan} onBuild={handleBuild} onReset={handleReset} onConfirm={handleConfirm} />
        )}
        {tab === 'calculator' && <CalculatorScreen />}
      </main>

      <footer className="footer">
        Фуд-мост · конкурс X5 «Вайбкодинг добрых дел» · демо на моковых данных, без бэкенда
      </footer>
    </div>
  )
}
