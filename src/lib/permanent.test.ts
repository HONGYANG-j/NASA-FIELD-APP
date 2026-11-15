import { describe, expect, it } from 'vitest'
import { PRESETS } from '../data/presets'
import { applyElevation } from './climate'
import { loadDaily } from './power'
import { NOT_COVERED, PERMANENT_CROPS, ratingAt, thermalZone, warmingSteps, permanentCheck, ZONE_LOWER_C } from './permanent'

async function site(id: string) {
  const p = PRESETS.find((x) => x.id === id)!
  const r = await loadDaily(p.lat, p.lon, 2005, 2024)
  return applyElevation(r.series, r.gridElevationM, p.elevationM ?? null)
}

describe('FAO thermal zones (Table 5.3)', () => {
  it('puts a temperature in the right zone, and a boundary value in the warmer zone', () => {
    const cases: Array<[number, number]> = [
      [30, 1], [25, 1], [24.99, 2], [22.5, 2], [22.49, 3], [20, 3], [19.99, 4], [17.5, 4], [17.49, 5],
      [15, 5], [14.99, 6], [12.5, 6], [12.49, 7], [10, 7], [9.99, 8], [5, 8], [4.99, 9], [-12, 9],
    ]
    for (const [t, z] of cases) expect(thermalZone(t), `${t} C`).toBe(z)
    expect(ZONE_LOWER_C).toHaveLength(9)
  })
})

describe('FAO ratings as typed in (Table A4.2)', () => {
  // Zones where FAO Table A4.1 lists each crop's thermal regime: the only zones that may be rated better than N.
  const FAO_ZONES: Record<string, number[]> = { tea: [3, 4, 5, 6], coffee: [3, 4, 5], oilpalm: [1, 2], banana: [1, 2, 3, 4] }
  it('has nine ratings per crop and is not suitable (N) everywhere FAO lists no thermal zone', () => {
    for (const c of PERMANENT_CROPS) {
      expect(c.ratings).toHaveLength(9)
      c.ratings.forEach((r, i) => {
        const listed = FAO_ZONES[c.id].includes(i + 1)
        expect(listed ? r !== 'N' : r === 'N', `${c.id} zone ${i + 1}`).toBe(true)
      })
    }
  })
  it('keeps the three headline readings the explanation relies on', () => {
    const by = Object.fromEntries(PERMANENT_CROPS.map((c) => [c.id, c]))
    expect(by.tea.ratings[3]).toBe('S1') // 17.5 to 20 C
    expect(by.coffee.ratings[3]).toBe('S1')
    expect(by.oilpalm.ratings[0]).toBe('S1') // warmer than 25 C
    expect(ratingAt(by.tea, 18.1)).toBe('S1')
    expect(ratingAt(by.tea, 20.1)).toBe('S3')
  })
  it('does not invent rows for crops the FAO table lacks', () => {
    expect([...NOT_COVERED]).toEqual(['cocoa', 'rubber', 'olive'])
    const names = PERMANENT_CROPS.map((c) => c.name.toLowerCase()).join(' ')
    for (const n of NOT_COVERED) expect(names).not.toContain(n)
  })
})

describe('warming steps', () => {
  it('shows whole degrees 0 to 4, plus the user\'s own what-if when it falls between', () => {
    expect(warmingSteps(0)).toEqual([0, 1, 2, 3, 4])
    expect(warmingSteps(-1.5)).toEqual([0, 1, 2, 3, 4])
    expect(warmingSteps(2)).toEqual([0, 1, 2, 3, 4])
    expect(warmingSteps(1.5)).toEqual([0, 1, 1.5, 2, 3, 4])
  })
})

describe('the check on the three demo sites (real NASA POWER data)', () => {
  it('Cameron Highlands (1,440 m): tea and coffee are best today and get worse with warming; oil palm is not suitable', async () => {
    const r = permanentCheck(await site('cameron'))!
    expect(r.meanC).toBeGreaterThan(17.5)
    expect(r.meanC).toBeLessThan(18.7)
    expect(r.zone).toBe(4)
    expect(r.seasonal).toBe(false)
    const row = (id: string) => r.rows.find((x) => x.crop.id === id)!
    expect(row('tea').ratings[0]).toBe('S1')
    expect(row('coffee').ratings[0]).toBe('S1')
    expect(row('oilpalm').ratings[0]).toBe('N')
    // by +2 C the site has crossed into the next zone and tea has dropped
    expect(row('tea').ratings[2]).not.toBe('S1')
    expect(row('tea').sentence).toMatch(/^Tea: best today; drops to \w+ at \+\d °C\.$/)
    expect(row('oilpalm').sentence).toMatch(/not suitable at today's temperature/)
  })
  it('Kedah (lowland tropics): oil palm and banana suit it, tea and coffee do not', async () => {
    const r = permanentCheck(await site('kedah'))!
    expect(r.meanC).toBeGreaterThan(25)
    expect(r.zone).toBe(1)
    expect(r.seasonal).toBe(false)
    const row = (id: string) => r.rows.find((x) => x.crop.id === id)!
    expect(row('oilpalm').ratings[0]).toBe('S1')
    expect(row('banana').ratings[0]).toBe('S1')
    expect(row('tea').ratings.every((x) => x === 'N')).toBe(true)
    expect(row('tea').sentence).toMatch(/warming does not change that/)
  })
  it('Iowa: strong seasons are flagged as indicative only, and none of these crops suit it', async () => {
    const r = permanentCheck(await site('iowa'))!
    expect(r.seasonal).toBe(true)
    expect(r.seasonRangeC).toBeGreaterThan(20)
    expect(r.rows.every((x) => x.ratings[0] === 'N')).toBe(true)
  })
  it('returns the user\'s what-if as an extra column and never says "yield"', async () => {
    const r = permanentCheck(await site('cameron'), 1.5)!
    expect(r.steps).toContain(1.5)
    expect(r.rows[0].ratings).toHaveLength(r.steps.length)
    expect(r.rows.map((x) => x.sentence).join(' ')).not.toMatch(/yield|will die|forecast/i)
  })
  it('returns null for an empty series', () => {
    expect(permanentCheck({ year: [], month: [], tmean: [], tmax: [], tmin: [], precip: [], rootWet: [], etMm: [] })).toBeNull()
  })
})
