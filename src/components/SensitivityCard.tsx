import type { Sensitivity } from '../lib/sensitivity'

interface Props {
  result: Sensitivity | null
  /** Crop names of the top alternative, for the sentence. */
  topNames: string
}

/** Shows whether the ranking survives small changes in the weather record. A test of our own model, not a forecast. */
export function SensitivityCard({ result, topNames }: Props) {
  if (!result) {
    return (
      <section className="card sensitivity" aria-label="How stable is this ranking">
        <h2>How stable is this ranking?</h2>
        <p className="muted" role="status">Re-running the scoring with small changes to the climate…</p>
      </section>
    )
  }
  const { runs, sameTop, beatsCurrent, topRange, currentRange, leadRange } = result
  const verdict =
    sameTop === runs && beatsCurrent === runs
      ? 'The recommendation does not depend on small changes in the climate.'
      : beatsCurrent === runs
        ? 'It always beats your current rotation, but which alternative comes first can change with small shifts in the climate.'
        : 'Small changes in the climate can flip this ranking, so treat the order as uncertain.'
  const range = (r: [number, number]) => (r[0] === r[1] ? `${r[0]}` : `${r[0]} to ${r[1]}`)
  return (
    <section className="card sensitivity" aria-label="How stable is this ranking">
      <h2>How stable is this ranking?</h2>
      <p className="muted">
        We re-ran the scoring {runs} times with the weather record nudged by −1, 0 and +1 °C and −10, 0 and +10% rainfall, on top of
        your own what-if settings. This tests our own model’s sensitivity. It is not a forecast and not a yield range.
      </p>
      <ul className="plain-list">
        <li>
          The highest-scoring alternative ({topNames}) stayed the top alternative in <strong>{sameTop} of {runs}</strong> runs and scored higher than
          your current rotation in <strong>{beatsCurrent} of {runs}</strong>.
        </li>
        <li>
          Its score ranged from {range(topRange)}; your current rotation’s from {range(currentRange)}; its lead from {range(leadRange)} points.
        </li>
        <li><strong>{verdict}</strong></li>
      </ul>
    </section>
  )
}
