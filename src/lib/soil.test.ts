import { describe, expect, it, vi } from 'vitest'
import raw from './__fixtures__/kl-2024-power.json'
import kedah from './__fixtures__/soilgrids-kedah.json'
import cameron from './__fixtures__/soilgrids-cameron.json'
import iowa from './__fixtures__/soilgrids-iowa.json'
import { CROP_BY_ID, CROPS } from '../data/crops'
import { AWC_MID, AWC_RANGE, EVIDENCE_LABEL, SOIL_RULES } from '../data/soils'
import { explain } from './explain'
import { parsePower } from './power'
import { buildSlotTable, buildStrategies, fitInSlotYear, scoreRotation } from './rotation'
import {
  describeSoil,
  erosionFactor,
  isSoilKnown,
  omFromSoc,
  omWeight,
  profileFromSoilGrids,
  soilGaps,
  soilRisks,
  soilWhy,
  storedMoistureFactor,
  textureFromPercents,
  UNKNOWN_SOIL,
  waterlogParams,
} from './soil'
import type { SoilProfile } from './soil'
import { fetchSoilGrids, parseSoilGrids, soilGridsUrl } from './soilgrids'
import type { SoilGridsResponse } from './soilgrids'
import type { SlotYear, Weights } from '../types'

const W: Weights = { water: 3, soil: 3, income: 3, resilience: 3 }
const NO_CLIMATE_CHANGE = { dTemp: 0, rainPct: 0 }
const series = parsePower(raw as never) // real NASA POWER, Kuala Lumpur 2024

const soil = (p: Partial<SoilProfile>): SoilProfile => ({ ...UNKNOWN_SOIL, ...p })

/** A season with a chosen rainfall and root-zone wetness; temperatures sit inside every tropical crop's optimum. */
function season(precipMm: number, rootWet: number): SlotYear {
  const n = 120
  return {
    seasonYear: 2024,
    days: n,
    tmean: Array(n).fill(26),
    tmax: Array(n).fill(30),
    tmin: Array(n).fill(22),
    precipMm,
    etMm: 400,
    rootWet,
  }
}
const maize = CROP_BY_ID.maize // need 650 mm, droughtTol 2, waterlogTol 1
const rice = CROP_BY_ID.rice // need 700 mm, waterlogTol 5

describe('baseline: unknown soil changes nothing', () => {
  it('unknown, and moderate drainage / medium organic matter, have factor 1 everywhere', () => {
    for (const s of [UNKNOWN_SOIL, soil({ drainage: 'moderate', organicMatter: 'medium' })]) {
      expect(storedMoistureFactor(s)).toBeCloseTo(1, 12)
      expect(waterlogParams(s)).toEqual({ start: 2, slope: 1 })
      expect(erosionFactor(s)).toBe(1)
      expect(omWeight(s)).toBe(0.3)
    }
    // Loam is neutral for the water rules, but NOT for erosion (loamy soils are treated as more erodible).
    const loam = soil({ texture: 'loam' })
    expect(storedMoistureFactor(loam)).toBeCloseTo(1, 12)
    expect(waterlogParams(loam)).toEqual({ start: 2, slope: 1 })
    expect(erosionFactor(loam)).toBe(1.15)
    expect(isSoilKnown(UNKNOWN_SOIL)).toBe(false)
    expect(isSoilKnown(soil({ drainage: 'good' }))).toBe(true)
  })

  it('gives identical scores on real data with no soil, UNKNOWN_SOIL and the neutral classes', () => {
    const base = buildSlotTable(series, NO_CLIMATE_CHANGE, 1)
    expect(buildSlotTable(series, NO_CLIMATE_CHANGE, 1, { mode: 'seasons', irrigated: false, soil: UNKNOWN_SOIL }).evidence).toEqual(base.evidence)
    const neutral = buildSlotTable(series, NO_CLIMATE_CHANGE, 1, {
      mode: 'seasons',
      irrigated: false,
      soil: soil({ drainage: 'moderate', organicMatter: 'medium' }),
    })
    const crops = [CROP_BY_ID.rice, CROP_BY_ID.cowpea, CROP_BY_ID.maize]
    const a = scoreRotation(crops, base, W)
    const b = scoreRotation(crops, neutral, W)
    expect(b.overall).toBeCloseTo(a.overall, 9)
    expect(b.dims).toEqual(a.dims)
    expect(describeSoil(UNKNOWN_SOIL)).toBe('not specified')
  })
})

describe('rule 1: texture sets the stored-moisture allowance (FAO-56 Table 19)', () => {
  it('uses the midpoints of the published ranges', () => {
    expect(AWC_RANGE).toEqual({ sandy: [0.05, 0.11], loam: [0.13, 0.18], clay: [0.12, 0.2] })
    expect(AWC_MID.sandy).toBeCloseTo(0.08, 12)
    expect(AWC_MID.loam).toBeCloseTo(0.155, 12)
    expect(AWC_MID.clay).toBeCloseTo(0.16, 12)
  })

  it('scales the allowance relative to loam: sand 0.516, loam 1, clay 1.032', () => {
    expect(storedMoistureFactor(soil({ texture: 'sandy' }))).toBeCloseTo(0.08 / 0.155, 9)
    expect(storedMoistureFactor(soil({ texture: 'loam' }))).toBeCloseTo(1, 12)
    expect(storedMoistureFactor(soil({ texture: 'clay' }))).toBeCloseTo(0.16 / 0.155, 9)
  })

  it('makes sandy soil fall short of the crop water need where loam and clay do not (rain-fed)', () => {
    // 500 mm rain + stored water vs 650 mm need. Full root-zone wetness gives a 162.5 mm allowance on loam.
    const sy = season(500, 0.8)
    const loam = fitInSlotYear(maize, sy, false, soil({ texture: 'loam' }))
    const clay = fitInSlotYear(maize, sy, false, soil({ texture: 'clay' }))
    const sandy = fitInSlotYear(maize, sy, false, soil({ texture: 'sandy' }))
    expect(loam.needMet).toBe(true)
    expect(clay.needMet).toBe(true)
    expect(sandy.needMet).toBe(false)
    const ratio = (500 + 162.5 * (0.08 / 0.155)) / 650
    expect(sandy.waterFit).toBeCloseTo(1 - (1 - ratio) * (1.2 - 0.2 * maize.droughtTol), 9)
    expect(sandy.fit).toBeLessThan(loam.fit)
  })

  it('has no effect when the farmer can irrigate', () => {
    const sy = season(500, 0.8)
    const a = fitInSlotYear(maize, sy, true, soil({ texture: 'sandy' }))
    const b = fitInSlotYear(maize, sy, true, UNKNOWN_SOIL)
    expect(a).toEqual(b)
  })

  it('on real climate data sandy soil lowers the fit of crops whose water need is not met', () => {
    // KL 2024 is one real (wet) year, so use the app's own what-if scenario (-60% rain) to create shortfalls.
    // Where rain + stored water fall short of the need, less stored water can only hurt.
    // (In very wet seasons sandy soil can score HIGHER: it drains, so the waterlogging penalty shrinks. That is intended.)
    const dry = { dTemp: 0, rainPct: -60 }
    const base = buildSlotTable(series, dry, 1)
    const sandy = buildSlotTable(series, dry, 1, { mode: 'seasons', irrigated: false, soil: soil({ texture: 'sandy' }) })
    let short = 0
    let lower = 0
    for (let i = 0; i < 3; i++)
      for (const c of CROPS) {
        const b = base.evidence[i][c.id]
        const sd = sandy.evidence[i][c.id]
        if (c.waterNeedMm > 0 && b.needMetYears === 0) {
          short++
          expect(sd.fit).toBeLessThanOrEqual(b.fit + 1e-12)
          expect(sd.needMetYears).toBe(0)
          if (sd.fit < b.fit - 1e-9) lower++
        }
      }
    expect(short).toBeGreaterThan(0)
    expect(lower).toBeGreaterThan(0)
  })
})

describe('rule 2: drainage nudges the stored-moisture allowance (unverified)', () => {
  it('multiplies by 1.1 (poor), 1.0 (moderate), 0.9 (good)', () => {
    expect(storedMoistureFactor(soil({ drainage: 'poor' }))).toBeCloseTo(1.1, 12)
    expect(storedMoistureFactor(soil({ drainage: 'moderate' }))).toBe(1)
    expect(storedMoistureFactor(soil({ drainage: 'good' }))).toBeCloseTo(0.9, 12)
  })

  it('multiplies with texture', () => {
    expect(storedMoistureFactor(soil({ texture: 'sandy', drainage: 'good' }))).toBeCloseTo((0.08 / 0.155) * 0.9, 9)
  })

  it('good drainage tips a marginal season into a shortfall, poor drainage does not', () => {
    const sy = season(500, 0.8) // loam: 662.5 vs 650 met; good: 500 + 146.25 = 646.25 short; poor: 678.75 met
    expect(fitInSlotYear(maize, sy, false, soil({ drainage: 'moderate' })).needMet).toBe(true)
    expect(fitInSlotYear(maize, sy, false, soil({ drainage: 'poor' })).needMet).toBe(true)
    const good = fitInSlotYear(maize, sy, false, soil({ drainage: 'good' }))
    expect(good.needMet).toBe(false)
    expect(good.waterFit).toBeCloseTo(1 - (1 - 646.25 / 650) * 0.8, 9)
  })
})

describe('rule 3: waterlogging starts sooner and bites harder on poor drainage and clay (unverified)', () => {
  it('sets thresholds and steepness', () => {
    expect(waterlogParams(soil({ drainage: 'poor' }))).toEqual({ start: 1.5, slope: 1.5 })
    expect(waterlogParams(soil({ drainage: 'good' }))).toEqual({ start: 2.5, slope: 0.7 })
    expect(waterlogParams(soil({ texture: 'clay' })).slope).toBeCloseTo(1.2, 12)
    expect(waterlogParams(soil({ texture: 'sandy' })).slope).toBeCloseTo(0.8, 12)
    expect(waterlogParams(soil({ texture: 'clay', drainage: 'poor' })).slope).toBeCloseTo(1.8, 12)
  })

  // 1800 mm of rain, zero stored water (rootWet 0.4): rain / need = 2.769 for maize (waterlogTol 1).
  const sy = season(1800, 0.4)
  const r = 1800 / 650
  const wf = (s: SoilProfile) => fitInSlotYear(maize, sy, false, s).waterFit

  it('matches the written formula for each class', () => {
    expect(wf(UNKNOWN_SOIL)).toBeCloseTo(1 - (r - 2) * 0.3, 9)
    expect(wf(soil({ drainage: 'poor' }))).toBeCloseTo(Math.max(0.3, 1 - (r - 1.5) * 0.3 * 1.5), 9)
    expect(wf(soil({ drainage: 'good' }))).toBeCloseTo(1 - (r - 2.5) * 0.3 * 0.7, 9)
    expect(wf(soil({ texture: 'clay' }))).toBeCloseTo(1 - (r - 2) * 0.3 * 1.2, 9)
    expect(wf(soil({ texture: 'sandy' }))).toBeCloseTo(1 - (r - 2) * 0.3 * 0.8, 9)
  })

  it('orders poor < clay < baseline < sandy < good', () => {
    expect(wf(soil({ drainage: 'poor' }))).toBeLessThan(wf(soil({ texture: 'clay' })))
    expect(wf(soil({ texture: 'clay' }))).toBeLessThan(wf(UNKNOWN_SOIL))
    expect(wf(UNKNOWN_SOIL)).toBeLessThan(wf(soil({ texture: 'sandy' })))
    expect(wf(soil({ texture: 'sandy' }))).toBeLessThan(wf(soil({ drainage: 'good' })))
  })

  it('never goes below the engine floor of 0.3', () => {
    expect(wf(soil({ texture: 'clay', drainage: 'poor' }))).toBeGreaterThanOrEqual(0.3)
  })

  it('does not touch waterlogging-tolerant crops (rice)', () => {
    const a = fitInSlotYear(rice, sy, false, soil({ texture: 'clay', drainage: 'poor' }))
    expect(a.waterFit).toBe(1)
  })

  it('has no effect while rain is below the start threshold', () => {
    const calm = season(1000, 0.4) // ratio 1.54 for maize: above poor's 1.5, below the baseline 2
    expect(fitInSlotYear(maize, calm, false, UNKNOWN_SOIL).waterFit).toBe(1)
    expect(fitInSlotYear(maize, calm, false, soil({ drainage: 'poor' })).waterFit).toBeLessThan(1)
    expect(fitInSlotYear(maize, calm, false, soil({ drainage: 'good' })).waterFit).toBe(1)
  })
})

describe('rule 4: texture sets erosion exposure (unverified)', () => {
  const table = (s: SoilProfile) => buildSlotTable(series, NO_CLIMATE_CHANGE, 1, { mode: 'seasons', irrigated: true, soil: s })
  const ricex3 = [rice, rice, rice]
  const bare = [rice, CROP_BY_ID.fallow, CROP_BY_ID.fallow]

  it('factors are 1.15 loam, 1.0 sandy, 0.9 clay', () => {
    expect(erosionFactor(soil({ texture: 'loam' }))).toBe(1.15)
    expect(erosionFactor(soil({ texture: 'sandy' }))).toBe(1)
    expect(erosionFactor(soil({ texture: 'clay' }))).toBe(0.9)
  })

  it('scales the ground-cover weight: rice x3 scores -0.06 + 0.15 x factor', () => {
    // 0.15 base + 0.3 x factor x 0.5 cover + 0.3 x 0.5 organic matter - 3 x 0.12 same-family repeats = -0.06 + 0.15 x factor
    expect(scoreRotation(ricex3, table(UNKNOWN_SOIL), W).dims.soil).toBeCloseTo(-0.06 + 0.15, 9)
    expect(scoreRotation(ricex3, table(soil({ texture: 'loam' })), W).dims.soil).toBeCloseTo(-0.06 + 0.15 * 1.15, 9)
    expect(scoreRotation(ricex3, table(soil({ texture: 'clay' })), W).dims.soil).toBeCloseTo(-0.06 + 0.15 * 0.9, 9)
  })

  it('scales the bare-fallow penalty: rice + 2 fallow seasons', () => {
    // 0.15 + 0.3 x f x (1/6) + 0.3 x (1/6) - 0.2 x f
    const exp = (f: number) => 0.15 + 0.3 * f * (0.5 / 3) + 0.3 * (0.5 / 3) - 0.2 * f
    expect(scoreRotation(bare, table(UNKNOWN_SOIL), W).dims.soil).toBeCloseTo(exp(1), 9)
    expect(scoreRotation(bare, table(soil({ texture: 'loam' })), W).dims.soil).toBeCloseTo(exp(1.15), 9)
    expect(scoreRotation(bare, table(soil({ texture: 'clay' })), W).dims.soil).toBeCloseTo(exp(0.9), 9)
    expect(scoreRotation(bare, table(soil({ texture: 'sandy' })), W).dims.soil).toBeCloseTo(exp(1), 9)
  })
})

describe('rule 5: soil organic matter sets the weight of the crops’ organic-matter contribution (unverified)', () => {
  it('weights are 0.4 low, 0.3 medium, 0.2 high', () => {
    expect(omWeight(soil({ organicMatter: 'low' }))).toBe(0.4)
    expect(omWeight(soil({ organicMatter: 'medium' }))).toBe(0.3)
    expect(omWeight(soil({ organicMatter: 'high' }))).toBe(0.2)
  })

  const table = (s: SoilProfile) => buildSlotTable(series, NO_CLIMATE_CHANGE, 1, { mode: 'seasons', irrigated: true, soil: s })
  it('changes the soil score by 0.5 x (weight - 0.3) for rice x3 (crop OM rating 3 of 5)', () => {
    const base = 0.09
    expect(scoreRotation([rice, rice, rice], table(soil({ organicMatter: 'low' })), W).dims.soil).toBeCloseTo(base + 0.05, 9)
    expect(scoreRotation([rice, rice, rice], table(soil({ organicMatter: 'high' })), W).dims.soil).toBeCloseTo(base - 0.05, 9)
  })

  it('makes an organic-matter-rich crop gain more on a depleted soil than on a rich one', () => {
    const rich = [CROP_BY_ID.maize, CROP_BY_ID.clover, CROP_BY_ID.maize] // clover OM rating 5
    const poor = [CROP_BY_ID.maize, CROP_BY_ID.potato, CROP_BY_ID.maize] // potato OM rating 2
    const gap = (om: SoilProfile['organicMatter']) =>
      scoreRotation(rich, table(soil({ organicMatter: om })), W).dims.soil - scoreRotation(poor, table(soil({ organicMatter: om })), W).dims.soil
    expect(gap('low')).toBeGreaterThan(gap('medium'))
    expect(gap('medium')).toBeGreaterThan(gap('high'))
  })
})

describe('rule 6: SoilGrids numbers become the three classes', () => {
  it('texture follows the simplified USDA limits', () => {
    expect(textureFromPercents(40, 20)).toBe('clay')
    expect(textureFromPercents(39.9, 20)).toBe('loam')
    expect(textureFromPercents(10, 70)).toBe('sandy')
    expect(textureFromPercents(19.9, 50)).toBe('sandy')
    expect(textureFromPercents(20, 70)).toBe('loam') // sandy clay loam / sandy loam with 20% clay: not "sandy" here
    expect(textureFromPercents(10, 49.9)).toBe('loam')
  })

  it('organic carbon thresholds: <10 low, 10-20 medium, >20 high g/kg (unverified)', () => {
    expect(omFromSoc(9.9)).toBe('low')
    expect(omFromSoc(10)).toBe('medium')
    expect(omFromSoc(20)).toBe('medium')
    expect(omFromSoc(20.1)).toBe('high')
  })

  it('never invents drainage: keeps the farmer’s own choice', () => {
    const r = { clayPct: 30, sandPct: 30, siltPct: 40, socGperKg: 15 }
    expect(profileFromSoilGrids(r).drainage).toBe('unknown')
    expect(profileFromSoilGrids(r, 'poor').drainage).toBe('poor')
  })
})

describe('SoilGrids parsing (real responses fetched 14 Nov 2026)', () => {
  it('Kedah: clay 36%, sand 29%, silt 35%, high carbon -> loam / high', () => {
    const r = parseSoilGrids(kedah as SoilGridsResponse)!
    expect(r.clayPct).toBeCloseTo((36.2 * 5 + 34.8 * 10 + 35.9 * 15) / 30, 6)
    expect(r.sandPct).toBeCloseTo((28.6 * 5 + 29.0 * 10 + 28.7 * 15) / 30, 6)
    expect(r.siltPct).toBeCloseTo((35.2 * 5 + 36.2 * 10 + 35.5 * 15) / 30, 6)
    expect(r.socGperKg).toBeCloseTo((41.1 * 5 + 38.8 * 10 + 26.4 * 15) / 30, 6)
    const p = profileFromSoilGrids(r)
    expect(p).toEqual({ texture: 'loam', drainage: 'unknown', organicMatter: 'high' })
  })

  it('Iowa: clay 30%, sand 31% -> loam; carbon about 18 g/kg -> medium', () => {
    const r = parseSoilGrids(iowa as SoilGridsResponse)!
    expect(r.clayPct).toBeCloseTo((28.8 * 5 + 29.8 * 10 + 31.2 * 15) / 30, 6)
    expect(r.socGperKg).toBeCloseTo((25.2 * 5 + 20.2 * 10 + 14.1 * 15) / 30, 6)
    expect(profileFromSoilGrids(r)).toEqual({ texture: 'loam', drainage: 'unknown', organicMatter: 'medium' })
  })

  it('Cameron Highlands exact point: every value is null -> no data, not a crash', () => {
    expect(parseSoilGrids(cameron as unknown as SoilGridsResponse)).toBeNull()
  })

  it('a partly empty or malformed response is treated as no data', () => {
    expect(parseSoilGrids({})).toBeNull()
    expect(parseSoilGrids({ properties: { layers: [] } })).toBeNull()
    const partial = JSON.parse(JSON.stringify(kedah)) as SoilGridsResponse
    partial.properties!.layers![0].depths[1].values.mean = null
    expect(parseSoilGrids(partial)).toBeNull()
  })

  it('builds the documented request', () => {
    const u = new URL(soilGridsUrl(6.25, 100.35))
    expect(u.origin + u.pathname).toBe('https://rest.isric.org/soilgrids/v2.0/properties/query')
    expect(u.searchParams.get('lat')).toBe('6.2500')
    expect(u.searchParams.get('lon')).toBe('100.3500')
    expect(u.searchParams.getAll('property')).toEqual(['clay', 'sand', 'silt', 'soc'])
    expect(u.searchParams.getAll('depth')).toEqual(['0-5cm', '5-15cm', '15-30cm'])
    expect(u.searchParams.get('value')).toBe('mean')
  })
})

describe('SoilGrids client: caching, timeout and graceful failure', () => {
  const okFetch = (body: unknown) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch
  const store = () => {
    const m = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    })
    return m
  }

  it('returns a profile on success and keeps the drainage choice', async () => {
    store()
    const r = await fetchSoilGrids(6.25, 100.35, { keepDrainage: 'good', fetchImpl: okFetch(kedah) })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.profile).toEqual({ texture: 'loam', drainage: 'good', organicMatter: 'high' })
      expect(r.fromCache).toBe(false)
    }
  })

  it('serves a second request for the same point from the cache', async () => {
    store()
    const first = okFetch(iowa)
    await fetchSoilGrids(41.95, -93.55, { fetchImpl: first })
    const second = vi.fn(async () => {
      throw new Error('network must not be used')
    }) as unknown as typeof fetch
    const r = await fetchSoilGrids(41.95, -93.55, { fetchImpl: second })
    expect(r.ok && r.fromCache).toBe(true)
    expect(second).not.toHaveBeenCalled()
  })

  it('reports "no data" for the all-null Cameron point (and caches that answer)', async () => {
    const m = store()
    const r = await fetchSoilGrids(4.47, 101.38, { fetchImpl: okFetch(cameron) })
    expect(r).toMatchObject({ ok: false, reason: 'no-data' })
    expect(m.size).toBe(1)
  })

  it('reports HTTP errors without throwing', async () => {
    store()
    const f = vi.fn(async () => new Response('busy', { status: 429 })) as unknown as typeof fetch
    const r = await fetchSoilGrids(1, 1, { fetchImpl: f })
    expect(r).toMatchObject({ ok: false, reason: 'http' })
    if (!r.ok) expect(r.message).toContain('429')
  })

  it('times out and says so', async () => {
    store()
    const hang = ((_: unknown, init?: RequestInit) =>
      new Promise((_res, rej) => {
        init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))
      })) as unknown as typeof fetch
    const r = await fetchSoilGrids(2, 2, { fetchImpl: hang, timeoutMs: 30 })
    expect(r).toMatchObject({ ok: false, reason: 'timeout' })
  })

  it('reports network failures and unreadable answers, and does not cache them', async () => {
    const m = store()
    const down = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    expect(await fetchSoilGrids(3, 3, { fetchImpl: down })).toMatchObject({ ok: false, reason: 'network' })
    const junk = vi.fn(async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch
    expect(await fetchSoilGrids(3, 3, { fetchImpl: junk })).toMatchObject({ ok: false, reason: 'bad-response' })
    expect(m.size).toBe(0)
  })

  it('lets the caller cancel (location changed)', async () => {
    store()
    const ctrl = new AbortController()
    const hang = ((_: unknown, init?: RequestInit) =>
      new Promise((_res, rej) => {
        init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))
      })) as unknown as typeof fetch
    const p = fetchSoilGrids(4, 4, { fetchImpl: hang, signal: ctrl.signal })
    ctrl.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('text: why / evidence / risks / gaps', () => {
  const sandyPoor = soil({ texture: 'sandy', drainage: 'poor', organicMatter: 'low' })

  it('every rule documents effect, reasoning and a source, and unsourced ones say UNVERIFIED', () => {
    expect(SOIL_RULES.length).toBeGreaterThanOrEqual(6)
    for (const r of SOIL_RULES) {
      expect(r.effect.length).toBeGreaterThan(20)
      expect(r.reasoning.length).toBeGreaterThan(20)
      expect(r.source.length).toBeGreaterThan(10)
      expect(['fao', 'partial', 'unverified']).toContain(r.status)
    }
    expect(SOIL_RULES.filter((r) => r.status === 'unverified').map((r) => r.id).sort()).toEqual(
      ['drainage-water-store', 'erosion', 'organic-matter', 'waterlogging'],
    )
    expect(EVIDENCE_LABEL.unverified).toBe('UNVERIFIED')
  })

  it('unknown soil: says no soil rule is applied and adds no why/risk lines', () => {
    expect(soilWhy(UNKNOWN_SOIL, [maize], false)).toEqual([])
    expect(soilRisks(UNKNOWN_SOIL, [{ crop: maize, name: 'x', needMetYears: 0, years: 5, ratio: 3 }], false)).toEqual([])
    expect(soilGaps(UNKNOWN_SOIL)[0]).toContain('not specified')
  })

  it('known soil: why names every rule that fired, flagged unverified where needed', () => {
    const lines = soilWhy(sandyPoor, [maize, rice], false).join(' | ')
    expect(lines).toContain('stored soil moisture')
    expect(lines).toContain('Waterlogging')
    expect(lines).toContain('Maize')
    expect(lines).not.toContain('Rice') // rice tolerates waterlogging so it is not listed as affected
    expect(lines).toContain('Organic matter')
    expect(lines).toContain('unverified')
  })

  it('irrigated farms get no stored-moisture line', () => {
    expect(soilWhy(soil({ texture: 'sandy' }), [maize], true).join(' ')).not.toContain('stored soil moisture')
  })

  it('risks: sandy soil + drought-sensitive crop + a short year; waterlogging on poor drainage; bare fallow on low-OM soil', () => {
    const slots = [
      { crop: maize, name: 'Season 1 (Maize)', needMetYears: 3, years: 5, ratio: 1.0 },
      { crop: maize, name: 'Season 2 (Maize)', needMetYears: 5, years: 5, ratio: 2.8 },
      { crop: CROP_BY_ID.fallow, name: 'Season 3 (Bare fallow)', needMetYears: 5, years: 5, ratio: 0 },
    ]
    const out = soilRisks(sandyPoor, slots, false).join('\n')
    expect(out).toContain('sandy soil holds little water')
    expect(out).toContain('rain fell short of its need in 2 of 5 years')
    expect(out).toContain('tolerates waterlogging poorly')
    expect(out).toContain('2.8×')
    expect(out).toContain('bare fallow')
    // irrigating removes the drought risk line only
    expect(soilRisks(sandyPoor, slots, true).join('\n')).not.toContain('sandy soil holds little water')
  })

  it('gaps: say what is unverified, and flag SoilGrids as non-NASA beta when used', () => {
    const manual = soilGaps(sandyPoor).join(' ')
    expect(manual).toContain('NO published source')
    expect(manual).toContain('unverified')
    expect(manual).toContain('your manual choice')
    const grids = soilGaps(sandyPoor, true).join(' ')
    expect(grids).toContain('SoilGrids')
    expect(grids).toContain('non-NASA beta')
  })

  it('explain() puts soil into evidence, why, risks and gaps on real data', () => {
    const t = buildSlotTable(series, NO_CLIMATE_CHANGE, 1, { mode: 'seasons', irrigated: false, soil: sandyPoor })
    const st = buildStrategies([CROP_BY_ID.rice, CROP_BY_ID.maize, CROP_BY_ID.fallow], t, W)
    const ex = explain(st[0], st[0].result, t, null, false, true)
    expect(ex.evidence[0]).toContain('Soil you entered: sandy, poorly drained, low organic matter')
    expect(ex.evidence[0]).toContain('SoilGrids')
    expect(ex.why.join(' ')).toContain('Your soil')
    expect(ex.risks.join(' ')).toContain('bare fallow')
    expect(ex.gaps.join(' ')).toContain('NO published source')
    expect(ex.gaps.join(' ')).not.toContain('are not used. Add a local soil test')

    const t0 = buildSlotTable(series, NO_CLIMATE_CHANGE, 1)
    const st0 = buildStrategies([CROP_BY_ID.rice, CROP_BY_ID.maize, CROP_BY_ID.fallow], t0, W)
    const ex0 = explain(st0[0], st0[0].result, t0)
    expect(ex0.evidence[0]).not.toContain('Soil you entered')
    expect(ex0.gaps[0]).toContain('not specified')
  })
})
