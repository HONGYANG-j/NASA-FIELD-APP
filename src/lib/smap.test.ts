import { describe, expect, it } from 'vitest'
import { loadBundledSmap, MIN_SMAP_DAYS, monthlySmap, smapTotals } from './smap'
import type { SmapFile } from './smap'

function fake(days: SmapFile['days']): SmapFile {
  return {
    id: 't', source: '', collection: '', box: [0, 0, 1, 1], year: 2024, fetched: '2026-01-01', units: 'cm3/cm3',
    validRange: [0.02, 0.5], rule: '', cellsPerPass: 48, days,
  }
}

describe('monthlySmap', () => {
  it('averages the daily values and records the lowest and highest', () => {
    const m = monthlySmap(fake([['2024-03-01', 10, 0.1, 0], ['2024-03-04', 10, 0.2, 0], ['2024-03-07', 10, 0.3, 0]]))
    expect(m[2].mean).toBeCloseTo(0.2, 10)
    expect(m[2].min).toBe(0.1)
    expect(m[2].max).toBe(0.3)
    expect(m[2].n).toBe(3)
  })
  it('leaves a month blank with too few usable days or none', () => {
    const m = monthlySmap(fake([['2024-01-01', 10, 0.3, 0], ['2024-01-02', 0, null, 4]]))
    expect(MIN_SMAP_DAYS).toBe(3)
    expect(Number.isNaN(m[0].mean)).toBe(true)
    expect(m[0].n).toBe(1)
    expect(Number.isNaN(m[5].mean)).toBe(true)
  })
})

describe('smapTotals', () => {
  it('flags months where over a fifth of returned cells were above the valid range', () => {
    const t = smapTotals(fake([['2024-05-01', 6, 0.4, 4], ['2024-06-01', 9, 0.4, 1]]))
    expect(t.wetMonths).toEqual([5])
    expect(t.cellsOverRange).toBe(5)
    expect(t.usableDays).toBe(2)
  })
})

describe('bundled Kedah SMAP file', () => {
  it('is only bundled for Kedah', async () => {
    expect(await loadBundledSmap('iowa')).toBeNull()
    expect(await loadBundledSmap('cameron')).toBeNull()
    expect(await loadBundledSmap('nope')).toBeNull()
  })
  it('covers every day of 2024 once, with values inside the documented range', async () => {
    const f = (await loadBundledSmap('kedah'))!
    expect(f.year).toBe(2024)
    expect(f.days).toHaveLength(366)
    expect(new Set(f.days.map((d) => d[0])).size).toBe(366)
    expect(f.days[0][0]).toBe('2024-01-01')
    expect(f.days[365][0]).toBe('2024-12-31')
    for (const [, n, mean, over] of f.days) {
      expect(over).toBeGreaterThanOrEqual(0)
      if (mean === null) expect(n).toBe(0)
      else {
        expect(n).toBeGreaterThan(0)
        expect(mean).toBeGreaterThanOrEqual(f.validRange[0])
        expect(mean).toBeLessThanOrEqual(f.validRange[1])
      }
    }
  })
  it('reproduces the totals checked when the files were read (137 usable days, 1,499 cells above range)', async () => {
    const t = smapTotals((await loadBundledSmap('kedah'))!)
    expect(t.usableDays).toBe(137)
    expect(t.cellsOverRange).toBe(1499)
  })
  it('gives a plausible month-by-month shape: dry Feb-Mar, wet late in the year', async () => {
    const m = monthlySmap((await loadBundledSmap('kedah'))!)
    expect(m.every((x) => Number.isFinite(x.mean))).toBe(true)
    expect(m[1].mean).toBeCloseTo(0.19, 2)
    expect(m[2].mean).toBeCloseTo(0.169, 2)
    expect(m[5].mean).toBeCloseTo(0.425, 2)
    expect(m[1].mean).toBeLessThan(m[9].mean)
  })
})
