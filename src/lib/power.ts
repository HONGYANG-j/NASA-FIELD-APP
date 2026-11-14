// NASA POWER (Prediction Of Worldwide Energy Resources) daily point client.
// Docs: https://power.larc.nasa.gov/  (no API key needed; CORS-enabled)
import { PRESETS } from '../data/presets'
import type { DailySeries } from '../types'

const PARAMS = 'T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,GWETROOT,EVPTRNS'
/** Latent heat of vaporisation (MJ/kg): converts EVPTRNS energy flux to mm of water. */
const LATENT_HEAT = 2.45

export function powerUrl(
  lat: number,
  lon: number,
  startYear: number,
  endYear: number,
): string {
  const q = new URLSearchParams({
    parameters: PARAMS,
    community: 'AG',
    longitude: lon.toFixed(4),
    latitude: lat.toFixed(4),
    start: `${startYear}0101`,
    end: `${endYear}1231`,
    format: 'JSON',
  })
  return `https://power.larc.nasa.gov/api/temporal/daily/point?${q.toString()}`
}

type PowerParam = Record<string, number>
export interface PowerResponse {
  properties: { parameter: Record<string, PowerParam> }
  header?: { fill_value?: number }
  /** GeoJSON point: [longitude, latitude, elevation of the model grid cell in metres]. */
  geometry?: { coordinates?: number[] }
}

/** Elevation (m) of the MERRA-2 grid cell POWER used, which can differ a lot from the field. */
export function gridElevation(json: PowerResponse): number | null {
  const z = json.geometry?.coordinates?.[2]
  return typeof z === 'number' && Number.isFinite(z) ? z : null
}

/** Convert a raw POWER response into aligned arrays. Fill values (-999) become NaN. */
export function parsePower(json: PowerResponse): DailySeries {
  const p = json.properties.parameter
  const fill = json.header?.fill_value ?? -999
  const t2m = p.T2M
  if (!t2m) throw new Error('POWER response has no T2M data')
  const dates = Object.keys(t2m).sort()
  const val = (name: string, d: string): number => {
    const v = p[name]?.[d]
    return v === undefined || v === fill || v <= -990 ? NaN : v
  }
  const out: DailySeries = {
    year: [],
    month: [],
    tmean: [],
    tmax: [],
    tmin: [],
    precip: [],
    rootWet: [],
    etMm: [],
    // GeoJSON point: [longitude, latitude, elevation]. Latitude drives the evapotranspiration estimate.
    latitude: json.geometry?.coordinates?.[1],
  }
  for (const d of dates) {
    out.year.push(Number(d.slice(0, 4)))
    out.month.push(Number(d.slice(4, 6)))
    out.tmean.push(val('T2M', d))
    out.tmax.push(val('T2M_MAX', d))
    out.tmin.push(val('T2M_MIN', d))
    out.precip.push(val('PRECTOTCORR', d))
    out.rootWet.push(val('GWETROOT', d))
    out.etMm.push(val('EVPTRNS', d) / LATENT_HEAT)
  }
  return out
}

/** A bundled copy of one POWER response (see scripts/fetch-power.mjs). */
export interface PowerSnapshot {
  id: string
  fetched: string
  latitude?: number
  longitude?: number
  gridElevationM: number | null
  requested: { lat: number; lon: number }
  years: [number, number]
  fill: number
  days: number
  series: Record<string, number[]>
}

const snapshotFiles = import.meta.glob<PowerSnapshot>('../data/power/*.json', { import: 'default' })

/** Rebuilds the POWER response shape from a snapshot so the same parser handles live and bundled data. */
export function snapshotToResponse(s: PowerSnapshot): PowerResponse {
  const parameter: Record<string, PowerParam> = {}
  const start = Date.UTC(s.years[0], 0, 1)
  const keys: string[] = []
  for (let i = 0; i < s.days; i++) {
    const d = new Date(start + i * 86_400_000)
    keys.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`)
  }
  for (const [name, values] of Object.entries(s.series)) {
    const m: PowerParam = {}
    for (let i = 0; i < keys.length; i++) m[keys[i]] = values[i]
    parameter[name] = m
  }
  return {
    properties: { parameter },
    header: { fill_value: s.fill },
    geometry: { coordinates: [s.longitude ?? s.requested.lon, s.latitude ?? s.requested.lat, ...(s.gridElevationM !== null ? [s.gridElevationM] : [])] },
  }
}

/** The bundled snapshot for a demo site's exact coordinates and period, or null (then the live API is used). */
export async function loadSnapshot(lat: number, lon: number, startYear: number, endYear: number): Promise<PowerSnapshot | null> {
  const preset = PRESETS.find((p) => p.lat === lat && p.lon === lon)
  const load = preset ? snapshotFiles[`../data/power/${preset.id}.json`] : undefined
  if (!load) return null
  const s = await load()
  return s.years[0] === startYear && s.years[1] === endYear ? s : null
}

const CACHE_PREFIX = 'power:v1:'

/** Load daily data: bundled snapshot for the demo sites, else a localStorage copy, else the live NASA POWER API. */
export async function loadDaily(
  lat: number,
  lon: number,
  startYear: number,
  endYear: number,
  signal?: AbortSignal,
): Promise<{
  series: DailySeries
  gridElevationM: number | null
  fromCache: boolean
  /** Download date of the bundled snapshot, or null when the data came from the live API or this device's saved copy. */
  snapshotDate: string | null
  url: string
}> {
  const url = powerUrl(lat, lon, startYear, endYear)
  const snap = await loadSnapshot(lat, lon, startYear, endYear)
  if (snap) {
    const json = snapshotToResponse(snap)
    return { series: parsePower(json), gridElevationM: gridElevation(json), fromCache: false, snapshotDate: snap.fetched, url }
  }
  const key = CACHE_PREFIX + url
  try {
    const hit = localStorage.getItem(key)
    if (hit) {
      const json = JSON.parse(hit) as PowerResponse
      return { series: parsePower(json), gridElevationM: gridElevation(json), fromCache: true, snapshotDate: null, url }
    }
  } catch {
    /* storage unavailable: fall through to network */
  }
  // NASA POWER sometimes resets connections when it is busy or rate limiting, so retry a few times.
  let text = ''
  let lastError = 'Could not reach NASA POWER.'
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt))
    try {
      const res = await fetch(url, { signal })
      if (res.ok) {
        text = await res.text()
        break
      }
      lastError = `NASA POWER returned HTTP ${res.status}.`
      if (res.status >= 400 && res.status < 500 && res.status !== 429) break
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e
      lastError = 'Network problem reaching NASA POWER.'
    }
  }
  if (!text) throw new Error(`${lastError} Please try again in a moment.`)
  const json = JSON.parse(text) as PowerResponse
  const series = parsePower(json)
  try {
    localStorage.setItem(key, text)
  } catch {
    /* quota exceeded: ignore */
  }
  return { series, gridElevationM: gridElevation(json), fromCache: false, snapshotDate: null, url }
}
