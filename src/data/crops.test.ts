import { describe, expect, it } from 'vitest'
import { CROP_BY_ID, CROPS } from './crops'

// Published values transcribed from the FAO pages cited in crops.ts, so a careless edit
// to the table cannot silently drift away from the source.
//  [W] FAO Training Manual 3, ch. 2, Table 5: seasonal crop water need (mm)
const WATER_MM: Record<string, [number, number]> = {
  rice: [450, 700],
  maize: [500, 800],
  sorghum: [450, 650],
  wheat: [450, 650],
  soybean: [450, 700],
  groundnut: [500, 700],
  potato: [500, 700],
  cabbage: [350, 500],
  sunflower: [600, 1000],
}
//  [W] Table 4 / [T] Table A4.1: growing period (days)
const CYCLE: Record<string, [number, number]> = {
  rice: [90, 150],
  maize: [125, 180],
  sorghum: [120, 130],
  wheat: [120, 150],
  soybean: [135, 150],
  groundnut: [130, 140],
  potato: [105, 145],
  cabbage: [120, 140],
  sunflower: [125, 130],
  cassava: [150, 330],
  sweetpotato: [115, 155],
  mungbean: [60, 100],
  cowpea: [80, 140],
}
//  [T] Table A4.2: lower edge of the S1 (highly suitable) 24 h mean-temperature band, C
const S1_MIN_TEMP: Record<string, number> = {
  rice: 22.5, // zones 1-2
  sorghum: 20, // zones 1-3
  wheat: 15, // zones 4-5
  soybean: 20, // zones 2-3
  mungbean: 25, // zone 1
  cowpea: 22.5,
  groundnut: 22.5,
  sweetpotato: 22.5,
  cassava: 22.5,
  potato: 17.5, // zone 4
}

describe('crop table matches the FAO sources it cites', () => {
  for (const [id, [lo, hi]] of Object.entries(WATER_MM)) {
    it(`${id}: seasonal water need lies in the FAO range ${lo}-${hi} mm`, () => {
      const v = CROP_BY_ID[id].waterNeedMm
      expect(v).toBeGreaterThanOrEqual(lo)
      expect(v).toBeLessThanOrEqual(hi)
      // Midpoint, except paddy rice where we deliberately use the top of the range.
      expect(v).toBe(id === 'rice' ? hi : (lo + hi) / 2)
    })
  }

  for (const [id, [lo, hi]] of Object.entries(CYCLE)) {
    it(`${id}: growing period is ${lo}-${hi} days`, () => {
      expect(CROP_BY_ID[id].cycleDays).toEqual([lo, hi])
    })
  }

  for (const [id, t] of Object.entries(S1_MIN_TEMP)) {
    it(`${id}: optimum temperature band starts at the FAO S1 edge (${t} C)`, () => {
      const c = CROP_BY_ID[id]
      expect(c.check.temp).not.toBe('unverified')
      // Maize is excluded above: it mixes lowland (>20) and highland (17.5-20) types.
      expect(c.tOptMin).toBe(t)
    })
  }

  it('crops flagged as FAO-backed for water are exactly those in the published table', () => {
    const flagged = CROPS.filter((c) => c.check.water === 'fao' && c.group !== 'fallow')
      .map((c) => c.id)
      .sort()
    expect(flagged).toEqual(Object.keys(WATER_MM).sort())
  })

  it('every crop has sane temperature and tolerance values', () => {
    for (const c of CROPS) {
      expect(c.tOptMin).toBeLessThan(c.tOptMax)
      expect(c.droughtTol).toBeGreaterThanOrEqual(1)
      expect(c.droughtTol).toBeLessThanOrEqual(5)
    }
  })
})

// FAO-56 (Allen et al. 1998) chapter 6, Table 12 (Kc ini / mid / end) and Table 11 (stage lengths).
// Ranges in the table are given as [low, high]; the code uses the midpoint. Where Kc ini is blank for a
// crop, the value is the crop-group row (cereals 0.3, legumes 0.4, roots and tubers 0.5, oil crops 0.35,
// small vegetables 0.7).
const fao56 = {
  //            ini          mid                 end                 stages (Table 11 row we use)
  rice: { ini: 1.05, mid: 1.2, end: [0.9, 0.6], st: [30, 30, 60, 30] },
  maize: { ini: 0.3, mid: 1.2, end: [0.6, 0.35], st: [20, 35, 40, 30] },
  sorghum: { ini: 0.3, mid: [1.0, 1.1], end: 0.55, st: [20, 35, 40, 30] },
  wheat: { ini: 0.3, mid: 1.15, end: [0.25, 0.4], st: [15, 25, 50, 30] },
  soybean: { ini: 0.4, mid: 1.15, end: 0.5, st: [20, 35, 60, 25] },
  mungbean: { ini: 0.4, mid: 1.05, end: [0.6, 0.35], st: [20, 30, 30, 20] },
  cowpea: { ini: 0.4, mid: 1.05, end: [0.6, 0.35], st: [20, 30, 30, 20] },
  groundnut: { ini: 0.4, mid: 1.15, end: 0.6, st: [25, 35, 45, 25] },
  sweetpotato: { ini: 0.5, mid: 1.15, end: 0.65, st: [15, 30, 50, 30] },
  cassava: { ini: 0.3, mid: 0.8, end: 0.3, st: [20, 40, 90, 60] },
  potato: { ini: 0.5, mid: 1.15, end: 0.75, st: [25, 30, 45, 30] },
  cabbage: { ini: 0.7, mid: 1.05, end: 0.95, st: [40, 60, 50, 15] },
  sunflower: { ini: 0.35, mid: [1.0, 1.15], end: 0.35, st: [25, 35, 45, 25] },
} as const

const point = (v: number | readonly [number, number]) => (typeof v === 'number' ? v : (v[0] + v[1]) / 2)

describe('crop coefficients match FAO-56 Tables 11 and 12', () => {
  for (const [id, f] of Object.entries(fao56)) {
    it(`${id}: Kc ini/mid/end and stage lengths`, () => {
      const kc = CROP_BY_ID[id].kc!
      expect(kc.ini).toBeCloseTo(point(f.ini), 9)
      expect(kc.mid).toBeCloseTo(point(f.mid), 9)
      expect(kc.end).toBeCloseTo(point(f.end), 9)
      expect(kc.stages).toEqual(f.st)
    })
  }

  it('only crops without a usable FAO-56 row lack a Kc curve (clover, cover mix, fallow)', () => {
    const without = CROPS.filter((c) => !c.kc).map((c) => c.id).sort()
    expect(without).toEqual(['clover', 'covermix', 'fallow'])
  })

  it('computed need stays near the FAO Training Manual 3 reference range for a typical climate', () => {
    // A mid-season ET0 of ~4.5 mm/day over the crop days should land in the neighbourhood of Table 5.
    for (const id of ['maize', 'sorghum', 'soybean', 'groundnut', 'sunflower', 'potato']) {
      const kc = CROP_BY_ID[id].kc!
      const days = kc.stages.reduce((a, b) => a + b, 0)
      let sum = 0
      for (let d = 0; d < days; d++) {
        const i = d + 1
        const [li, ld, lm, ll] = kc.stages
        const v = i <= li ? kc.ini : i <= li + ld ? kc.ini + ((i - li) / ld) * (kc.mid - kc.ini) : i <= li + ld + lm ? kc.mid : kc.mid + ((i - li - ld - lm) / ll) * (kc.end - kc.mid)
        sum += v * 4.5
      }
      const [lo, hi] = WATER_MM[id]
      // Within 35% of the published range: the range spans climates, ours is one assumed ET0.
      expect(sum).toBeGreaterThan(lo * 0.65)
      expect(sum).toBeLessThan(hi * 1.35)
    }
  })
})
