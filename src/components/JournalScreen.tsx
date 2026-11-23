import { useState } from 'react'
import {
  ACTION_LABEL,
  filterJournal,
  JOURNAL_ACTIONS,
  type HistoryAction,
  type HistoryEntry,
  type JournalFilters,
} from '../lib/journal'
import { downloadCsv, journalCsvFilename, journalToCsv } from '../lib/csv'
import { formatTime } from '../lib/format'
import { Badge, type BadgeTone } from './ui'

const TONE_BY_ACTION: Record<HistoryAction, BadgeTone> = {
  build: 'blue',
  confirm: 'green',
  reset: 'amber',
  export: 'blue',
  'calc-add': 'gray',
  'calc-remove': 'gray',
  'calc-clear': 'gray',
  'calc-preset': 'gray',
  refill: 'green',
}

export default function JournalScreen({
  history,
  onClearHistory,
}: {
  history: HistoryEntry[]
  onClearHistory: () => void
}) {
  const [action, setAction] = useState<HistoryAction | 'all'>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [query, setQuery] = useState('')

  const filters: JournalFilters = { action, from: from || null, to: to || null, query }
  const visible = filterJournal(history, filters).slice().reverse() // свежие сверху

  const filtersActive =
    action !== 'all' || from !== '' || to !== '' || query.trim() !== ''

  const resetFilters = () => {
    setAction('all')
    setFrom('')
    setTo('')
    setQuery('')
  }

  return (
    <section>
      <h1 className="section-title">Журнал действий оператора</h1>
      <p className="section-sub">
        Все значимые действия: построение и подтверждение передач, сброс плана, экспорт и работа с
        набором в калькуляторе. Хранится локально (последние 200 записей).
      </p>

      <div className="toolbar">
        <div className="field">
          <label className="field__label" htmlFor="j-action">
            Тип действия
          </label>
          <select
            id="j-action"
            value={action}
            onChange={(e) => setAction(e.target.value as HistoryAction | 'all')}
          >
            <option value="all">все типы</option>
            {JOURNAL_ACTIONS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="j-from">
            Дата с
          </label>
          <input id="j-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="j-to">
            Дата по
          </label>
          <input id="j-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="j-query">
            Поиск
          </label>
          <input
            id="j-query"
            type="search"
            placeholder="по тексту события"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button type="button" className="btn btn--ghost" onClick={resetFilters} disabled={!filtersActive}>
          Сбросить фильтры
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={visible.length === 0}
          onClick={() => downloadCsv(journalCsvFilename(), journalToCsv(visible))}
        >
          ⬇ Скачать CSV журнала
        </button>
      </div>

      {history.length === 0 ? (
        <div className="empty">Журнал пуст — записи появятся по мере работы с приложением.</div>
      ) : visible.length === 0 ? (
        <div className="empty">По фильтрам ничего не найдено — ослабьте условия.</div>
      ) : (
        <div className="breakdown">
          <p className="section-sub" style={{ marginBottom: 8 }}>
            Показано {visible.length} из {history.length} записей
            {filtersActive ? ' (с учётом фильтров)' : ''}.
          </p>
          <ul className="list">
            {visible.map((e, i) => (
              <li className="list__item" key={`${e.ts}-${i}`}>
                <span>
                  <Badge tone={TONE_BY_ACTION[e.action]}>{ACTION_LABEL[e.action]}</Badge>{' '}
                  {e.label}
                </span>
                <span>{formatTime(e.ts)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {history.length > 0 && (
        <button
          type="button"
          className="btn btn--small btn--ghost"
          style={{ marginTop: 10 }}
          onClick={() => {
            onClearHistory()
            resetFilters()
          }}
        >
          Очистить журнал
        </button>
      )}
    </section>
  )
}
