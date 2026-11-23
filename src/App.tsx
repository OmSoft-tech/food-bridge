import { useCallback, useEffect, useMemo, useState } from 'react'
import { needs, products, recipients, stores, surpluses } from './data'
import { buildMatchPlan, type MatchPlan } from './lib/matching'
import { computeUncovered } from './lib/uncovered'
import { mergeRefillItems, type BasketItem } from './lib/basket'
import { formatKg, formatMoney } from './lib/format'
import { planPickupSchedule } from './lib/schedule'
import { loadJournal, HISTORY_KEY, HISTORY_LIMIT, type HistoryAction, type HistoryEntry } from './lib/journal'
import {
  dedupeRequests,
  loadRequests,
  nextRequestId,
  saveRequests,
  type OperatorRequest,
  type RequestDraft,
} from './lib/requests'
import Dashboard from './components/Dashboard'
import SurplusScreen from './components/SurplusScreen'
import NeedsScreen from './components/NeedsScreen'
import MatchingScreen from './components/MatchingScreen'
import CalculatorScreen, { PRESET, PRESET_BUDGET } from './components/CalculatorScreen'
import JournalScreen from './components/JournalScreen'
import MapScreen from './components/MapScreen'

export type TabId = 'dashboard' | 'surpluses' | 'needs' | 'matching' | 'calc' | 'journal' | 'map'

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Дашборд', icon: '📊' },
  { id: 'surpluses', label: 'Излишки', icon: '🛒' },
  { id: 'needs', label: 'Нужды', icon: '🤝' },
  { id: 'matching', label: 'Мэтчинг', icon: '🔁' },
  { id: 'calc', label: 'Калькулятор', icon: '🧮' },
  { id: 'journal', label: 'Журнал', icon: '📜' },
  { id: 'map', label: 'Карта', icon: '🗺️' },
]

const isTabId = (v: string): v is TabId => TABS.some((t) => t.id === v)

interface LaunchParams {
  tab: TabId
  runDemo: boolean
}

/**
 * Разбор deep-link параметров: ?tab=… и &run=demo (на мэтчинге сразу строит
 * план, на калькуляторе подставляет пример набора, на карте открывает с
 * готовым планом). Старые #hash-ссылки тоже понимаем.
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

/* ── Подтверждения и журнал: localStorage ──────────────────────────── */

const CONFIRMED_KEY = 'food-bridge.confirmed.v1'

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

export default function App() {
  const [launch] = useState(parseLaunchParams) // параметры запуска — один раз на загрузку
  const [tab, selectTab] = useTabFromUrl()
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(loadConfirmed)
  // План строится на старте, если есть подтверждения в localStorage (id передач
  // детерминированы) или если открыли демо-ссылку run=demo (мэтчинг/карта).
  const [plan, setPlan] = useState<MatchPlan | null>(() => {
    if ((launch.runDemo && (launch.tab === 'matching' || launch.tab === 'map')) || confirmedIds.size > 0) {
      return buildMatchPlan(products, surpluses, [...needs, ...loadRequests()])
    }
    return null
  })
  const [history, setHistory] = useState<HistoryEntry[]>(loadJournal)
  // Ручные заявки пунктов помощи — участвуют в мэтчинге как доп. нужды.
  const [requests, setRequests] = useState<OperatorRequest[]>(loadRequests)
  /** Все нужды для алгоритмов: моки + ручные заявки оператора. */
  const allNeeds = useMemo(() => [...needs, ...requests], [requests])
  // Непокрытые нужды и стоимость докупки — пересчитываются вместе с планом.
  const uncovered = useMemo(
    () => (plan ? computeUncovered(products, allNeeds, plan) : null),
    [plan, allNeeds],
  )
  // План вывозов на неделю: дни по срокам годности + маршруты по расстоянию.
  const schedule = useMemo(
    () => (plan ? planPickupSchedule(plan, surpluses, stores, recipients, confirmedIds) : null),
    [plan, confirmedIds],
  )

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

  useEffect(() => {
    saveRequests(requests)
  }, [requests])

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [])
  const storeById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [])
  const recipientById = useMemo(() => new Map(recipients.map((r) => [r.id, r])), [])

  /** Запись значимого действия оператора в журнал (стабильная ссылка). */
  const logHistory = useCallback(
    (action: HistoryAction, label: string) =>
      setHistory((prev) => [...prev, { ts: Date.now(), action, label }].slice(-HISTORY_LIMIT)),
    [],
  )

  const priorityLabel = (p: OperatorRequest['priority']): string => (p === 'high' ? 'высокий' : 'средний')

  /** Добавление ручной заявки (форма уже валидирована). */
  const handleAddRequest = useCallback(
    (draft: RequestDraft) => {
      const id = nextRequestId(requests)
      const request: OperatorRequest = {
        id,
        recipientId: draft.recipientId,
        productId: draft.productId,
        desiredQty: draft.qty,
        fulfilledQty: 0,
        priority: draft.priority,
        createdAt: Date.now(),
      }
      setRequests((prev) => dedupeRequests([...prev, request]))
      const product = productById.get(draft.productId)
      const recipient = recipientById.get(draft.recipientId)
      logHistory(
        'request-add',
        `добавлена заявка: ${product?.name ?? draft.productId} × ${draft.qty} ${product?.unit ?? ''} для ${recipient?.name ?? draft.recipientId} (приоритет ${priorityLabel(draft.priority)})`,
      )
    },
    [requests, productById, recipientById, logHistory],
  )

  const handleRemoveRequest = useCallback(
    (id: string) => {
      const request = requests.find((r) => r.id === id)
      setRequests((prev) => prev.filter((r) => r.id !== id))
      if (request) {
        const product = productById.get(request.productId)
        const recipient = recipientById.get(request.recipientId)
        logHistory(
          'request-remove',
          `удалена заявка: ${product?.name ?? request.productId} × ${request.desiredQty} ${product?.unit ?? ''} для ${recipient?.name ?? request.recipientId}`,
        )
      }
    },
    [requests, productById, recipientById, logHistory],
  )

  const handleBuild = () => {
    const next = buildMatchPlan(products, surpluses, allNeeds)
    setPlan(next)
    logHistory('build', `построен план: ${next.transfers.length} передач, ${formatKg(next.totalKg)}`)
  }
  const handleReset = () => {
    setPlan(null)
    logHistory('reset', 'план сброшен')
  }
  // useCallback: идентичность колбэка важна для MapScreen (эффект стилей
  // линий не должен пере-sync на каждый рендер App).
  const handleConfirm = useCallback(
    (transferId: string) => {
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
    },
    [plan, storeById, recipientById, logHistory],
  )
  const handleClearHistory = () => setHistory([])

  /* ── Калькулятор: набор живёт в App, докупки добавляются из «Непокрытых нужд» ── */

  const [calcItems, setCalcItems] = useState<BasketItem[]>(() =>
    launch.runDemo && launch.tab === 'calc' ? PRESET.map((p) => ({ ...p })) : [],
  )
  const [calcBudget, setCalcBudget] = useState(() =>
    launch.runDemo && launch.tab === 'calc' ? PRESET_BUDGET : '',
  )

  const priceById = useMemo(() => new Map(products.map((p) => [p.id, p.price])), [])

  /** Дефицит → набор калькулятора: без дублей, журнал + переход на вкладку. */
  const handleAddRefills = useCallback(
    (refills: BasketItem[]) => {
      if (refills.length === 0) return
      const fresh = refills.filter(
        (r) =>
          !calcItems.some(
            (i) => i.refillOf && i.productId === r.productId && i.recipientId === r.recipientId,
          ),
      )
      if (fresh.length === 0) {
        logHistory('refill', 'дефицит уже в калькуляторе — добавлять нечего')
        selectTab('calc')
        return
      }
      setCalcItems(mergeRefillItems(calcItems, fresh).items)
      const cost = fresh.reduce((sum, r) => sum + r.qty * (priceById.get(r.productId) ?? 0), 0)
      logHistory(
        'refill',
        `в калькулятор отправлен дефицит: ${fresh.length} позиций, докупка ≈ ${formatMoney(cost)}`,
      )
      selectTab('calc')
    },
    [calcItems, logHistory, priceById, selectTab],
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
        {tab === 'dashboard' && <Dashboard plan={plan} confirmed={confirmedIds} uncovered={uncovered} />}
        {tab === 'surpluses' && <SurplusScreen />}
        {tab === 'needs' && (
          <NeedsScreen
            plan={plan}
            confirmed={confirmedIds}
            requests={requests}
            onAddRequest={handleAddRequest}
            onRemoveRequest={handleRemoveRequest}
          />
        )}
        {tab === 'matching' && (
          <MatchingScreen
            plan={plan}
            confirmed={confirmedIds}
            history={history}
            uncovered={uncovered}
            schedule={schedule}
            onBuild={handleBuild}
            onReset={handleReset}
            onConfirm={handleConfirm}
            onLog={logHistory}
            onAddRefills={handleAddRefills}
          />
        )}
        {tab === 'calc' && (
          <CalculatorScreen
            items={calcItems}
            budget={calcBudget}
            onItemsChange={setCalcItems}
            onBudgetChange={setCalcBudget}
            onLog={logHistory}
          />
        )}
        {tab === 'journal' && (
          <JournalScreen
            history={history}
            onClearHistory={handleClearHistory}
          />
        )}
        {tab === 'map' && <MapScreen plan={plan} confirmed={confirmedIds} onConfirm={handleConfirm} />}
      </main>

      <footer className="footer">
        Фуд-мост · конкурс X5 «Вайбкодинг добрых дел» · демо на моковых данных, без бэкенда
      </footer>
    </div>
  )
}
