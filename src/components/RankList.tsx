import type { Strategy } from '../lib/rotation'

interface Props {
  strategies: Strategy[]
  baseline: number
  bestId: string | null
  /** Open the rotation card at this index in the list. */
  onOpen: (index: number) => void
}

/** All rotations ranked in one list, like a leaderboard: score bar, crops and the gap to the current rotation. */
export function RankList({ strategies, baseline, bestId, onOpen }: Props) {
  if (strategies.length === 0) return null
  const rows = strategies.map((s, index) => ({ s, index })).sort((a, b) => b.s.result.overall - a.s.result.overall)
  return (
    <section className="card ranklist" aria-label="All rotations ranked">
      <h2>All rotations, ranked</h2>
      <ol>
        {rows.map(({ s, index }, rank) => {
          const score = Math.round(s.result.overall)
          const delta = score - Math.round(baseline)
          return (
            <li key={s.id}>
              <span className="rank-n" aria-hidden="true">{rank + 1}</span>
              <div className="rank-main">
                <div className="rank-title">
                  <strong>{s.title}</strong>
                  {s.id === bestId && <span className="badge-best">Highest score</span>}
                  {s.id === 'current' && <span className="badge-base">Your rotation</span>}
                </div>
                <div className="rank-crops">{s.result.crops.map((c) => c.name).join(' → ')}</div>
                <div className="rank-bar" role="presentation"><span style={{ width: `${score}%` }} /></div>
              </div>
              <div className="rank-score">
                <b>{score}</b>
                {s.id !== 'current' && <span className={`delta ${delta >= 0 ? 'up' : 'down'}`}>{delta >= 0 ? '+' : ''}{delta}</span>}
              </div>
              <button type="button" className="ghost" onClick={() => onOpen(index)} aria-label={`Open details for ${s.title}`}>Details</button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
