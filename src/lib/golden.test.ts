// "Golden numbers": the headline scores quoted in the videos, the project page and the README.
// If anyone changes the scoring engine, the data or the crop table, this test fails and says the quoted numbers need re-reading.
// It rebuilds each demo site exactly as the app does (bundled NASA POWER snapshot, elevation correction, best start month, default priorities).
import { describe, expect, it } from 'vitest'
import { CROP_BY_ID } from '../data/crops'
import { PRESETS } from '../data/presets'
import { applyElevation, NO_SCENARIO } from './climate'
import { loadDaily } from './power'
import { bestStartMonth, buildSlotTable, buildStrategies } from './rotation'
import { UNKNOWN_SOIL } from './soil'
import { DEFAULT_WEIGHTS } from '../state'

async function scores(id: string): Promise<Record<string, number>> {
  const p = PRESETS.find((x) => x.id === id)!
  const r = await loadDaily(p.lat, p.lon, 2005, 2024)
  const series = applyElevation(r.series, r.gridElevationM, p.elevationM ?? null)
  const current = p.current.map((c) => CROP_BY_ID[c])
  const opts = { mode: p.mode, irrigated: p.irrigated, soil: UNKNOWN_SOIL }
  const start = bestStartMonth(series, NO_SCENARIO, current, opts)
  const table = buildSlotTable(series, NO_SCENARIO, start, opts)
  const out: Record<string, number> = {}
  for (const s of buildStrategies(current, table, DEFAULT_WEIGHTS, new Set(p.crops))) out[s.id] = Math.round(s.result.overall)
  return out
}

describe('headline scores quoted in the submission (read on 15 Nov 2026)', () => {
  it('Kedah rice bowl: current 65, best match 87, water-wise 86, soil-building 86', async () => {
    expect(await scores('kedah')).toEqual({ current: 65, balanced: 87, water: 86, soil: 86 })
  })
  it('Cameron Highlands: current 66, best match 85, water-wise 84, soil-building 83', async () => {
    expect(await scores('cameron')).toEqual({ current: 66, balanced: 85, water: 84, soil: 83 })
  })
  it('Iowa corn belt: current 54, best match 64, water-wise 60, soil-building 62', async () => {
    expect(await scores('iowa')).toEqual({ current: 54, balanced: 64, water: 60, soil: 62 })
  })
})
