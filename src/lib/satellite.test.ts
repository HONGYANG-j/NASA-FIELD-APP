import { describe, expect, it } from 'vitest'
import {
  greenness,
  loadBundledNdvi,
  monthlyNdvi,
  observations,
  slotNdvi,
  SPARSE_NDVI,
} from './satellite'
import type { NdviFile } from './satellite'

/** A synthetic 4-year file: a composite every 16 days, with NDVI chosen by month. */
function synthetic(valueFor: (year: number, month: number) => number | null): NdviFile {
  const points: [string, number | null][] = []
  for (let year = 2022; year <= 2025; year++) {
    const start = Date.UTC(year, 0, 1)
    for (let d = 0; d < 365; d += 16) {
      const dt = new Date(start + d * 86_400_000)
      const month = dt.getUTCMonth() + 1
      points.push([dt.toISOString().slice(0, 10), valueFor(year, month)])
    }
  }
  return {
    id: 'test', source: 'synthetic', service: '', band: 'NDVI', latitude: 0, longitude: 0,
    pixelMetres: 250, years: [2022, 2025], fetched: '2026-11-14', points,
  }
}

describe('greenness classes (NASA Earth Observatory guidance)', () => {
  it('splits sparse / moderate / dense', () => {
    expect(greenness(0.1)).toBe('sparse')
    expect(greenness(SPARSE_NDVI - 0.001)).toBe('sparse')
    expect(greenness(SPARSE_NDVI)).toBe('moderate')
    expect(greenness(0.59)).toBe('moderate')
    expect(greenness(0.6)).toBe('dense')
  })
})

describe('monthly and seasonal NDVI', () => {
  it('ignores missing composites', () => {
    const f = synthetic((_, m) => (m === 3 ? null : 0.5))
    expect(observations(f).every((o) => o.month !== 3)).toBe(true)
    const march = monthlyNdvi(f)[2]
    expect(march.n).toBe(0)
    expect(Number.isNaN(march.mean)).toBe(true)
  })

  it('averages by calendar month', () => {
    const f = synthetic((_, m) => (m <= 6 ? 0.2 : 0.7))
    const m = monthlyNdvi(f)
    expect(m[0].mean).toBeCloseTo(0.2, 9)
    expect(m[8].mean).toBeCloseTo(0.7, 9)
    expect(m[8].min).toBeCloseTo(0.7, 9)
  })

  it('a season window that wraps past December still groups into one season-year', () => {
    const f = synthetic((_, m) => (m >= 11 || m <= 2 ? 0.25 : 0.65)) // Nov-Feb is sparse
    const s = slotNdvi(f, 11, 4)! // Nov, Dec, Jan, Feb
    expect(s.mean).toBeCloseTo(0.25, 9)
    expect(s.sparseShare).toBe(1)
    // 2022-2025 data: season-years 2022, 2023, 2024 are complete; 2021 and 2025 are partial.
    expect(s.years).toBe(3)
  })

  it('counts seasons that were clearly less green than usual', () => {
    const f = synthetic((y, m) => (m >= 5 && m <= 8 ? (y === 2024 ? 0.3 : 0.6) : 0.5))
    const s = slotNdvi(f, 5, 4)!
    expect(s.years).toBe(4)
    expect(s.lowYears).toBe(1) // 2024: 0.30 vs a mean near 0.525
    expect(s.sparseShare).toBe(0) // 0.30 itself is not below the 0.3 sparse threshold
  })

  it('returns null when there are too few clear composites', () => {
    const f = synthetic(() => null)
    expect(slotNdvi(f, 1, 4)).toBeNull()
  })
})

describe('bundled real MODIS NDVI files', () => {
  it('has no layer for locations without verified farmland', async () => {
    expect(await loadBundledNdvi('cameron')).toBeNull()
    expect(await loadBundledNdvi('does-not-exist')).toBeNull()
  })

  for (const id of ['kedah', 'iowa']) {
    it(`${id}: real, complete, plausible, and at a cropland pixel`, async () => {
      const f = await loadBundledNdvi(id)
      expect(f).not.toBeNull()
      expect(f!.band).toBe('250m_16_days_NDVI')
      expect(f!.years).toEqual([2022, 2025])
      expect(f!.points.length).toBe(92) // 23 composites a year x 4 years
      const dates = f!.points.map((p) => p[0])
      expect([...dates].sort()).toEqual(dates)
      const valid = f!.points.filter((p) => p[1] !== null).map((p) => p[1] as number)
      expect(valid.length).toBeGreaterThan(80)
      expect(Math.min(...valid)).toBeGreaterThan(-0.2)
      expect(Math.max(...valid)).toBeLessThanOrEqual(1)
      expect(f!.landCover?.igbpClass).toBe(12) // MCD12Q1 cropland, checked when picking the point
    })
  }
})
