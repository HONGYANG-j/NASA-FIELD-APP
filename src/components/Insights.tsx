import { useState } from 'react'
import { slotLabel, slotName } from '../lib/explain'
import { DIM_LABEL, yearMatrix } from '../lib/insights'
import type { SlotTable, Strategy } from '../lib/rotation'
import './Insights.css'

const pct = (x: number) => Math.round(x * 100)
const cls = (f: number) => (f >= 0.8 ? 'y-high' : f >= 0.6 ? 'y-mid' : 'y-low')

/** For one rotation: how well each crop suited the climate in every past year (the yearly values the scores are averaged from). */
export function YearGrid({ strategy, table }: { strategy: Strategy; table: SlotTable }) {
  const { years, rows } = yearMatrix(strategy.result.crops, table)
  if (years.length === 0) return null
  return (
    <div className="year-grid">
      <div className="yg-years" aria-hidden="true">
        <span className="yg-label" />
        <span className="yg-cells">
          {years.map((y, i) => <span key={y}>{i === 0 || i === years.length - 1 || y % 5 === 0 ? `’${String(y).slice(2)}` : ''}</span>)}
        </span>
      </div>
      {rows.map((row) => {
        const vals = row.fits.map((f, i) => ({ f, year: years[i] })).filter((x): x is { f: number; year: number } => x.f !== null)
        const fallow = row.crop.group === 'fallow'
        const weak = vals.filter((x) => x.f < 0.6)
        const worst = vals.reduce((a, b) => (b.f < a.f ? b : a), vals[0])
        const summary = fallow
          ? 'no crop in the ground'
          : weak.length === 0
            ? worst.f >= 0.995
              ? `a full climate match in all ${vals.length} years`
              : `suited the climate in all ${vals.length} years; weakest was ${worst.year} (${pct(worst.f)}%)`
            : `struggled in ${weak.length} of ${vals.length} years (${weak.map((w) => w.year).join(', ')}); weakest was ${worst.year} (${pct(worst.f)}%)`
        return (
          <div className="yg-row" key={row.slot}>
            <span className="yg-label">
              <strong>{row.crop.name}</strong>
              <small>{slotName(row.slot, table.mode)} · {slotLabel(table.startMonth, row.slot, table.mode)}</small>
            </span>
            <span className="yg-cells" role="img" aria-label={`${row.crop.name}: ${summary}.`}>
              {row.fits.map((f, i) => (
                <span key={years[i]} className={f === null ? 'y-none' : fallow ? 'y-fallow' : cls(f)} title={f === null ? `${years[i]}: no data` : fallow ? `${years[i]}: no crop` : `${years[i]}: ${pct(f)}% climate fit`} />
              ))}
            </span>
            <span className="yg-summary">{summary.charAt(0).toUpperCase() + summary.slice(1)}.</span>
          </div>
        )
      })}
      <p className="legend">
        <span className="key bar-key y-high" /> 80% or more &nbsp; <span className="key bar-key y-mid" /> 60–79% &nbsp;
        <span className="key bar-key y-low" /> below 60% &nbsp; one square per year, {years[0]}–{years[years.length - 1]}. Past weather only: not a forecast.
      </p>
    </div>
  )
}

const DIMS = ['climate', 'resilience', 'water', 'soil', 'income'] as const

/** Two rotations side by side: overall score, the five sub-scores and the crops season by season. */
export function CompareCard({ strategies, table, bestId }: { strategies: Strategy[]; table: SlotTable; bestId: string | null }) {
  const [aId, setA] = useState<string>('current')
  const [bId, setB] = useState<string | null>(null)
  if (strategies.length < 2) return null
  const a = strategies.find((s) => s.id === aId) ?? strategies[0]
  const fallbackB = strategies.find((s) => s.id === bestId && s.id !== a.id) ?? strategies.find((s) => s.id !== a.id)!
  const b = strategies.find((s) => s.id === bId && s.id !== a.id) ?? fallbackB
  const diff = (x: number) => <span className={`cmp-diff ${x > 0 ? 'up' : x < 0 ? 'down' : ''}`}>{x > 0 ? '+' : ''}{x}</span>
  return (
    <section className="card compare" aria-labelledby="compare-title">
      <h2 id="compare-title">Compare two rotations side by side</h2>
      <div className="cmp-pick">
        <label>
          First
          <select value={a.id} onChange={(e) => setA(e.target.value)}>
            {strategies.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </label>
        <label>
          Second
          <select value={b.id} onChange={(e) => setB(e.target.value)}>
            {strategies.filter((s) => s.id !== a.id).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </label>
      </div>
      <div className="table-wrap">
        <table className="cmp">
          <thead>
            <tr><th scope="col">&nbsp;</th><th scope="col">{a.title}</th><th scope="col">{b.title}</th><th scope="col">Difference</th></tr>
          </thead>
          <tbody>
            <tr className="cmp-total">
              <th scope="row">Overall score</th>
              <td>{Math.round(a.result.overall)}</td>
              <td>{Math.round(b.result.overall)}</td>
              <td>{diff(Math.round(b.result.overall) - Math.round(a.result.overall))}</td>
            </tr>
            {DIMS.map((k) => (
              <tr key={k}>
                <th scope="row">{DIM_LABEL[k].charAt(0).toUpperCase() + DIM_LABEL[k].slice(1)}</th>
                <td>{pct(a.result.dims[k])}</td>
                <td>{pct(b.result.dims[k])}</td>
                <td>{diff(pct(b.result.dims[k]) - pct(a.result.dims[k]))}</td>
              </tr>
            ))}
            {[0, 1, 2].map((i) => {
              const cell = (s: Strategy) => {
                const c = s.result.crops[i]
                return c.group === 'fallow' ? `${c.name} (no crop)` : `${c.name} (${pct(s.result.slotEvidence[i].fit)}% fit)`
              }
              return (
                <tr key={i}>
                  <th scope="row">{slotName(i, table.mode)} <small>{slotLabel(table.startMonth, i, table.mode)}</small></th>
                  <td>{cell(a)}</td>
                  <td>{cell(b)}</td>
                  <td>{a.result.crops[i].id === b.result.crops[i].id ? 'same crop' : 'different crop'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="muted">Scores are out of 100 and rank options for your inputs. A positive difference means the second rotation scores higher.</p>
    </section>
  )
}
