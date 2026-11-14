import { monthName } from '../lib/explain'
import type { MonthNdvi } from '../lib/satellite'

export interface MonthlySeries {
  name: string
  /** CSS class for the drawing colour (see App.css). */
  cls: string
  months: MonthNdvi[]
}

interface Props {
  /** e.g. "mm per day" */
  unit: string
  /** Short description for screen readers, built by the caller from the data. */
  label: string
  series: MonthlySeries[]
  /** 'bars' for one series, 'lines' to compare two series (day and night temperature). */
  kind: 'bars' | 'lines'
  digits?: number
}

const W = 560
const H = 190
const PAD = { l: 44, r: 16, t: 14, b: 28 }

/** Monthly averages of one MODIS variable (all bundled years), with the min-max range across composites as a whisker. */
export function ModisMonthlyChart({ unit, label, series, kind, digits = 1 }: Props) {
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const all = series.flatMap((s) => s.months.filter((m) => Number.isFinite(m.mean)))
  if (!all.length) return null
  const lo0 = Math.min(...all.map((m) => m.min))
  const hi0 = Math.max(...all.map((m) => m.max))
  // Bars start at zero; lines zoom to the data range with a little room.
  const lo = kind === 'bars' ? Math.min(0, lo0) : Math.floor(lo0 - 1)
  const hi = kind === 'bars' ? Math.ceil(hi0 * 1.05 * 10) / 10 : Math.ceil(hi0 + 1)
  const span = hi - lo || 1
  const x = (i: number) => PAD.l + (innerW / 12) * (i + 0.5)
  const y = (v: number) => PAD.t + innerH * (1 - (v - lo) / span)
  const bw = (innerW / 12) * 0.6
  const ticks = [lo, lo + span / 2, hi]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="chart">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="chart-grid" />
          <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" className="chart-label">{Number(t.toFixed(digits))}</text>
        </g>
      ))}
      {kind === 'bars' &&
        series[0].months.map((m, i) =>
          Number.isFinite(m.mean) ? (
            <g key={m.month}>
              <rect x={x(i) - bw / 2} y={y(m.mean)} width={bw} height={Math.max(0, y(lo) - y(m.mean))} className={series[0].cls}>
                <title>{`${monthName(m.month)}: average ${m.mean.toFixed(digits)} ${unit} (range ${m.min.toFixed(digits)}-${m.max.toFixed(digits)}, ${m.n} composites)`}</title>
              </rect>
              <line x1={x(i)} x2={x(i)} y1={y(m.max)} y2={y(m.min)} className="chart-whisker" />
            </g>
          ) : null,
        )}
      {kind === 'lines' &&
        series.map((s) => {
          const pts = s.months.map((m, i) => (Number.isFinite(m.mean) ? ([x(i), y(m.mean), m] as const) : null))
          // A blank month breaks the line instead of being bridged.
          const path = pts.map((p, k) => (p ? `${pts[k - 1] ? 'L' : 'M'}${p[0]},${p[1]}` : '')).join(' ')
          return (
            <g key={s.name} className={s.cls}>
              <path d={path} fill="none" className="chart-modis-line" />
              {pts.map((p) =>
                p ? (
                  <circle key={p[2].month} cx={p[0]} cy={p[1]} r={3} className="chart-modis-dot">
                    <title>{`${s.name}, ${monthName(p[2].month)}: average ${p[2].mean.toFixed(digits)} ${unit} (range ${p[2].min.toFixed(digits)}-${p[2].max.toFixed(digits)}, ${p[2].n} composites)`}</title>
                  </circle>
                ) : null,
              )}
            </g>
          )
        })}
      {series[0].months.map((m, i) => (
        <text key={m.month} x={x(i)} y={H - 8} textAnchor="middle" className="chart-label">{monthName(m.month)}</text>
      ))}
      <text x={PAD.l - 6} y={PAD.t - 4} textAnchor="end" className="chart-axis">{unit}</text>
    </svg>
  )
}
