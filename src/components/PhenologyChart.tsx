import { doyLabel, growingSeasons, typicalCycles } from '../lib/satellite'
import type { ModisFile } from '../lib/satellite'

const W = 560
const PAD = { l: 58, r: 16, t: 10, b: 26 }
const ROW = 22

const t = (iso: string) => Date.parse(iso + 'T00:00:00Z')

/**
 * Growing seasons MODIS found at the pixel (MCD12Q2): a bar from the start of greenness increase to dormancy for each
 * vegetation cycle, one row per cycle, with a mark where greenness starts to decrease.
 */
export function PhenologyChart({ file }: { file: ModisFile }) {
  const seasons = growingSeasons(file).filter((g) => g.dormancy)
  if (!seasons.length) return null
  const rows = [...new Set(seasons.map((s) => s.cycle))].sort()
  const first = new Date(t(seasons[0].greenup)).getUTCFullYear()
  const last = new Date(Math.max(...seasons.map((s) => t(s.dormancy as string)))).getUTCFullYear()
  const t0 = Date.UTC(first, 0, 1)
  const t1 = Date.UTC(last + 1, 0, 1)
  const innerW = W - PAD.l - PAD.r
  const H = PAD.t + rows.length * ROW + PAD.b
  const x = (ms: number) => PAD.l + (innerW * (ms - t0)) / (t1 - t0)
  const typical = typicalCycles(file)
  const summary = `Growing seasons found by MODIS from ${first} to ${last}: ${typical
    .map((c) => `cycle ${c.cycle} typically starts about ${doyLabel(c.greenupDoy)} and ends about ${doyLabel(c.dormancyDoy)}`)
    .join('; ')}.`
  const years = Array.from({ length: last - first + 1 }, (_, i) => first + i)
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="chart">
        {years.map((y) => (
          <g key={y}>
            <line x1={x(Date.UTC(y, 0, 1))} x2={x(Date.UTC(y, 0, 1))} y1={PAD.t} y2={H - PAD.b} className="chart-grid" />
            <text x={x(Date.UTC(y, 6, 1))} y={H - 8} textAnchor="middle" className="chart-label">{y}</text>
          </g>
        ))}
        {rows.map((r, i) => (
          <text key={r} x={PAD.l - 6} y={PAD.t + i * ROW + 14} textAnchor="end" className="chart-label">{`Cycle ${r}`}</text>
        ))}
        {seasons.map((s) => {
          const row = rows.indexOf(s.cycle)
          const x0 = x(t(s.greenup))
          const x1 = x(t(s.dormancy as string))
          const y0 = PAD.t + row * ROW + 4
          return (
            <g key={`${s.layerYear}-${s.cycle}`}>
              <rect x={x0} y={y0} width={Math.max(2, x1 - x0)} height={ROW - 8} className={s.cycle === 1 ? 'chart-season-bar' : 'chart-season-cycle2'}>
                <title>{`Cycle ${s.cycle}: greenness starts to rise ${s.greenup}${s.senescence ? `, starts to fall ${s.senescence}` : ''}, dormant ${s.dormancy}${s.lengthDays ? ` (${s.lengthDays} days)` : ''}`}</title>
              </rect>
              {s.senescence && (
                <line x1={x(t(s.senescence))} x2={x(t(s.senescence))} y1={y0} y2={y0 + ROW - 8} className="chart-season-peak" />
              )}
            </g>
          )
        })}
      </svg>
      <p className="legend">
        <span className="key bar-key" style={{ background: 'var(--good)' }} /> 1st cycle &nbsp;
        <span className="key bar-key" style={{ background: 'var(--accent)' }} /> 2nd cycle &nbsp; bar = greenness starts to rise → dormant; notch = greenness starts to fall (MCD12Q2)
      </p>
      <ul className="plain-list">
        {typical.map((c) => (
          <li key={c.cycle}>
            Cycle {c.cycle}: typically greenness starts to rise about <strong>{doyLabel(c.greenupDoy)}</strong> and the land is dormant
            about <strong>{doyLabel(c.dormancyDoy)}</strong>, a median of {Math.round(c.lengthDays)} days (found in {c.n} of{' '}
            {file.phenology.layers.length} yearly layers).
          </li>
        ))}
        <li>
          {file.phenology.layers.filter((l) => l.numCycles === 2).length} of {file.phenology.layers.length} layers (
          {file.phenology.layers[0].layerYear}–{file.phenology.layers[file.phenology.layers.length - 1].layerYear}) contain two
          cycles. This is when the satellite sees the vegetation green up, not when a farmer plants or harvests.
        </li>
      </ul>
    </>
  )
}
