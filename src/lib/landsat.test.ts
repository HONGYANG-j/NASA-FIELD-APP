import { describe, expect, it } from 'vitest'
import {
  landsatPerYear,
  landsatVsModis,
  loadBundledElevation,
  loadBundledLandsat,
  loadBundledNdvi,
} from './satellite'
import type { LandsatFile, NdviFile } from './satellite'

// These tests pin the bundled Landsat and NASADEM files, which scripts/fetch-landsat.mjs downloaded from
// Microsoft Planetary Computer on 14 Nov 2026. They are real data, so the expectations are ranges taken from
// what was measured and cross-checked, not made-up numbers.

describe('bundled Landsat NDVI', () => {
  for (const id of ['kedah', 'iowa']) {
    it(`${id}: well-formed, dated, ordered, NDVI in range`, async () => {
      const f = await loadBundledLandsat(id)
      expect(f).not.toBeNull()
      if (!f) return
      expect(f.pixelMetres).toBe(30)
      expect(f.fetched).toBe('2026-11-14')
      expect(f.points.length).toBeGreaterThan(50)
      expect(f.points.length).toBeLessThanOrEqual(f.observations.scenesSearched)
      let prev = ''
      for (const [d, v, plat] of f.points) {
        expect(d).toMatch(/^20(22|23|24|25)-\d\d-\d\d$/)
        expect(d > prev).toBe(true) // strictly increasing: same-day scenes were averaged
        prev = d
        expect(v).toBeGreaterThanOrEqual(-1)
        expect(v).toBeLessThanOrEqual(1)
        expect(plat).toMatch(/^L[789](\+L[789])?$/)
      }
      // Every scene is accounted for.
      const o = f.observations
      expect(o.noData + o.cloudOrShadowMasked + o.outOfRange + o.badScaling + o.clear).toBe(o.scenesSearched)
      expect(f.points.length).toBe(o.clear - o.sameDayAveraged)
    })

    it(`${id}: the chosen pixel is close to the preset and cropland in ESA WorldCover`, async () => {
      const f = await loadBundledLandsat(id)
      expect(f?.requested.offsetMetres).toBeLessThan(200)
      expect(f?.landCover.atPixel).toContain('cropland')
    })

    it(`${id}: has clear observations in every year`, async () => {
      const f = await loadBundledLandsat(id)
      const per = f ? landsatPerYear(f) : {}
      for (const y of [2022, 2023, 2024, 2025]) expect(per[y]).toBeGreaterThan(5)
    })

    it(`${id}: agrees with the bundled MODIS NDVI at the same place (measured r about 0.9)`, async () => {
      const [l, m] = await Promise.all([loadBundledLandsat(id), loadBundledNdvi(id)])
      expect(l && m).toBeTruthy()
      if (!l || !m) return
      const a = landsatVsModis(l, m)
      expect(a).not.toBeNull()
      expect(a!.n).toBeGreaterThan(50)
      expect(a!.r).toBeGreaterThan(0.8)
    })
  }

  it('Kedah shows low greenness around flooding or bare ground and high greenness at the peaks', async () => {
    const f = await loadBundledLandsat('kedah')
    const v = (f?.points ?? []).map((p) => p[1])
    expect(Math.min(...v)).toBeLessThan(0.1)
    expect(Math.max(...v)).toBeGreaterThan(0.8)
  })

  it('Iowa peaks in summer (Jun-Aug) like the MODIS series', async () => {
    const f = await loadBundledLandsat('iowa')
    const byMonth = new Map<number, number[]>()
    for (const [d, v] of f?.points ?? []) {
      const m = Number(d.slice(5, 7))
      byMonth.set(m, [...(byMonth.get(m) ?? []), v])
    }
    const avg = (m: number) => {
      const xs = byMonth.get(m) ?? []
      return xs.reduce((s, x) => s + x, 0) / xs.length
    }
    const best = [...byMonth.keys()].sort((a, b) => avg(b) - avg(a))[0]
    expect([6, 7, 8]).toContain(best)
  })

  it('has no Landsat file for Cameron Highlands (no verified cropland pixel) or unknown ids', async () => {
    expect(await loadBundledLandsat('cameron')).toBeNull()
    expect(await loadBundledLandsat('nope')).toBeNull()
  })
})

describe('bundled NASADEM elevation and slope', () => {
  it('Cameron Highlands is high: about 1,435 m, consistent with Tanah Rata at ~1,440 m (README)', async () => {
    const e = await loadBundledElevation('cameron')
    expect(e?.elevationM).toBeGreaterThan(1400)
    expect(e?.elevationM).toBeLessThan(1470)
    expect(e!.min3x3M).toBeLessThanOrEqual(e!.elevationM)
    expect(e!.max3x3M).toBeGreaterThanOrEqual(e!.elevationM)
    expect(e!.slope30mDeg).toBeGreaterThan(2) // hilly terrain
  })

  it('Kedah is at sea level and Iowa is a low plain', async () => {
    const k = await loadBundledElevation('kedah')
    const i = await loadBundledElevation('iowa')
    expect(Math.abs(k!.elevationM)).toBeLessThan(10)
    expect(i!.elevationM).toBeGreaterThan(200)
    expect(i!.elevationM).toBeLessThan(330)
    // Flat ground: the 90 m slope is small.
    expect(k!.slope90mDeg).toBeLessThan(2)
    expect(i!.slope90mDeg).toBeLessThan(2)
  })

  it('records where the numbers come from', async () => {
    for (const id of ['kedah', 'cameron', 'iowa']) {
      const e = await loadBundledElevation(id)
      expect(e?.source).toContain('NASADEM')
      expect(e?.source).toContain('Planetary Computer')
      expect(e?.fetched).toBe('2026-11-14')
    }
  })
})

describe('landsatVsModis', () => {
  const landsat = (pts: [string, number][]): LandsatFile =>
    ({ points: pts.map(([d, v]) => [d, v, 'L8']) }) as unknown as LandsatFile
  const modis = (pts: [string, number | null][]): NdviFile => ({ points: pts }) as unknown as NdviFile

  it('is perfectly correlated with an identical series and ignores gaps wider than 20 days', () => {
    const m = modis([
      ['2022-01-01', 0.2], ['2022-01-17', 0.4], ['2022-02-02', 0.6], ['2022-02-18', 0.8], ['2022-03-06', 0.9],
      ['2022-06-01', 0.1], // a 3-month gap after 2022-03-06
    ])
    const l = landsat([
      ['2022-01-05', 0.25], ['2022-01-09', 0.3], ['2022-01-25', 0.5], ['2022-02-10', 0.7], ['2022-02-26', 0.85],
      ['2022-03-10', 0.9], ['2022-04-15', 0.5], // these two fall in the 3-month gap, so they are skipped
    ])
    const a = landsatVsModis(l, m)
    expect(a).not.toBeNull()
    expect(a!.n).toBe(5)
    expect(a!.r).toBeCloseTo(1, 6)
    expect(a!.meanLandsat).toBeCloseTo(a!.meanModis, 6)
  })

  it('returns null when too few dates overlap', () => {
    expect(landsatVsModis(landsat([['2022-01-09', 0.3]]), modis([['2022-01-01', 0.2], ['2022-01-17', 0.4]]))).toBeNull()
  })
})
