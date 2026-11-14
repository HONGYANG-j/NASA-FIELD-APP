import { monthName } from '../lib/explain'
import type { MonthNdvi } from '../lib/satellite'
import { SPARSE_NDVI } from '../lib/satellite'

interface Props {
  months: MonthNdvi[]
}

const W = 560
const H = 200
const PAD = { l: 40, r: 16, t: 14, b: 28 }

/** Average greenness (MODIS NDVI) per calendar month, with the min-max range across years. */
export function VegetationChart({ months }: Props) {
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const x = (i: number) => PAD.l + (innerW / 12) * (i + 0.5)
  const y = (v: number) => PAD.t + innerH * (1 - Math.min(1, Math.max(0, v)))
  const bw = (innerW / 12) * 0.6
  const valid = months.filter((m) => Number.isFinite(m.mean))
  const lo = valid.length ? Math.min(...valid.map((m) => m.mean)) : 0
  const hi = valid.length ? Math.max(...valid.map((m) => m.mean)) : 0
  const summary = `Satellite greenness (NDVI) by month: monthly average ranges from ${lo.toFixed(2)} to ${hi.toFixed(2)}. Values below ${SPARSE_NDVI} mean sparse or bare ground.`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="chart">
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(f)} y2={y(f)} className="chart-grid" />
          <text x={PAD.l - 6} y={y(f) + 4} textAnchor="end" className="chart-label">{f}</text>
        </g>
      ))}
      <line x1={PAD.l} x2={W - PAD.r} y1={y(SPARSE_NDVI)} y2={y(SPARSE_NDVI)} className="chart-threshold" />
      {months.map((m, i) =>
        Number.isFinite(m.mean) ? (
          <g key={m.month}>
            <rect x={x(i) - bw / 2} y={y(m.mean)} width={bw} height={PAD.t + innerH - y(m.mean)}
              className={m.mean < SPARSE_NDVI ? 'chart-bar-sparse' : 'chart-bar-green'}>
              <title>{`${monthName(m.month)}: average NDVI ${m.mean.toFixed(2)} (range ${m.min.toFixed(2)}-${m.max.toFixed(2)}, ${m.n} composites)`}</title>
            </rect>
            <line x1={x(i)} x2={x(i)} y1={y(m.max)} y2={y(m.min)} className="chart-whisker" />
            <text x={x(i)} y={H - 8} textAnchor="middle" className="chart-label">{monthName(m.month)}</text>
          </g>
        ) : (
          <text key={m.month} x={x(i)} y={H - 8} textAnchor="middle" className="chart-label">{monthName(m.month)}</text>
        ),
      )}
      <text x={PAD.l - 6} y={PAD.t - 4} textAnchor="end" className="chart-axis">NDVI</text>
    </svg>
  )
}
