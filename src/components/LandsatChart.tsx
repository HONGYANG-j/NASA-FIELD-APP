import type { LandsatFile, NdviFile } from '../lib/satellite'
import { SPARSE_NDVI } from '../lib/satellite'

interface Props {
  landsat: LandsatFile
  /** Bundled MODIS series for the same place, drawn as a grey line for comparison. */
  modis: NdviFile | null
}

const W = 560
const H = 230
const PAD = { l: 40, r: 16, t: 14, b: 28 }
const Y_MIN = -0.2
const Y_MAX = 1

/** Every clear Landsat NDVI observation (30 m) as a dot over time, with the MODIS 250 m series behind it. */
export function LandsatChart({ landsat, modis }: Props) {
  const t0 = Date.UTC(landsat.years[0], 0, 1)
  const t1 = Date.UTC(landsat.years[1] + 1, 0, 1)
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const x = (iso: string) => PAD.l + innerW * ((Date.parse(iso) - t0) / (t1 - t0))
  const y = (v: number) => PAD.t + innerH * (1 - (Math.min(Y_MAX, Math.max(Y_MIN, v)) - Y_MIN) / (Y_MAX - Y_MIN))
  const years = Array.from({ length: landsat.years[1] - landsat.years[0] + 1 }, (_, i) => landsat.years[0] + i)

  // Break the MODIS line where a composite is missing instead of drawing across the gap.
  const segments: string[] = []
  let current = ''
  for (const [d, v] of modis?.points ?? []) {
    if (v === null || !Number.isFinite(v)) {
      if (current) segments.push(current)
      current = ''
    } else {
      current += `${current ? 'L' : 'M'}${x(d).toFixed(1)},${y(v).toFixed(1)}`
    }
  }
  if (current) segments.push(current)

  const summary = `Landsat NDVI at 30 m: ${landsat.points.length} clear observations from ${landsat.years[0]} to ${landsat.years[1]}, ranging from ${Math.min(...landsat.points.map((p) => p[1])).toFixed(2)} to ${Math.max(...landsat.points.map((p) => p[1])).toFixed(2)}.`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="chart">
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(f)} y2={y(f)} className="chart-grid" />
          <text x={PAD.l - 6} y={y(f) + 4} textAnchor="end" className="chart-label">{f}</text>
        </g>
      ))}
      <line x1={PAD.l} x2={W - PAD.r} y1={y(SPARSE_NDVI)} y2={y(SPARSE_NDVI)} className="chart-threshold" />
      {segments.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="var(--muted)" strokeWidth={1.5} opacity={0.55} />
      ))}
      {landsat.points.map(([date, v, plat]) => (
        <circle key={date} cx={x(date)} cy={y(v)} r={3.2} style={{ fill: 'var(--accent)', opacity: 0.85 }}>
          <title>{`${date}: NDVI ${v.toFixed(2)} (Landsat ${plat.replaceAll('L', '').replaceAll('+', ' and ')})`}</title>
        </circle>
      ))}
      {years.map((yr) => (
        <text key={yr} x={x(`${yr}-07-01`)} y={H - 8} textAnchor="middle" className="chart-label">{yr}</text>
      ))}
      {years.slice(1).map((yr) => (
        <line key={yr} x1={x(`${yr}-01-01`)} x2={x(`${yr}-01-01`)} y1={PAD.t} y2={PAD.t + innerH} className="chart-grid" />
      ))}
      <text x={PAD.l - 6} y={PAD.t - 4} textAnchor="end" className="chart-axis">NDVI</text>
    </svg>
  )
}
