// NASA POWER (Prediction Of Worldwide Energy Resources) daily point client.
// Docs: https://power.larc.nasa.gov/  (no API key needed; CORS-enabled)
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
interface PowerResponse {
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

const CACHE_PREFIX = 'power:v1:'

/** Load daily data, with a localStorage cache so the demo still works offline/rate-limited. */
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
  url: string
}> {
  const url = powerUrl(lat, lon, startYear, endYear)
  const key = CACHE_PREFIX + url
  try {
    const hit = localStorage.getItem(key)
    if (hit) {
      const json = JSON.parse(hit) as PowerResponse
      return { series: parsePower(json), gridElevationM: gridElevation(json), fromCache: true, url }
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
  return { series, gridElevationM: gridElevation(json), fromCache: false, url }
}
