import { useEffect, useRef } from 'react'
import { buildReportHtml, type ReportData } from '../lib/report'

/**
 * Отдельный компонент отчёта: рендерит полный отчёт в изолированный
 * iframe-контейнер (скрытый на экране, живёт пока есть план).
 * window.print() из contentWindow печатает только документ отчёта —
 * основной лейаут страницы не затрагивается. Тот же HTML используется
 * кнопкой «Скачать HTML отчёт».
 */
export default function CoordinatorReport({
  data,
  print,
  onPrinted,
}: {
  data: ReportData
  /** true → вызывает печать отчёта (один раз на смену флага), затем onPrinted() */
  print: boolean
  onPrinted: () => void
}) {
  const frameRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!print) return
    try {
      const win = frameRef.current?.contentWindow
      if (win) {
        win.focus()
        win.print()
      }
    } finally {
      onPrinted()
    }
    // печать выполняется один раз на смену флага
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [print])

  return (
    <iframe
      ref={frameRef}
      title="Отчёт для Фонда"
      srcDoc={buildReportHtml(data)}
      style={{ position: 'fixed', right: 0, bottom: 0, width: 0, height: 0, border: 0, visibility: 'hidden' }}
    />
  )
}
