// MODIS vegetation (NDVI) evidence.
//
// Data: MOD13Q1 (MODIS/Terra Vegetation Indices, 16-day, 250 m) fetched once from the public
// ORNL DAAC MODIS web service by scripts/fetch-ndvi.mjs and bundled in src/data/ndvi/.
// The live service takes 20-60 s per request (10 dates max) and sometimes returns 502, so it
// cannot be called live in a demo. Locations without a bundled file simply have no satellite layer.
//
// NDVI is a measure of green vegetation: values of about 0.1 or less mean barren ground, 0.2-0.3
// shrub/grass, 0.6-0.8 dense forest (NASA Earth Observatory, "Measuring Vegetation").
// The thresholds below are rough rules of thumb based on that guidance, not agronomic limits.
import { mean } from './climate'

export interface NdviFile {
  id: string
  source: string
  service: string
  band: string
  latitude: number
  longitude: number
  pixelMetres: number | null
  years: [number, number]
  fetched: string
  /** MODIS land-cover class at this pixel (MCD12Q1 LC_Type1, IGBP scheme), so we know what the NDVI describes. */
  landCover?: { igbpClass: number; label: string; year: number; source: string }
  /** [calendar date YYYY-MM-DD, NDVI or null when the composite is missing/fill]. */
  points: [string, number | null][]
}

/** Below this the pixel is mostly bare or sparsely vegetated. */
export const SPARSE_NDVI = 0.3
/** At or above this the pixel is densely green. */
export const DENSE_NDVI = 0.6

export type Greenness = 'sparse' | 'moderate' | 'dense'

export function greenness(v: number): Greenness {
  if (v < SPARSE_NDVI) return 'sparse'
  if (v >= DENSE_NDVI) return 'dense'
  return 'moderate'
}

const files = import.meta.glob<NdviFile>('../data/ndvi/*.json', { import: 'default' })

/** Bundled NDVI for a preset id, or null when none was fetched for that location. */
export async function loadBundledNdvi(id: string): Promise<NdviFile | null> {
  const load = files[`../data/ndvi/${id}.json`]
  return load ? await load() : null
}

export interface Obs {
  year: number
  month: number
  v: number
}

export function observations(f: NdviFile): Obs[] {
  const out: Obs[] = []
  for (const [d, v] of f.points) {
    if (v === null || !Number.isFinite(v)) continue
    out.push({ year: Number(d.slice(0, 4)), month: Number(d.slice(5, 7)), v })
  }
  return out
}

export interface MonthNdvi {
  month: number
  mean: number
  min: number
  max: number
  n: number
}

/** Average NDVI for each calendar month across all bundled years. */
export function monthlyNdvi(f: NdviFile): MonthNdvi[] {
  const obs = observations(f)
  return Array.from({ length: 12 }, (_, i) => {
    const vs = obs.filter((o) => o.month === i + 1).map((o) => o.v)
    return {
      month: i + 1,
      mean: mean(vs),
      min: vs.length ? Math.min(...vs) : NaN,
      max: vs.length ? Math.max(...vs) : NaN,
      n: vs.length,
    }
  })
}

export interface SlotNdvi {
  mean: number
  min: number
  max: number
  /** Share of composites below SPARSE_NDVI. */
  sparseShare: number
  /** Seasons (years) with enough clear composites to count. */
  years: number
  /** Mean NDVI of each counted season-year. */
  perYear: number[]
  /** Counted season-years whose greenness fell below 85% of the multi-year average. */
  lowYears: number
}

/** Satellite greenness of a window of months, grouped into season-years like slotYears(). */
export function slotNdvi(f: NdviFile, startMonth: number, lengthMonths: number): SlotNdvi | null {
  const groups = new Map<number, number[]>()
  for (const o of observations(f)) {
    const offset = (o.month - startMonth + 12) % 12
    if (offset >= lengthMonths) continue
    const seasonYear = o.month < startMonth ? o.year - 1 : o.year
    const g = groups.get(seasonYear)
    if (g) g.push(o.v)
    else groups.set(seasonYear, [o.v])
  }
  // A 16-day composite series has ~1.9 composites per month; need most of them to count a season.
  const needed = Math.floor(lengthMonths * 1.9 * 0.75)
  const complete = [...groups.entries()]
    .filter(([, vs]) => vs.length >= needed)
    .sort((a, b) => a[0] - b[0])
  if (!complete.length) return null
  const all = complete.flatMap(([, vs]) => vs)
  const perYear = complete.map(([, vs]) => mean(vs))
  const overall = mean(perYear)
  return {
    mean: mean(all),
    min: Math.min(...all),
    max: Math.max(...all),
    sparseShare: all.filter((v) => v < SPARSE_NDVI).length / all.length,
    years: complete.length,
    perYear,
    lowYears: perYear.filter((m) => m < overall * 0.85).length,
  }
}

// ---------------------------------------------------------------------------------------------
// Landsat NDVI (30 m) and NASADEM elevation/slope, both from Microsoft Planetary Computer.
//
// Fetched once by scripts/fetch-landsat.mjs and bundled in src/data/landsat/ and src/data/elevation/;
// the app never calls Planetary Computer. Like the MODIS layer this is evidence only: it is not used to
// score rotations. Only bundled demo locations have it (Landsat: Kedah and Iowa; elevation: all three).
// ---------------------------------------------------------------------------------------------

export interface LandsatFile {
  id: string
  source: string
  service: string
  formula: string
  pixelMetres: number
  latitude: number
  longitude: number
  /** The preset coordinate, and how far the chosen cropland pixel is from it. */
  requested: { latitude: number; longitude: number; offsetMetres: number }
  landCover: {
    source: string
    atRequestedPoint: { wc2021: string | null; wc2020: string | null }
    atPixel: string
  }
  years: [number, number]
  fetched: string
  maskRule: string
  observations: {
    scenesSearched: number
    noData: number
    cloudOrShadowMasked: number
    outOfRange: number
    badScaling: number
    clear: number
    byPlatform: Record<string, number>
    sameDayAveraged: number
  }
  /** [calendar date YYYY-MM-DD, NDVI, Landsat platform(s)], clear observations only. */
  points: [string, number, string][]
}

export interface ElevationFile {
  id: string
  source: string
  service: string
  item: string
  latitude: number
  longitude: number
  landCoverAtPoint: { source: string; wc2021: string | null; wc2020: string | null }
  elevationM: number
  mean3x3M: number
  min3x3M: number
  max3x3M: number
  slope30mDeg: number
  slope90mDeg: number
  slopeMethod: string
  fetched: string
}

const landsatFiles = import.meta.glob<LandsatFile>('../data/landsat/*.json', { import: 'default' })
const elevationFiles = import.meta.glob<ElevationFile>('../data/elevation/*.json', { import: 'default' })

/** Bundled Landsat NDVI for a preset id, or null when none was fetched (for example Cameron Highlands). */
export async function loadBundledLandsat(id: string): Promise<LandsatFile | null> {
  const load = landsatFiles[`../data/landsat/${id}.json`]
  return load ? await load() : null
}

/** Bundled NASADEM elevation and slope for a preset id, or null. */
export async function loadBundledElevation(id: string): Promise<ElevationFile | null> {
  const load = elevationFiles[`../data/elevation/${id}.json`]
  return load ? await load() : null
}

/** Clear Landsat observations per calendar year. */
export function landsatPerYear(f: LandsatFile): Record<number, number> {
  const out: Record<number, number> = {}
  for (const [d] of f.points) {
    const y = Number(d.slice(0, 4))
    out[y] = (out[y] ?? 0) + 1
  }
  return out
}

export interface Agreement {
  /** Landsat dates that fall between two MODIS composites no more than 20 days apart. */
  n: number
  /** Pearson correlation between Landsat NDVI and MODIS NDVI interpolated to the Landsat date. */
  r: number
  meanLandsat: number
  meanModis: number
}

/**
 * How closely 30 m Landsat NDVI follows the 250 m MODIS NDVI bundled for the same place. MODIS is linearly
 * interpolated between its two nearest composites. A sanity check, not a validation against ground data.
 */
export function landsatVsModis(landsat: LandsatFile, modis: NdviFile): Agreement | null {
  const m: [number, number][] = []
  for (const [d, v] of modis.points) if (v !== null && Number.isFinite(v)) m.push([Date.parse(d), v])
  m.sort((a, b) => a[0] - b[0])
  const L: number[] = []
  const M: number[] = []
  for (const [d, v] of landsat.points) {
    const t = Date.parse(d)
    for (let i = 0; i < m.length - 1; i++) {
      const [t0, v0] = m[i]
      const [t1, v1] = m[i + 1]
      if (t >= t0 && t <= t1) {
        if (t1 - t0 <= 20 * 86_400_000) {
          const f = t1 === t0 ? 0 : (t - t0) / (t1 - t0)
          L.push(v)
          M.push(v0 * (1 - f) + v1 * f)
        }
        break
      }
    }
  }
  if (L.length < 5) return null
  const ml = mean(L)
  const mm = mean(M)
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < L.length; i++) {
    sxy += (L[i] - ml) * (M[i] - mm)
    sxx += (L[i] - ml) ** 2
    syy += (M[i] - mm) ** 2
  }
  if (sxx === 0 || syy === 0) return null
  return { n: L.length, r: sxy / Math.sqrt(sxx * syy), meanLandsat: ml, meanModis: mm }
}

// ---------------------------------------------------------------------------------------------
// MODIS evapotranspiration (MOD16A2), land-surface temperature (MOD11A2), leaf area (MCD15A2H) and
// growing-season dates (MCD12Q2), from the public ORNL DAAC MODIS web service.
//
// Fetched once by scripts/fetch-modis.mjs and bundled in src/data/modis/; the app never calls the service.
// Descriptive evidence only: nothing here is used to score rotations. Only Kedah and Iowa have it.
// Scale factors, valid ranges and fill values were read from the service's /bands endpoint (14 Nov 2026) and are
// applied by the fetch script, so the bundled values are already in physical units.
// ---------------------------------------------------------------------------------------------

export type ModisKey = 'et' | 'pet' | 'lstDay' | 'lstNight' | 'lai'

export interface ModisSeries {
  product: string
  band: string
  /** QC band that was also downloaded, or null (QC bands are optional in the fetch script). */
  qcBand: string | null
  unit: string
  scale: number
  offset: number
  validRaw: [number, number]
  fillRaw: number
  years: [number, number]
  pixelMetres: number | null
  tile: string | null
  nullCount: number
  /** [calendar date (first day of the composite), value in `unit` or null when fill/invalid, raw QC integer or null]. */
  points: [string, number | null, number | null][]
}

export interface PhenologyCycle {
  greenup?: string | null
  midGreenup?: string | null
  maturity?: string | null
  senescence?: string | null
  midGreendown?: string | null
  dormancy?: string | null
  qaOverall?: number | null
}

export interface PhenologyLayer {
  layerYear: number
  layerDate: string
  numCycles: number | null
  cycles: PhenologyCycle[]
}

export interface ModisFile {
  id: string
  latitude: number
  longitude: number
  years: [number, number]
  fetched: string
  service: string
  landCover?: { source: string; byYear: [string, number, string][] }
  series: Partial<Record<ModisKey, ModisSeries>>
  phenology: { product: string; source: string; pixelMetres: number | null; fillRaw: number; layers: PhenologyLayer[] }
}

const modisFiles = import.meta.glob<ModisFile>('../data/modis/*.json', { import: 'default' })

/** Bundled MODIS ET / LST / LAI / phenology for a preset id, or null when none was fetched. */
export async function loadBundledModis(id: string): Promise<ModisFile | null> {
  const load = modisFiles[`../data/modis/${id}.json`]
  return load ? await load() : null
}

/** Spacing between composites, in days: all three are 8-day products (the ORNL service lists MCD15A2H dates 8 days apart, about 46 a year). */
const STEP: Record<ModisKey, number> = { et: 8, pet: 8, lstDay: 8, lstNight: 8, lai: 8 }
const DAY_MS = 86_400_000

function utcDay(date: string): number {
  return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)))
}

/**
 * Days an MOD16A2 / MOD11A2 composite covers: 8, except the last composite of a year, which stops on 31 December
 * (5 days in a normal year, 6 in a leap year). Needed to turn "mm per composite" into mm per day.
 */
export function compositeDays(date: string, step = 8): number {
  const y = Number(date.slice(0, 4))
  const doy = (utcDay(date) - Date.UTC(y, 0, 1)) / DAY_MS + 1
  const daysInYear = (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / DAY_MS
  return Math.min(step, daysInYear - doy + 1)
}

/** Valid observations with year and month taken from the composite's middle day. ET and PET are returned in mm per day. */
export function modisObservations(f: ModisFile, key: ModisKey): Obs[] {
  const s = f.series[key]
  if (!s) return []
  const out: Obs[] = []
  for (const [d, v] of s.points) {
    if (v === null || !Number.isFinite(v)) continue
    const days = key === 'et' || key === 'pet' ? compositeDays(d) : STEP[key]
    const mid = new Date(utcDay(d) + Math.floor(days / 2) * DAY_MS)
    out.push({
      year: mid.getUTCFullYear(),
      month: mid.getUTCMonth() + 1,
      v: key === 'et' || key === 'pet' ? v / days : v,
    })
  }
  return out
}

/**
 * Average of each calendar month across all bundled years (ET in mm/day, LST in deg C, LAI in m2/m2). A month with
 * fewer than `minN` valid composites gets NaN statistics (but keeps its count): land-surface temperature has no value
 * under cloud, so in the humid tropics some months have only a handful of clear composites, too few to average.
 */
export function monthlyModis(f: ModisFile, key: ModisKey, minN = 1): MonthNdvi[] {
  const obs = modisObservations(f, key)
  return Array.from({ length: 12 }, (_, i) => {
    const vs = obs.filter((o) => o.month === i + 1).map((o) => o.v)
    const enough = vs.length >= minN && vs.length > 0
    return {
      month: i + 1,
      mean: enough ? mean(vs) : NaN,
      min: enough ? Math.min(...vs) : NaN,
      max: enough ? Math.max(...vs) : NaN,
      n: vs.length,
    }
  })
}

/** Months with fewer clear land-surface-temperature composites than this are left blank (see monthlyModis). */
export const MIN_LST_COMPOSITES = 4

export interface SlotStat {
  mean: number
  min: number
  max: number
  /** Season-years with enough composites to count. */
  years: number
  /** Valid composites behind the mean, over all counted season-years. */
  n: number
  /** Mean of each counted season-year. */
  perYear: number[]
}

/** One variable over a window of months, grouped into season-years like slotNdvi(). Null when no season-year is complete enough. */
export function slotModis(
  f: ModisFile,
  key: ModisKey,
  startMonth: number,
  lengthMonths: number,
  /** Share of a season's composites that must be valid; low for land-surface temperature, which needs clear sky. */
  minShare = 0.75,
): SlotStat | null {
  const groups = new Map<number, number[]>()
  for (const o of modisObservations(f, key)) {
    const offset = (o.month - startMonth + 12) % 12
    if (offset >= lengthMonths) continue
    const seasonYear = o.month < startMonth ? o.year - 1 : o.year
    const g = groups.get(seasonYear)
    if (g) g.push(o.v)
    else groups.set(seasonYear, [o.v])
  }
  const needed = Math.max(1, Math.floor(((lengthMonths * 30.4) / STEP[key]) * minShare))
  const complete = [...groups.entries()].filter(([, vs]) => vs.length >= needed).sort((a, b) => a[0] - b[0])
  if (!complete.length) return null
  const all = complete.flatMap(([, vs]) => vs)
  return {
    mean: mean(all),
    min: Math.min(...all),
    max: Math.max(...all),
    years: complete.length,
    n: all.length,
    perYear: complete.map(([, vs]) => mean(vs)),
  }
}

export interface GrowingSeason {
  /** Year of the MCD12Q2 layer this cycle came from. */
  layerYear: number
  /** 1 or 2: first or second vegetation cycle in that layer. */
  cycle: number
  greenup: string
  /** Onset of greenness decrease. */
  senescence: string | null
  /** End of the greenness decrease. */
  dormancy: string | null
  /** Days from greenup to dormancy, null when either date is missing. */
  lengthDays: number | null
}

/** Cycles that have both a start (greenup) and an end (dormancy) date, in time order. */
export function growingSeasons(f: ModisFile): GrowingSeason[] {
  const out: GrowingSeason[] = []
  for (const layer of f.phenology.layers) {
    layer.cycles.forEach((c, i) => {
      if (!c.greenup) return
      const length = c.dormancy ? Math.round((utcDay(c.dormancy) - utcDay(c.greenup)) / DAY_MS) : null
      out.push({
        layerYear: layer.layerYear,
        cycle: i + 1,
        greenup: c.greenup,
        senescence: c.senescence ?? null,
        dormancy: c.dormancy ?? null,
        lengthDays: length !== null && length > 0 ? length : null,
      })
    })
  }
  return out.sort((a, b) => a.greenup.localeCompare(b.greenup))
}

export interface TypicalCycle {
  /** 1 or 2: first or second vegetation cycle of each MCD12Q2 layer. */
  cycle: number
  /** Layers in which this cycle has a greenup and a dormancy date. */
  n: number
  /** Median day of year (1-366) of greenup and of dormancy, and median days from greenup to dormancy. */
  greenupDoy: number
  dormancyDoy: number
  lengthDays: number
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function dayOfYear(date: string): number {
  return (utcDay(date) - Date.UTC(Number(date.slice(0, 4)), 0, 1)) / DAY_MS + 1
}

/**
 * Median timing of each vegetation cycle across the bundled years (medians, so one odd year does not move it).
 * Cycles are the 1st and 2nd cycle MODIS found in each yearly layer; layers with a missing date are skipped.
 */
export function typicalCycles(f: ModisFile): TypicalCycle[] {
  const out: TypicalCycle[] = []
  for (const cycle of [1, 2]) {
    const seasons = growingSeasons(f).filter((g) => g.cycle === cycle && g.dormancy !== null && g.lengthDays !== null)
    if (!seasons.length) continue
    out.push({
      cycle,
      n: seasons.length,
      greenupDoy: median(seasons.map((g) => dayOfYear(g.greenup))),
      dormancyDoy: median(seasons.map((g) => dayOfYear(g.dormancy as string))),
      lengthDays: median(seasons.map((g) => g.lengthDays as number)),
    })
  }
  return out
}

/** "15 Nov" for a day of year in a non-leap year (a label, not a date calculation). */
export function doyLabel(doy: number): string {
  const d = new Date(Date.UTC(2023, 0, Math.round(doy)))
  return `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`
}
