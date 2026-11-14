import { describe, expect, it } from 'vitest'
import raw from './__fixtures__/kl-2024-power.json'
import { parsePower } from './power'
import { applyScenario, slotYears } from './climate'
import { buildSlotTable } from './rotation'
import { CROP_BY_ID } from '../data/crops'
import {
  cropWater,
  cycleLength,
  extraterrestrialRadiationMm,
  hargreavesEt0,
  kcAtDay,
  monthlyRa,
} from './water'
import type { SlotYear } from '../types'

/** A constant-weather season window, for exact hand arithmetic. */
function flatSlot(days: number, et0: number, rainPerDay: number): SlotYear {
  return {
    seasonYear: 2024,
    days,
    tmean: Array(days).fill(25),
    tmax: Array(days).fill(30),
    tmin: Array(days).fill(20),
    precipMm: rainPerDay * days,
    etMm: 0,
    rootWet: 0.5,
    precip: Array(days).fill(rainPerDay),
    et0: Array(days).fill(et0),
  }
}

describe('extraterrestrial radiation and Hargreaves ET0 (FAO-56)', () => {
  it("reproduces FAO-56's worked Example 8: 20 S on 3 September, Ra = 32.2 MJ/m2/day = 13.1 mm/day", () => {
    const ra = extraterrestrialRadiationMm(-20, 246)
    expect(ra / 0.408).toBeCloseTo(32.2, 1)
    expect(ra).toBeCloseTo(13.1, 1)
  })

  it('is larger in summer than winter, and is never negative', () => {
    expect(extraterrestrialRadiationMm(42, 172)).toBeGreaterThan(extraterrestrialRadiationMm(42, 355))
    for (const lat of [-60, 0, 42, 80]) for (const j of [15, 105, 196, 349]) {
      expect(extraterrestrialRadiationMm(lat, j)).toBeGreaterThanOrEqual(0)
    }
    expect(monthlyRa(6)).toHaveLength(12)
  })

  it('Eq. 52 by hand: Tmean 25, Tmax 31, Tmin 19, Ra 13.1 -> 0.0023 x 42.8 x sqrt(12) x 13.1 = 4.47 mm/day', () => {
    expect(hargreavesEt0(25, 31, 19, 13.1)).toBeCloseTo(4.467, 2)
  })

  it('never goes negative in freezing weather and passes missing data through', () => {
    expect(hargreavesEt0(-30, -25, -35, 5)).toBe(0)
    expect(Number.isNaN(hargreavesEt0(NaN, 20, 10, 10))).toBe(true)
  })
})

describe('crop coefficient curve (FAO-56 Eq. 66)', () => {
  const maize = CROP_BY_ID.maize.kc! // ini 0.3, mid 1.2, end 0.475, stages 20/35/40/30

  it('is constant in the initial and mid stages', () => {
    expect(kcAtDay(maize, 0)).toBeCloseTo(0.3, 9)
    expect(kcAtDay(maize, 19)).toBeCloseTo(0.3, 9) // day 20 is the last initial day
    expect(kcAtDay(maize, 60)).toBeCloseTo(1.2, 9)
  })

  it('rises linearly through development and falls linearly through the late stage', () => {
    expect(kcAtDay(maize, 20)).toBeCloseTo(0.3 + (1 / 35) * 0.9, 9) // day 21
    expect(kcAtDay(maize, 54)).toBeCloseTo(1.2, 9) // day 55: end of development
    expect(kcAtDay(maize, 95)).toBeCloseTo(1.2 + (1 / 30) * (0.475 - 1.2), 9) // day 96
    expect(kcAtDay(maize, 124)).toBeCloseTo(0.475, 9) // day 125: last day
  })

  it('has no value before or after the cycle', () => {
    expect(kcAtDay(maize, -1)).toBeNull()
    expect(kcAtDay(maize, 125)).toBeNull()
    expect(cycleLength(maize)).toBe(125)
  })
})

describe('cropWater: need and usable rain', () => {
  it('maize in a 122-day window of ET0 4 mm/day and 3 mm/day rain, by hand', () => {
    // sum of Kc over days 1..122 = 6 + 26.7 + 48 + 23.265 = 103.965
    const w = cropWater(CROP_BY_ID.maize, flatSlot(122, 4, 3))
    expect(w.method).toBe('climate')
    expect(w.days).toBe(122)
    expect(w.needMm).toBeCloseTo(4 * 103.965, 1)
    expect(w.rainMm).toBeCloseTo(366, 6)
  })

  it('a crop shorter than the window only counts the rain on its own days', () => {
    const w = cropWater(CROP_BY_ID.mungbean, flatSlot(122, 4, 3)) // 100-day cycle
    expect(w.days).toBe(100)
    expect(w.rainMm).toBeCloseTo(300, 6)
  })

  it('falls back to the fixed table value for crops without a Kc curve', () => {
    const w = cropWater(CROP_BY_ID.clover, flatSlot(122, 4, 3))
    expect(w.method).toBe('table')
    expect(w.needMm).toBe(CROP_BY_ID.clover.waterNeedMm)
    expect(w.rainMm).toBeCloseTo(366, 6)
  })

  it('falls back to the table when the season has no ET0 (no latitude)', () => {
    const sy = { ...flatSlot(122, 4, 3), et0: undefined }
    expect(cropWater(CROP_BY_ID.maize, sy).method).toBe('table')
  })
})

describe('water need from real NASA POWER data (Kuala Lumpur 2024)', () => {
  const series = parsePower(raw as never)

  it('reads the latitude from the POWER response', () => {
    expect(series.latitude).toBeCloseTo(3.14, 1)
  })

  it('gives a plausible humid-tropics ET0 of 3-5 mm/day', () => {
    const w = slotYears(series, 1, 4)[0]
    const e = w.et0!.reduce((a, b) => a + b, 0) / w.et0!.length
    expect(e).toBeGreaterThan(3)
    expect(e).toBeLessThan(5)
  })

  it('a hotter climate raises the water a crop needs', () => {
    const base = buildSlotTable(series, { dTemp: 0, rainPct: 0 }, 1)
    const hot = buildSlotTable(series, { dTemp: 3, rainPct: 0 }, 1)
    expect(hot.evidence[0].maize.needMm).toBeGreaterThan(base.evidence[0].maize.needMm)
    expect(base.evidence[0].maize.needMethod).toBe('climate')
  })

  it('less rain lowers the rain counted on a crop\'s days', () => {
    const dry = applyScenario(series, { dTemp: 0, rainPct: -50 })
    const a = cropWater(CROP_BY_ID.maize, slotYears(series, 1, 4)[0])
    const b = cropWater(CROP_BY_ID.maize, slotYears(dry, 1, 4)[0])
    expect(b.rainMm).toBeCloseTo(a.rainMm * 0.5, 6)
  })
})
