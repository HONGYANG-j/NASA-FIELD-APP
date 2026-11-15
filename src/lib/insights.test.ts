import { describe, expect, it } from 'vitest'
import { CROP_BY_ID } from '../data/crops'
import { PRESETS } from '../data/presets'
import { applyElevation, NO_SCENARIO } from './climate'
import { csvCell, dimChanges, resultsCsv, whyFirst, yearMatrix } from './insights'
import { loadDaily } from './power'
import { bestStartMonth, buildSlotTable, buildStrategies } from './rotation'
import { CUSTOM_PRESET_ID } from '../data/presets'
import { inputsFromSaved, parseSaved, toSaved } from './savedFarm'
import { UNKNOWN_SOIL } from './soil'
import { DEFAULT_WEIGHTS } from '../state'
import type { Inputs } from '../state'

async function kedah() {
  const p = PRESETS[0]
  const r = await loadDaily(p.lat, p.lon, 2005, 2024)
  const series = applyElevation(r.series, r.gridElevationM, null)
  const current = p.current.map((c) => CROP_BY_ID[c])
  const opts = { mode: p.mode, irrigated: p.irrigated, soil: UNKNOWN_SOIL }
  const start = bestStartMonth(series, NO_SCENARIO, current, opts)
  const table = buildSlotTable(series, NO_SCENARIO, start, opts)
  const strategies = buildStrategies(current, table, DEFAULT_WEIGHTS, new Set(p.crops))
  return { p, table, strategies, start }
}

describe('whyFirst / dimChanges', () => {
  it('Kedah: names soil health as the main reason and mentions the bare fallow', async () => {
    const { strategies } = await kedah()
    const [current, best] = strategies
    const { gains } = dimChanges(best, current)
    expect(gains[0].key).toBe('soil')
    expect(gains[0].pts).toBeGreaterThan(50)
    const why = whyFirst(best, current)
    expect(why[0]).toMatch(/^It comes first mainly because of soil health \(\+\d+\)/)
    expect(why.join(' ')).toMatch(/leaves the soil bare for a season/)
    expect(why.join(' ')).not.toMatch(/yield|profit|will/i)
  })
  it('says so plainly when nothing beats the current rotation', async () => {
    const { strategies } = await kedah()
    expect(whyFirst(strategies[0], strategies[0])).toEqual(['No alternative scores higher than your current rotation for the priorities you set.'])
  })
})

describe('yearMatrix', () => {
  it('gives one fit per crop per year, and its average is the fit the score uses', async () => {
    const { strategies, table } = await kedah()
    const best = strategies[1]
    const m = yearMatrix(best.result.crops, table)
    expect(m.years.length).toBeGreaterThanOrEqual(19)
    expect(m.years[0]).toBeGreaterThanOrEqual(2005)
    expect(m.rows).toHaveLength(3)
    m.rows.forEach((row, i) => {
      const vals = row.fits.filter((x): x is number => x !== null)
      expect(vals.every((v) => v >= 0 && v <= 1)).toBe(true)
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length
      expect(mean).toBeCloseTo(best.result.slotEvidence[i].fit, 6)
    })
  })
})

describe('CSV export', () => {
  it('quotes every cell and defuses spreadsheet formulas in text', () => {
    expect(csvCell('plain')).toBe('"plain"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"')
    expect(csvCell('+1')).toBe('"\'+1"')
    expect(csvCell('@cmd')).toBe('"\'@cmd"')
    expect(csvCell(-93.55)).toBe('"-93.55"') // a real negative number stays a number
  })
  it('has one row per rotation and season, ranked, with the scores shown on the page', async () => {
    const { strategies, start } = await kedah()
    const csv = resultsCsv(strategies, {
      appName: 'Plant vs Climate', place: '=evil(), Kedah', lat: 6.25, lon: 100.35, mode: '3 seasons per year', irrigated: true, startMonth: start,
      whatIf: { dTemp: 0, rainPct: 0 }, url: 'https://example.test/', date: '2026-11-15',
    })
    const lines = csv.trim().split('\r\n')
    const header = lines.findIndex((l) => l.startsWith('"Rank"'))
    expect(header).toBeGreaterThan(0)
    const data = lines.slice(header + 1)
    expect(data).toHaveLength(strategies.length * 3)
    expect(data[0]).toContain('"1","Best match for your priorities","87"')
    expect(data[data.length - 1]).toContain('"Your current rotation","65"')
    expect(csv).toContain('"\'=evil(), Kedah"')
    expect(csv).toMatch(/not yield, loss or price forecasts/)
  })
})

describe('saved farm', () => {
  const base = (over: Partial<Inputs> = {}): Inputs => {
    const p = PRESETS[0]
    return { presetId: p.id, lat: p.lat, lon: p.lon, mode: p.mode, irrigated: p.irrigated, elevationM: null, current: p.current, allowed: p.crops, weights: DEFAULT_WEIGHTS, soil: UNKNOWN_SOIL, soilSource: 'manual', scenario: NO_SCENARIO, startMonth: 'auto', ...over }
  }
  it('round-trips a setup through storage text', () => {
    const mine = base({ presetId: CUSTOM_PRESET_ID, lat: 4.77, lon: 100.93, irrigated: false, current: ['maize', 'soybean', 'fallow'], weights: { water: 5, soil: 4, income: 2, resilience: 3 }, startMonth: 6 })
    const saved = parseSaved(JSON.stringify(toSaved(mine, 'Kuala Kangsar, Perak, Malaysia')))!
    expect(saved.label).toBe('Kuala Kangsar, Perak, Malaysia')
    const back = inputsFromSaved(base(), saved)
    expect(back.presetId).toBe(CUSTOM_PRESET_ID)
    expect([back.lat, back.lon]).toEqual([4.77, 100.93])
    expect(back.current).toEqual(['maize', 'soybean', 'fallow'])
    expect(back.irrigated).toBe(false)
    expect(back.weights.water).toBe(5)
    expect(back.startMonth).toBe(6)
  })
  it('uses the real coordinates of a demo site, whatever the stored numbers say', () => {
    const s = parseSaved(JSON.stringify({ label: 'x', presetId: 'iowa', lat: 0, lon: 0, patch: {} }))!
    expect([s.lat, s.lon]).toEqual([41.95, -93.55])
    expect(s.label).toBe('Iowa corn belt, USA')
  })
  it('rejects damaged or tampered entries and drops invalid values', () => {
    for (const bad of [null, '', 'not json', '[]', '{}', '{"label":"a","presetId":"nowhere"}', '{"label":"a","presetId":"custom","lat":95,"lon":1}', '{"label":"a","presetId":"custom","lat":"1","lon":1}']) {
      expect(parseSaved(bad)).toBeNull()
    }
    const s = parseSaved(JSON.stringify({ label: 'ok', presetId: 'custom', lat: 1, lon: 2, patch: { current: ['rice', 'nope', 'x'], weights: { water: 99 }, score: 100 } }))!
    expect(s.patch).toEqual({ weights: { water: 5 } })
  })
})

async function iowa(weights: { water: number; soil: number; income: number; resilience: number }) {
  const p = PRESETS.find((x) => x.id === 'iowa')!
  const r = await loadDaily(p.lat, p.lon, 2005, 2024)
  const series = applyElevation(r.series, r.gridElevationM, null)
  const current = p.current.map((c) => CROP_BY_ID[c])
  const opts = { mode: p.mode, irrigated: p.irrigated, soil: UNKNOWN_SOIL }
  const start = bestStartMonth(series, NO_SCENARIO, current, opts)
  const table = buildSlotTable(series, NO_SCENARIO, start, opts)
  return buildStrategies(current, table, weights, new Set(p.crops))
}

describe('whyFirst wording (regression: found in the 15 Nov bug sweep)', () => {
  it('never says a crop was "added" when it is already in the current rotation', async () => {
    // Income-first priorities: the top rotation reuses Soybean, which the current Iowa rotation already has.
    const [current, best] = await iowa({ water: 0, soil: 0, income: 5, resilience: 0 })
    expect(current.result.crops.map((c) => c.id)).toContain('soybean')
    expect(best.result.crops.map((c) => c.id)).toContain('soybean')
    const text = whyFirst(best, current).join(' ')
    expect(text).not.toMatch(/adding[^.]*Soybean/)
    expect(text).toMatch(/keeps it covered/)
  })
  it('names only genuinely new cover or legume crops', async () => {
    const [current, best] = await iowa({ water: 5, soil: 5, income: 0, resilience: 0 })
    const text = whyFirst(best, current).join(' ')
    expect(text).toMatch(/keeps it covered, adding .*Clover/)
    expect(text).not.toMatch(/adding[^.]*Soybean/)
  })
  it('does not claim the soil stays covered when the top rotation has its own bare fallow', async () => {
    const [current, best] = await iowa({ water: 5, soil: 0, income: 0, resilience: 0 })
    expect(best.result.crops.some((c) => c.group === 'fallow')).toBe(true)
    expect(whyFirst(best, current).join(' ')).not.toMatch(/keeps it covered/)
  })
  it('uses short names in sentences, never "income (rough) (+n)"', async () => {
    const [current, best] = await iowa({ water: 0, soil: 0, income: 5, resilience: 0 })
    expect(whyFirst(best, current).join(' ')).not.toMatch(/\(rough\)/)
  })
})
