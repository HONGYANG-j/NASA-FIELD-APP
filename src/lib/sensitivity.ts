// A sensitivity check of our own model: re-run the scoring with the climate nudged a little and see whether the ranking holds.
// This is NOT a forecast and NOT a confidence interval for yield. It only answers "if the weather record were slightly warmer,
// cooler, wetter or drier, would the same alternative still come out on top?"
import type { Crop, DailySeries, Scenario, Weights } from '../types'
import { buildSlotTable, buildStrategies } from './rotation'
import type { Strategy, TableOptions } from './rotation'

/** Nudges applied on top of the user's own what-if settings. */
export const TEMP_NUDGES = [-1, 0, 1] // degrees C
export const RAIN_NUDGES = [-10, 0, 10] // percent

export interface Sensitivity {
  runs: number
  /** Runs in which the highest-scoring alternative is the same set of crops as in the unshifted run. */
  sameTop: number
  /** Runs in which that alternative still scores higher than the current rotation. */
  beatsCurrent: number
  /** Lowest and highest score (rounded) of the unshifted run's top alternative, over all runs. */
  topRange: [number, number]
  /** Lowest and highest score (rounded) of the current rotation, over all runs. */
  currentRange: [number, number]
  /** Smallest and largest lead (rounded points) of that alternative over the current rotation. */
  leadRange: [number, number]
}

const signature = (s: Strategy) => s.result.crops.map((c) => c.id).sort().join('+')

function topAlternative(strategies: Strategy[]): Strategy | null {
  return strategies.slice(1).reduce<Strategy | null>((a, b) => (!a || b.result.overall > a.result.overall ? b : a), null)
}

/** Returns null when there is no alternative to compare. */
export function sensitivityCheck(
  series: DailySeries,
  base: Scenario,
  startMonth: number,
  opts: TableOptions,
  current: Crop[],
  weights: Weights,
  allowed: ReadonlySet<string>,
): Sensitivity | null {
  const run = (dTemp: number, rainPct: number) => {
    const table = buildSlotTable(series, { dTemp: base.dTemp + dTemp, rainPct: base.rainPct + rainPct }, startMonth, opts)
    return buildStrategies(current, table, weights, allowed)
  }
  const reference = topAlternative(run(0, 0))
  if (!reference) return null
  const refSig = signature(reference)

  let runs = 0
  let sameTop = 0
  let beatsCurrent = 0
  let top: [number, number] = [Infinity, -Infinity]
  let cur: [number, number] = [Infinity, -Infinity]
  let lead: [number, number] = [Infinity, -Infinity]
  for (const dT of TEMP_NUDGES) {
    for (const dR of RAIN_NUDGES) {
      const strategies = run(dT, dR)
      runs++
      const best = topAlternative(strategies)
      const currentScore = Math.round(strategies[0].result.overall)
      // The unshifted run's top alternative, wherever it ranks in this run.
      const same = strategies.slice(1).find((s) => signature(s) === refSig)
      if (best && signature(best) === refSig) sameTop++
      const topScore = Math.round((same ?? reference).result.overall)
      if (same && same.result.overall > strategies[0].result.overall) beatsCurrent++
      top = [Math.min(top[0], topScore), Math.max(top[1], topScore)]
      cur = [Math.min(cur[0], currentScore), Math.max(cur[1], currentScore)]
      const l = topScore - currentScore
      lead = [Math.min(lead[0], l), Math.max(lead[1], l)]
    }
  }
  return { runs, sameTop, beatsCurrent, topRange: top, currentRange: cur, leadRange: lead }
}
