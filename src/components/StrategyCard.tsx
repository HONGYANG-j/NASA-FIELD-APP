import type { Explanation } from '../lib/explain'
import { slotLabel, slotName } from '../lib/explain'
import type { SlotTable, Strategy } from '../lib/rotation'
import type { SlotNdvi } from '../lib/satellite'
import { greenness } from '../lib/satellite'

interface Props {
  strategy: Strategy
  explanation: Explanation
  table: SlotTable
  /** Satellite greenness per season, or null when no satellite layer exists for this location. */
  satellite: (SlotNdvi | null)[] | null
  /** Overall score of the farmer's current rotation, for the delta badge. */
  baseline: number
}

const DIMS: { key: keyof Strategy['result']['dims']; label: string; hint: string }[] = [
  { key: 'climate', label: 'Climate fit', hint: 'How well the crops match temperature and rainfall in their seasons.' },
  { key: 'resilience', label: 'Reliability', hint: 'Share of past years the crops would have worked, and the worst year.' },
  { key: 'water', label: 'Light on water', hint: 'Higher means crop water needs are small compared with rainfall.' },
  { key: 'soil', label: 'Soil health', hint: 'Ground cover, organic matter, nitrogen fixing, plant-family mix.' },
  { key: 'income', label: 'Income (rough)', hint: 'Relative market value weighted by chance of success. Local prices not used.' },
]

function fitClass(f: number): string {
  if (f >= 0.8) return 'fit-high'
  if (f >= 0.6) return 'fit-mid'
  return 'fit-low'
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="plain-list">
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  )
}

export function StrategyCard({ strategy, explanation, table, satellite, baseline }: Props) {
  const r = strategy.result
  const delta = Math.round(r.overall - baseline)
  return (
    <article className={`card strategy ${strategy.id === 'current' ? 'is-current' : ''}`}>
      <header className="card-head">
        <div>
          <h3>{strategy.title}</h3>
          <p className="muted">{strategy.tagline}</p>
        </div>
        <div className="score" aria-label={`Overall score ${Math.round(r.overall)} out of 100`}>
          <span className="score-num">{Math.round(r.overall)}</span>
          <span className="score-unit">/100</span>
          {strategy.id !== 'current' && (
            <span className={`delta ${delta >= 0 ? 'up' : 'down'}`}>
              {delta >= 0 ? '+' : ''}
              {delta} vs current
            </span>
          )}
        </div>
      </header>

      <ol className="timeline">
        {r.crops.map((c, i) => {
          const e = r.slotEvidence[i]
          return (
            <li key={i} className={`slot ${fitClass(e.fit)}`}>
              <span className="slot-when">
                {slotName(i, table.mode)} · {slotLabel(table.startMonth, i, table.mode)}
              </span>
              <strong>{c.name}</strong>
              <span className="slot-fit">
                {c.group === 'fallow' ? 'no crop' : `${Math.round(e.fit * 100)}% climate fit`}
              </span>
              {satellite?.[i] && (
                <span className="slot-fit" title="MODIS NDVI: how green the land at this point is in these months">
                  satellite NDVI {satellite[i]!.mean.toFixed(2)} ({greenness(satellite[i]!.mean)})
                </span>
              )}
            </li>
          )
        })}
      </ol>

      <div className="why">
        {explanation.why.map((t, i) => (
          <p key={i}>{t}</p>
        ))}
      </div>

      <dl className="dims">
        {DIMS.map((d) => (
          <div key={d.key} className="dim" title={d.hint}>
            <dt>{d.label}</dt>
            <dd>
              <span className="bar" role="presentation">
                <span style={{ width: `${Math.round(r.dims[d.key] * 100)}%` }} />
              </span>
              <span className="bar-num">{Math.round(r.dims[d.key] * 100)}</span>
            </dd>
          </div>
        ))}
      </dl>

      <details>
        <summary>Evidence from NASA data</summary>
        <List items={explanation.evidence} />
      </details>
      <details>
        <summary>Benefits</summary>
        <List items={explanation.benefits} />
      </details>
      <details>
        <summary>Risks to check locally</summary>
        <List items={explanation.risks} />
      </details>
      <details>
        <summary>Information gaps</summary>
        <List items={explanation.gaps} />
      </details>
    </article>
  )
}
