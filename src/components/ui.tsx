import type { CSSProperties, ReactNode } from 'react'

export type BadgeTone = 'green' | 'amber' | 'red' | 'blue' | 'gray'

export function Badge({ tone = 'gray', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`badge${tone !== 'gray' ? ` badge--${tone}` : ''}`}>{children}</span>
}

export function StatTile({
  value,
  label,
  hint,
}: {
  value: string
  label: string
  hint?: string
}) {
  return (
    <div className="tile">
      <div className="tile__value">{value}</div>
      <div className="tile__label">{label}</div>
      {hint !== undefined && <div className="tile__hint">{hint}</div>}
    </div>
  )
}

/** Полоса из сегментов: value — доля 0..1. */
export function Bar({
  segments,
  height = 8,
}: {
  segments: { value: number; tone: 'done' | 'planned' }[]
  height?: number
}) {
  return (
    <div className="bar" style={{ height } as CSSProperties}>
      {segments.map(
        (s, i) =>
          s.value > 0 && (
            <div
              key={i}
              className={`bar__seg bar__seg--${s.tone}`}
              style={{ width: `${Math.min(100, s.value * 100)}%` }}
            />
          ),
      )}
    </div>
  )
}
