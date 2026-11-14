// Finding a place by name, or reading pasted coordinates. No API key.
//
// Place names come from the Open-Meteo Geocoding API (https://open-meteo.com/en/docs/geocoding-api), which serves GeoNames data (CC BY 4.0).
// It is free for non-commercial use (under 10,000 calls a day), allows calls from the browser, and covers villages, towns, districts,
// mountains and airports. It does NOT find street addresses; the page says so. A search is sent only when the person presses Search
// (never as they type), and results are rounded to about 1 km before use, because the NASA climate cells are about 50 km wide anyway.

export interface Place {
  id: string
  name: string
  /** Region and country, for telling apart places with the same name. */
  detail: string
  lat: number
  lon: number
  /** A plain-words type such as "town" or "mountain". */
  kind: string
}

export type GeocodeErrorCode = 'too_short' | 'network' | 'busy' | 'unavailable'

export class GeocodeError extends Error {
  code: GeocodeErrorCode
  constructor(code: GeocodeErrorCode, message: string) {
    super(message)
    this.name = 'GeocodeError'
    this.code = code
  }
}

export const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search'

/** About 1 km. Enough for a climate cell of about 50 km, and it avoids sending anyone's exact spot to NASA. */
export const roundCoord = (n: number): number => Math.round(n * 100) / 100

const inRange = (lat: number, lon: number) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180

const KINDS: Record<string, string> = {
  PPLC: 'capital city',
  PPLA: 'city',
  PPLA2: 'town',
  PPLA3: 'town',
  PPLA4: 'town',
  PPL: 'village or town',
  PPLL: 'village',
  PPLX: 'neighbourhood',
  ADM1: 'state or region',
  ADM2: 'district',
  ADM3: 'district',
  MT: 'mountain',
  MTS: 'mountains',
  AIRP: 'airport',
  LK: 'lake',
  ISL: 'island',
}

/**
 * Reads "6.12, 100.36", "6.12 N 100.36 E", "-1.29;36.82" or a map link containing "@6.12,100.36". Latitude comes first.
 * Returns null for anything else, including numbers outside the valid ranges.
 */
export function parseCoordinates(input: string): { lat: number; lon: number } | null {
  const q = input.trim()
  const at = q.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  if (at) {
    const lat = Number(at[1])
    const lon = Number(at[2])
    return inRange(lat, lon) ? { lat, lon } : null
  }
  const m = q.match(/^(-?\d+(?:\.\d+)?)\s*°?\s*([NSns])?\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*°?\s*([EWew])?$/)
  if (!m) return null
  let lat = Number(m[1])
  let lon = Number(m[3])
  if (m[2] && m[2].toUpperCase() === 'S') lat = -Math.abs(lat)
  if (m[4] && m[4].toUpperCase() === 'W') lon = -Math.abs(lon)
  return inRange(lat, lon) ? { lat, lon } : null
}

interface RawResult {
  id?: unknown
  name?: unknown
  latitude?: unknown
  longitude?: unknown
  feature_code?: unknown
  country?: unknown
  admin1?: unknown
  admin2?: unknown
}

/** Looks a place name up. Anything in the answer that is not a valid, in-range place is dropped. */
export async function searchPlaces(query: string, signal?: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<Place[]> {
  const q = query.trim().slice(0, 100)
  if (q.length < 2) throw new GeocodeError('too_short', 'Type at least two letters.')
  const url = `${GEOCODE_URL}?${new URLSearchParams({ name: q, count: '6', language: 'en', format: 'json' })}`
  let res: Response
  try {
    res = await fetchImpl(url, { signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new GeocodeError('network', 'Could not reach the place search.')
  }
  if (res.status === 429) throw new GeocodeError('busy', 'The place search is busy.')
  if (!res.ok) throw new GeocodeError('unavailable', 'The place search is not available right now.')
  let body: unknown
  try {
    body = await res.json()
  } catch {
    throw new GeocodeError('unavailable', 'The place search sent an unreadable answer.')
  }
  const list = typeof body === 'object' && body !== null && Array.isArray((body as { results?: unknown }).results) ? ((body as { results: RawResult[] }).results) : []
  const out: Place[] = []
  for (const r of list) {
    if (typeof r !== 'object' || r === null) continue
    const lat = typeof r.latitude === 'number' ? r.latitude : NaN
    const lon = typeof r.longitude === 'number' ? r.longitude : NaN
    if (typeof r.name !== 'string' || r.name.trim() === '' || !inRange(lat, lon)) continue
    const detail = [r.admin2, r.admin1, r.country].filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    out.push({
      id: typeof r.id === 'number' ? String(r.id) : `${lat},${lon}`,
      name: r.name.trim().slice(0, 80),
      detail: Array.from(new Set(detail)).join(', ').slice(0, 120),
      lat,
      lon,
      kind: KINDS[String(r.feature_code)] ?? 'place',
    })
    if (out.length >= 6) break
  }
  return out
}

/** The label shown once a place has been chosen. */
export function placeLabel(p: Place): string {
  return p.detail ? `${p.name}, ${p.detail}` : p.name
}
