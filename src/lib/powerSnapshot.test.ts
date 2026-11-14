import { describe, expect, it } from 'vitest'
import { PRESETS } from '../data/presets'
import { loadDaily, loadSnapshot, parsePower, snapshotToResponse } from './power'

describe('bundled NASA POWER snapshots', () => {
  for (const p of PRESETS) {
    it(`${p.id}: complete 2005-2024 daily record, parsed by the same code as a live response`, async () => {
      const snap = (await loadSnapshot(p.lat, p.lon, 2005, 2024))!
      expect(snap).not.toBeNull()
      expect(snap.days).toBe(7305) // 20 years incl. 5 leap days
      expect(Object.keys(snap.series).sort()).toEqual(['EVPTRNS', 'GWETROOT', 'PRECTOTCORR', 'T2M', 'T2M_MAX', 'T2M_MIN'])
      for (const v of Object.values(snap.series)) expect(v).toHaveLength(7305)
      const s = parsePower(snapshotToResponse(snap))
      expect(s.year).toHaveLength(7305)
      expect(s.year[0]).toBe(2005)
      expect(s.year[7304]).toBe(2024)
      expect(s.month[0]).toBe(1)
      expect(s.month[7304]).toBe(12)
      expect(s.tmean.every((x) => Number.isFinite(x))).toBe(true)
      expect(s.precip.every((x) => Number.isFinite(x) && x >= 0)).toBe(true)
      expect(s.latitude).toBeCloseTo(p.lat, 0)
    })
  }

  it('gives the grid elevations the app uses for the elevation correction', async () => {
    const ele = async (id: string) => {
      const p = PRESETS.find((x) => x.id === id)!
      return (await loadDaily(p.lat, p.lon, 2005, 2024)).gridElevationM
    }
    expect(await ele('cameron')).toBeCloseTo(592.7, 1) // field 1,440 m -> about -5.5 C
    expect(await ele('kedah')).toBeCloseTo(127.73, 1)
    expect(await ele('iowa')).toBeCloseTo(310.22, 1)
  })

  it('reports where the data came from, and does not use a snapshot for another point or period', async () => {
    const kedah = PRESETS[0]
    const r = await loadDaily(kedah.lat, kedah.lon, 2005, 2024)
    expect(r.snapshotDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(await loadSnapshot(kedah.lat + 0.01, kedah.lon, 2005, 2024)).toBeNull()
    expect(await loadSnapshot(kedah.lat, kedah.lon, 2010, 2024)).toBeNull()
  })

  it('has plausible climates: Kedah wet and warm, Iowa cold winters, Cameron cooler than Kedah before the elevation correction', async () => {
    const mean = async (id: string, f: (s: ReturnType<typeof parsePower>) => number[]) => {
      const p = PRESETS.find((x) => x.id === id)!
      const snap = (await loadSnapshot(p.lat, p.lon, 2005, 2024))!
      const v = f(parsePower(snapshotToResponse(snap)))
      return v.reduce((a, b) => a + b, 0) / v.length
    }
    expect(await mean('kedah', (s) => s.tmean)).toBeGreaterThan(25)
    expect(await mean('iowa', (s) => s.tmean)).toBeLessThan(12)
    expect(await mean('kedah', (s) => s.precip)).toBeGreaterThan(5) // mm/day, about 2,400 mm a year
    expect(await mean('cameron', (s) => s.tmean)).toBeLessThan(await mean('kedah', (s) => s.tmean))
  })
})
