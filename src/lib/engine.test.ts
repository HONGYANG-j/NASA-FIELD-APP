import { describe, expect, it } from 'vitest'
import raw from './__fixtures__/kl-2024-power.json'
import { gridElevation, parsePower } from './power'
import {
  applyElevation,
  applyScenario,
  elevationOffset,
  linearTrend,
  monthlyClimatology,
  slotYears,
} from './climate'
import { buildSlotTable, buildStrategies, scoreRotation } from './rotation'
import { CROP_BY_ID } from '../data/crops'
import type { Weights } from '../types'

// Real NASA POWER daily data: Kuala Lumpur (3.14N, 101.69E), calendar year 2024.
const series = parsePower(raw as never)
const W: Weights = { water: 3, soil: 3, income: 3, resilience: 3 }

describe('POWER parsing (real data)', () => {
  it('reads 366 days with no missing values', () => {
    expect(series.year.length).toBe(366)
    expect(series.tmean.some(Number.isNaN)).toBe(false)
    expect(series.precip.some(Number.isNaN)).toBe(false)
  })

  it('monthly rainfall sums back to the annual total', () => {
    const annual = series.precip.reduce((a, b) => a + b, 0)
    const monthly = monthlyClimatology(series).reduce((a, m) => a + m.rainMm, 0)
    expect(monthly).toBeCloseTo(annual, 6)
  })

  it('converts evapotranspiration energy flux to mm/day', () => {
    // 2.45 MJ/m2/day == 1 mm/day
    const i = series.etMm.findIndex((x) => x > 0)
    expect(series.etMm[i]).toBeGreaterThan(0)
    expect(series.etMm[i]).toBeLessThan(8)
  })
})

describe('elevation correction', () => {
  it('reads the grid elevation POWER reports', () => {
    expect(gridElevation(raw as never)).toBeGreaterThan(0)
  })

  it('cools 6.5 C per 1000 m above the grid cell and warms below it', () => {
    expect(elevationOffset(500, 1500)).toBeCloseTo(-6.5, 9)
    expect(elevationOffset(500, 0)).toBeCloseTo(3.25, 9)
    expect(elevationOffset(null, 1500)).toBe(0)
    expect(elevationOffset(500, null)).toBe(0)
  })

  it('shifts temperatures but leaves rainfall untouched', () => {
    const s = applyElevation(series, 100, 1100)
    expect(s.tmean[5]).toBeCloseTo(series.tmean[5] - 6.5, 9)
    expect(s.tmax[5]).toBeCloseTo(series.tmax[5] - 6.5, 9)
    expect(s.tmin[5]).toBeCloseTo(series.tmin[5] - 6.5, 9)
    expect(s.precip).toEqual(series.precip)
  })

  it('Cameron Highlands: grid 592.7 m vs field 1440 m gives about -5.5 C', () => {
    // Real POWER geometry for 4.47N 101.38E; Tanah Rata is ~1440 m. Observed long-term
    // mean there is ~17.9 C versus ~23.5 C in the raw grid cell: 23.5 - 5.5 = 18.0.
    expect(elevationOffset(592.7, 1440)).toBeCloseTo(-5.5, 1)
  })
})

describe('climate helpers', () => {
  it('scenario shifts temperature and scales rainfall', () => {
    const s = applyScenario(series, { dTemp: 2, rainPct: -50 })
    expect(s.tmean[10]).toBeCloseTo(series.tmean[10] + 2, 9)
    expect(s.precip[10]).toBeCloseTo(series.precip[10] * 0.5, 9)
  })

  it('slot windows of one calendar year contain the right number of days', () => {
    const y = slotYears(series, 1, 4) // Jan-Apr 2024 = 31+29+31+30
    expect(y).toHaveLength(1)
    expect(y[0].days).toBe(121)
  })

  it('detects an obvious linear trend', () => {
    const xs = [2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009]
    const ys = xs.map((x, i) => 20 + 0.1 * (x - 2000) + (i % 2 ? 0.01 : -0.01))
    const t = linearTrend(xs, ys)
    expect(t.slope).toBeCloseTo(0.1, 2)
    expect(t.significant).toBe(true)
  })
})

describe('rotation scoring on Kuala Lumpur data', () => {
  const table = buildSlotTable(series, { dTemp: 0, rainPct: 0 }, 1)

  it('rates a tropical crop better than a cool-climate crop in the tropics', () => {
    const rice = table.evidence[0].rice
    const wheat = table.evidence[0].wheat
    expect(rice.fit).toBeGreaterThan(wheat.fit)
  })

  it('reports heat days only for crops with a heat limit', () => {
    expect(table.evidence[0].fallow.heatDays).toBe(0)
  })

  it('penalises the same plant family back to back', () => {
    const rr = scoreRotation(
      [CROP_BY_ID.rice, CROP_BY_ID.rice, CROP_BY_ID.maize],
      table,
      W,
    )
    const rl = scoreRotation(
      [CROP_BY_ID.rice, CROP_BY_ID.cowpea, CROP_BY_ID.maize],
      table,
      W,
    )
    expect(rl.dims.soil).toBeGreaterThan(rr.dims.soil)
  })

  it('penalises bare fallow in the soil score', () => {
    const bare = scoreRotation(
      [CROP_BY_ID.rice, CROP_BY_ID.fallow, CROP_BY_ID.maize],
      table,
      W,
    )
    const cover = scoreRotation(
      [CROP_BY_ID.rice, CROP_BY_ID.covermix, CROP_BY_ID.maize],
      table,
      W,
    )
    expect(cover.dims.soil).toBeGreaterThan(bare.dims.soil)
  })

  it('always returns four distinct strategies including the current one', () => {
    const cur = [CROP_BY_ID.rice, CROP_BY_ID.rice, CROP_BY_ID.fallow]
    const st = buildStrategies(cur, table, W)
    expect(st).toHaveLength(4)
    const keys = st.map((s) => s.result.crops.map((c) => c.id).join('>'))
    expect(new Set(keys).size).toBe(4)
    expect(st[0].id).toBe('current')
  })
})
