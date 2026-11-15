// ISRIC SoilGrids v2.0 REST client. NOT a NASA source, and ISRIC labels the service beta.
// Docs: https://rest.isric.org/soilgrids/v2.0/docs   (no key, CORS open)
//
// Tested 14 Nov 2026 with scripts/probe-soilgrids.mjs, 4 rounds x 3 points: every request answered
// HTTP 200 in 2-11 s with identical values each round. Cameron Highlands (4.47, 101.38) returns
// null for every layer (no modelled value at that pixel, while 4.50,101.40 and 4.47,101.45 have data),
// so "no data here" is a normal outcome and is handled, not an error.
// SoilGrids is a 250 m machine-learning MODEL, not a measurement of the field.
import { profileFromSoilGrids } from './soil'
import type { SoilGridsReading } from './soil'
import type { SoilProfile } from './soil'

export const SOILGRIDS_TIMEOUT_MS = 20000
const BASE = 'https://rest.isric.org/soilgrids/v2.0/properties/query'
const CACHE_PREFIX = 'soilgrids:v1:'
/** Layer thicknesses (cm) used to average 0-5, 5-15, 15-30 cm into one 0-30 cm value. */
const DEPTH_CM: Record<string, number> = { '0-5cm': 5, '5-15cm': 10, '15-30cm': 15 }

interface SgLayer {
  name: string
  unit_measure?: { d_factor?: number }
  depths: { label: string; values: { mean: number | null } }[]
}
export interface SoilGridsResponse {
  properties?: { layers?: SgLayer[] }
}

export function soilGridsUrl(lat: number, lon: number): string {
  const q = new URLSearchParams({ lon: lon.toFixed(4), lat: lat.toFixed(4) })
  for (const p of ['clay', 'sand', 'silt', 'soc']) q.append('property', p)
  for (const d of Object.keys(DEPTH_CM)) q.append('depth', d)
  q.set('value', 'mean')
  return `${BASE}?${q.toString()}`
}

/** Thickness-weighted 0-30 cm mean of one layer in display units (mapped value / d_factor), or null if any depth is empty. */
function layerMean(layers: SgLayer[], name: string): number | null {
  const l = layers.find((x) => x.name === name)
  if (!l) return null
  const f = l.unit_measure?.d_factor || 1
  let sum = 0
  let w = 0
  for (const d of l.depths) {
    const t = DEPTH_CM[d.label]
    const v = d.values.mean
    if (t === undefined || v === null || typeof v !== 'number' || !Number.isFinite(v)) return null
    sum += (v / f) * t
    w += t
  }
  return w === 30 ? sum / w : null
}

/** Convert a SoilGrids response to clay/sand/silt % and organic carbon g/kg, or null when there is no data. */
export function parseSoilGrids(json: SoilGridsResponse): SoilGridsReading | null {
  const layers = json.properties?.layers
  if (!layers) return null
  const clay = layerMean(layers, 'clay')
  const sand = layerMean(layers, 'sand')
  const silt = layerMean(layers, 'silt')
  const soc = layerMean(layers, 'soc')
  if (clay === null || sand === null || silt === null || soc === null) return null
  return { clayPct: clay, sandPct: sand, siltPct: silt, socGperKg: soc }
}

export type SoilGridsResult =
  | { ok: true; reading: SoilGridsReading; profile: SoilProfile; fromCache: boolean }
  | { ok: false; reason: 'no-data' | 'timeout' | 'network' | 'http' | 'bad-response'; message: string }

export interface FetchOptions {
  /** The farmer's own drainage choice is kept (SoilGrids has none). */
  keepDrainage?: SoilProfile['drainage']
  signal?: AbortSignal
  fetchImpl?: typeof fetch
  timeoutMs?: number
  /** Pause before each retry of a short outage (502/503/504 or no connection). Its length is the number of retries. */
  retryDelaysMs?: number[]
}

export const SOILGRIDS_RETRY_DELAYS_MS = [1500, 3000]

/** Waits, or rejects with the caller's abort reason if they cancel while waiting. */
function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(signal.reason ?? new DOMException('aborted', 'AbortError'))
    }, { once: true })
  })
}

export async function fetchSoilGrids(lat: number, lon: number, opts: FetchOptions = {}): Promise<SoilGridsResult> {
  const { keepDrainage = 'unknown', signal, fetchImpl = fetch, timeoutMs = SOILGRIDS_TIMEOUT_MS, retryDelaysMs = SOILGRIDS_RETRY_DELAYS_MS } = opts
  const url = soilGridsUrl(lat, lon)
  const key = CACHE_PREFIX + url
  const done = (json: SoilGridsResponse, fromCache: boolean): SoilGridsResult => {
    const reading = parseSoilGrids(json)
    if (!reading)
      return {
        ok: false,
        reason: 'no-data',
        message: 'SoilGrids has no modelled value at this exact point (it can be missing for some pixels). Choose the soil by hand.',
      }
    return { ok: true, reading, profile: profileFromSoilGrids(reading, keepDrainage), fromCache }
  }
  try {
    const hit = localStorage.getItem(key)
    if (hit) return done(JSON.parse(hit) as SoilGridsResponse, true)
  } catch {
    /* storage unavailable or corrupt: fall through to network */
  }
  // The service often answers 502/503/504 for a few seconds and then works (seen 15 Nov 2026: 503, then 200).
  // So a short outage is retried, at most twice and with a pause, because ISRIC documents a low rate limit.
  // Never retried: 429 (we are being asked to slow down), other HTTP errors, and a timeout (already 20 s).
  let text = ''
  for (let attempt = 0; ; attempt++) {
    const canRetry = attempt < retryDelaysMs.length
    const timeout = AbortSignal.timeout(timeoutMs)
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
    let failure: SoilGridsResult
    try {
      const res = await fetchImpl(url, { signal: combined })
      if (res.ok) {
        text = await res.text()
        break
      }
      failure = { ok: false, reason: 'http', message: `SoilGrids answered HTTP ${res.status}${res.status === 429 ? ' (too many requests, wait a minute)' : ''}. Choose the soil by hand${res.status === 429 ? '' : ' or try again in a minute'}.` }
      if (!(res.status === 502 || res.status === 503 || res.status === 504)) return failure
    } catch (e) {
      if (signal?.aborted) throw e
      if (timeout.aborted)
        return { ok: false, reason: 'timeout', message: `SoilGrids did not answer within ${timeoutMs / 1000} s. Choose the soil by hand or try again.` }
      failure = { ok: false, reason: 'network', message: 'Could not reach SoilGrids. Choose the soil by hand or try again.' }
    }
    if (!canRetry) return failure
    await pause(retryDelaysMs[attempt], signal)
  }
  let json: SoilGridsResponse
  try {
    json = JSON.parse(text) as SoilGridsResponse
  } catch {
    return { ok: false, reason: 'bad-response', message: 'SoilGrids sent an answer the app could not read. Choose the soil by hand.' }
  }
  const out = done(json, false)
  // Cache real answers only, including "no data" (it is a stable property of the pixel).
  try {
    localStorage.setItem(key, text)
  } catch {
    /* quota exceeded: ignore */
  }
  return out
}
