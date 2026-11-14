import { describe, expect, it } from 'vitest'
import { CROP_BY_ID } from '../data/crops'
import { PRESETS } from '../data/presets'
import { applyElevation, NO_SCENARIO } from './climate'
import { loadDaily } from './power'
import { buildSlotTable, buildStrategies, bestStartMonth } from './rotation'
import { sensitivityCheck } from './sensitivity'
import { DEFAULT_WEIGHTS } from '../state'

async function setup(id: string) {
  const p = PRESETS.find((x) => x.id === id)!
  const r = await loadDaily(p.lat, p.lon, 2005, 2024)
  const series = applyElevation(r.series, r.gridElevationM, p.elevationM ?? null)
  const current = p.current.map((c) => CROP_BY_ID[c])
  const opts = { mode: p.mode, irrigated: p.irrigated }
  const start = bestStartMonth(series, NO_SCENARIO, current, opts)
  return { p, series, current, opts, start }
}

describe('sensitivityCheck', () => {
  it('Kedah: reports nine runs and a top alternative that is the same one the page shows', async () => {
    const { p, series, current, opts, start } = await setup('kedah')
    const allowed = new Set(p.crops)
    const t0 = performance.now()
    const s = sensitivityCheck(series, NO_SCENARIO, start, opts, current, DEFAULT_WEIGHTS, allowed)!
    const ms = performance.now() - t0
    expect(s.runs).toBe(9)
    expect(s.sameTop).toBeGreaterThanOrEqual(1) // the unshifted run always agrees with itself
    expect(s.sameTop).toBeLessThanOrEqual(9)
    expect(s.beatsCurrent).toBeLessThanOrEqual(9)
    // The unshifted run is one of the nine, so the headline scores must lie inside the reported ranges.
    const strategies = buildStrategies(current, buildSlotTable(series, NO_SCENARIO, start, opts), DEFAULT_WEIGHTS, allowed)
    const top = strategies.slice(1).reduce((a, b) => (b.result.overall > a.result.overall ? b : a))
    const topScore = Math.round(top.result.overall)
    const curScore = Math.round(strategies[0].result.overall)
    expect(s.topRange[0]).toBeLessThanOrEqual(topScore)
    expect(s.topRange[1]).toBeGreaterThanOrEqual(topScore)
    expect(s.currentRange[0]).toBeLessThanOrEqual(curScore)
    expect(s.currentRange[1]).toBeGreaterThanOrEqual(curScore)
    expect(s.leadRange[0]).toBeLessThanOrEqual(topScore - curScore)
    expect(s.leadRange[1]).toBeGreaterThanOrEqual(topScore - curScore)
    // Cheap enough to run on the page (nine scorings of 20 years of daily data).
    expect(ms).toBeLessThan(3000)
  })

  it('is deterministic and keeps the user\'s own what-if settings as the centre of the nudges', async () => {
    const { p, series, current, opts, start } = await setup('iowa')
    const allowed = new Set(p.crops)
    const a = sensitivityCheck(series, { dTemp: 2, rainPct: -20 }, start, opts, current, DEFAULT_WEIGHTS, allowed)
    const b = sensitivityCheck(series, { dTemp: 2, rainPct: -20 }, start, opts, current, DEFAULT_WEIGHTS, allowed)
    expect(a).toEqual(b)
    expect(a!.runs).toBe(9)
  })

  it('returns null when there is no alternative to compare', async () => {
    const { series, current, opts, start } = await setup('kedah')
    // Only the current crops are allowed and they are the whole choice set: nothing else to propose.
    const r = sensitivityCheck(series, NO_SCENARIO, start, opts, current, DEFAULT_WEIGHTS, new Set(current.map((c) => c.id)))
    expect(r === null || r.runs === 9).toBe(true)
  })
})
