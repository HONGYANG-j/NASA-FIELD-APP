import { describe, expect, it } from 'vitest'
import {
  compositeDays,
  growingSeasons,
  typicalCycles,
  loadBundledModis,
  modisObservations,
  monthlyModis,
  slotModis,
} from './satellite'
import type { ModisFile, ModisSeries } from './satellite'

function series(points: [string, number | null][], over: Partial<ModisSeries> = {}): ModisSeries {
  return {
    product: 'TEST',
    band: 'TEST',
    qcBand: null,
    unit: 'x',
    scale: 1,
    offset: 0,
    validRaw: [0, 100],
    fillRaw: 255,
    years: [2021, 2022],
    pixelMetres: 500,
    tile: null,
    nullCount: 0,
    points: points.map(([d, v]) => [d, v, null]),
    ...over,
  }
}

function file(s: Partial<ModisFile['series']>, layers: ModisFile['phenology']['layers'] = []): ModisFile {
  return {
    id: 't', latitude: 0, longitude: 0, years: [2021, 2022], fetched: '2026-11-14', service: 'x',
    series: s,
    phenology: { product: 'MCD12Q2', source: 'x', pixelMetres: 500, fillRaw: 32767, layers },
  }
}

/** Every `step` days from 1 Jan through 31 Dec of `year`, as YYYY-MM-DD. */
function dates(year: number, step: number): string[] {
  const out: string[] = []
  for (let t = Date.UTC(year, 0, 1); t < Date.UTC(year + 1, 0, 1); t += step * 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

describe('compositeDays', () => {
  it('is 8 days except for the last composite of the year', () => {
    expect(compositeDays('2023-01-01')).toBe(8)
    expect(compositeDays('2023-12-19')).toBe(8)
    expect(compositeDays('2023-12-27')).toBe(5) // day 361 of a 365-day year
    expect(compositeDays('2024-12-26')).toBe(6) // day 361 of a 366-day year
  })
})

describe('MODIS observations', () => {
  it('turns evapotranspiration per composite into mm per day, with a short last composite', () => {
    const f = file({ et: series([['2023-06-01', 40], ['2023-12-27', 40]]) })
    const obs = modisObservations(f, 'et')
    expect(obs[0].v).toBeCloseTo(5, 6) // 40 mm / 8 days
    expect(obs[1].v).toBeCloseTo(8, 6) // 40 mm / 5 days
  })

  it('leaves temperature and leaf area as they are and skips null values', () => {
    const f = file({ lai: series([['2023-06-01', 3.2], ['2023-06-05', null]]) })
    const obs = modisObservations(f, 'lai')
    expect(obs).toHaveLength(1)
    expect(obs[0].v).toBe(3.2)
  })

  it('assigns a composite to the month of its middle day', () => {
    // Starts 28 Feb 2023, 8 days: middle day is 4 March.
    const f = file({ lstDay: series([['2023-02-28', 30]]) })
    expect(modisObservations(f, 'lstDay')[0].month).toBe(3)
  })

  it('returns nothing for a series that is not bundled', () => {
    expect(modisObservations(file({}), 'et')).toEqual([])
  })
})

describe('monthly and per-season summaries', () => {
  const ds = dates(2022, 8).concat(dates(2023, 8))
  const f = file({ lstDay: series(ds.map((d) => [d, d.startsWith('2022') ? 30 : 32] as [string, number])) })

  it('averages every composite whose middle day falls in the month', () => {
    const m = monthlyModis(f, 'lstDay')
    expect(m).toHaveLength(12)
    expect(m[5].mean).toBeCloseTo(31, 6)
    expect(m[5].min).toBe(30)
    expect(m[5].max).toBe(32)
  })

  it('counts only season-years with most of their composites', () => {
    const s = slotModis(f, 'lstDay', 5, 4)! // May-Aug
    expect(s.years).toBe(2)
    expect(s.perYear).toEqual([30, 32])
    expect(slotModis(f, 'lstDay', 5, 4)!.mean).toBeCloseTo(31, 6)
  })

  it('drops a season that crosses the data edge', () => {
    // Nov-Feb window: the Nov-Dec 2022 part starts a season that ends in Feb 2023 (complete); 2023's ends after the data.
    const s = slotModis(f, 'lstDay', 11, 4)!
    expect(s.years).toBe(1)
  })

  it('returns null when no season is complete', () => {
    const sparse = file({ lstDay: series([['2022-05-01', 30]]) })
    expect(slotModis(sparse, 'lstDay', 5, 4)).toBeNull()
  })
})

describe('growing seasons', () => {
  it('lists cycles with a greenup date, in time order, with their length', () => {
    const f = file({}, [
      {
        layerYear: 2020, layerDate: '2020-01-01', numCycles: 2,
        cycles: [
          { greenup: '2020-02-01', senescence: '2020-04-01', dormancy: '2020-05-01' },
          { greenup: '2020-08-01', senescence: null, dormancy: null },
        ],
      },
      { layerYear: 2019, layerDate: '2019-01-01', numCycles: 1, cycles: [{ greenup: '2019-06-01', dormancy: '2019-09-29' }, {}] },
    ])
    const g = growingSeasons(f)
    expect(g.map((x) => x.greenup)).toEqual(['2019-06-01', '2020-02-01', '2020-08-01'])
    expect(g[0].lengthDays).toBe(120)
    expect(g[1].lengthDays).toBe(90)
    expect(g[2].lengthDays).toBeNull()
  })
})

describe('bundled MODIS files', () => {
  it('has none for locations without a verified cropland pixel', async () => {
    expect(await loadBundledModis('cameron')).toBeNull()
    expect(await loadBundledModis('does-not-exist')).toBeNull()
  })

  for (const id of ['kedah', 'iowa']) {
    it(`${id}: values are in physical, plausible ranges`, async () => {
      const f = (await loadBundledModis(id))!
      expect(f).not.toBeNull()
      const et = f.series.et!
      // MOD16A2 starts on 2021-01-01; nothing earlier can exist.
      expect(et.points[0][0] >= '2021-01-01').toBe(true)
      expect(et.points.filter((p) => p[1] !== null).length).toBeGreaterThan(100)
      for (const o of modisObservations(f, 'et')) {
        expect(o.v).toBeGreaterThanOrEqual(0)
        expect(o.v).toBeLessThan(15) // mm/day; MODIS ET never approaches the 32700 raw cap
      }
      for (const o of modisObservations(f, 'lstDay')) {
        expect(o.v).toBeGreaterThan(-30)
        expect(o.v).toBeLessThan(65)
      }
      for (const o of modisObservations(f, 'lstNight')) {
        expect(o.v).toBeGreaterThan(-40)
        expect(o.v).toBeLessThan(40)
      }
      for (const o of modisObservations(f, 'lai')) {
        expect(o.v).toBeGreaterThanOrEqual(0)
        expect(o.v).toBeLessThanOrEqual(10)
      }
      expect(et.pixelMetres).toBe(463)
      expect(f.series.lstDay!.pixelMetres).toBe(927)
    })
  }

  it('kedah shows two vegetation cycles a year and iowa one (as the NDVI series does)', async () => {
    const kedah = typicalCycles((await loadBundledModis('kedah'))!)
    expect(kedah.map((c) => c.cycle)).toEqual([1, 2])
    expect(kedah[0].n).toBeGreaterThanOrEqual(6)
    expect(kedah[1].n).toBeGreaterThanOrEqual(6)
    const iowa = typicalCycles((await loadBundledModis('iowa'))!)
    expect(iowa.map((c) => c.cycle)).toEqual([1])
    // Corn-belt greenup in spring (about May), dormancy in autumn (about October).
    expect(iowa[0].greenupDoy).toBeGreaterThan(120)
    expect(iowa[0].greenupDoy).toBeLessThan(160)
    expect(iowa[0].dormancyDoy).toBeGreaterThan(270)
    expect(iowa[0].dormancyDoy).toBeLessThan(310)
  })

  it('iowa evapotranspiration peaks in summer and is near zero in winter', async () => {
    const m = monthlyModis((await loadBundledModis('iowa'))!, 'et')
    const peak = m.reduce((a, b) => (b.mean > a.mean ? b : a))
    expect([6, 7, 8]).toContain(peak.month)
    expect(m[0].mean).toBeLessThan(1) // January: bundled values are 3-5 mm per 8 days (about 0.5 mm/day)
  })

  it('kedah land-surface temperature has gaps under cloud, which are left blank rather than averaged from a few days', async () => {
    const f = (await loadBundledModis('kedah'))!
    const m = monthlyModis(f, 'lstDay', 4)
    expect(m.some((x) => Number.isNaN(x.mean) && x.n > 0 && x.n < 4)).toBe(true)
    for (const x of m) if (Number.isFinite(x.mean)) expect(x.n).toBeGreaterThanOrEqual(4)
  })
})
