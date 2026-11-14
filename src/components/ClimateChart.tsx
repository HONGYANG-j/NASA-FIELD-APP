import type { MonthClimate } from '../lib/climate'
import { monthName } from '../lib/explain'

interface Props {
  months: MonthClimate[]
}

const W = 560
const H = 230
const PAD = { l: 44, r: 44, t: 16, b: 28 }

/** Average year at the site: monthly rainfall (bars) and mean temperature (line). */
export function ClimateChart({ months }: Props) {
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const maxRain = Math.max(50, ...months.map((m) => m.rainMm))
  const rainMax = Math.ceil(maxRain / 50) * 50
  const tMin = Math.min(...months.map((m) => m.tmean))
  const tMax = Math.max(...months.map((m) => m.tmean))
  const tLo = Math.floor((tMin - 2) / 5) * 5
  const tHi = Math.ceil((tMax + 2) / 5) * 5
  const x = (i: number) => PAD.l + (innerW / 12) * (i + 0.5)
  const yRain = (v: number) => PAD.t + innerH * (1 - v / rainMax)
  const yTemp = (v: number) => PAD.t + innerH * (1 - (v - tLo) / (tHi - tLo))
  const bw = (innerW / 12) * 0.6
  const line = months.map((m, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${yTemp(m.tmean).toFixed(1)}`).join(' ')
  const summary = `Average year: rainfall ranges from ${Math.round(Math.min(...months.map((m) => m.rainMm)))} to ${Math.round(maxRain)} mm per month; mean temperature ranges from ${tMin.toFixed(1)} to ${tMax.toFixed(1)} °C.`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="chart">
      {[0, 0.5, 1].map((f) => (
        <line key={f} x1={PAD.l} x2={W - PAD.r} y1={PAD.t + innerH * f} y2={PAD.t + innerH * f} className="chart-grid" />
      ))}
      {months.map((m, i) => (
        <g key={m.month}>
          <rect x={x(i) - bw / 2} y={yRain(m.rainMm)} width={bw} height={PAD.t + innerH - yRain(m.rainMm)} className="chart-bar">
            <title>{`${monthName(m.month)}: ${Math.round(m.rainMm)} mm rain, ${m.tmean.toFixed(1)} °C`}</title>
          </rect>
          <text x={x(i)} y={H - 8} textAnchor="middle" className="chart-label">
            {monthName(m.month)}
          </text>
        </g>
      ))}
      <path d={line} className="chart-line" fill="none" />
      {months.map((m, i) => (
        <circle key={m.month} cx={x(i)} cy={yTemp(m.tmean)} r={3} className="chart-dot" />
      ))}
      <text x={PAD.l - 6} y={PAD.t + 4} textAnchor="end" className="chart-label">{rainMax}</text>
      <text x={PAD.l - 6} y={PAD.t + innerH + 4} textAnchor="end" className="chart-label">0</text>
      <text x={PAD.l - 6} y={PAD.t - 6} textAnchor="end" className="chart-axis">mm</text>
      <text x={W - PAD.r + 6} y={PAD.t + 4} className="chart-label">{tHi}°</text>
      <text x={W - PAD.r + 6} y={PAD.t + innerH + 4} className="chart-label">{tLo}°</text>
    </svg>
  )
}
