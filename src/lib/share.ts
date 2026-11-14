import { CROP_BY_ID } from '../data/crops'
import { CUSTOM_PRESET_ID, PRESETS } from '../data/presets'
import type { Inputs } from '../state'

/**
 * A share link carries only what a person typed or picked about the farm: location, rotation style, the three
 * current crops, irrigation, field elevation and start month. It does NOT carry soil entries or priority sliders,
 * and it holds no data: the receiver's browser downloads the NASA data again.
 */
export function encodeShare(i: Inputs): string {
  const q = new URLSearchParams()
  q.set('p', i.presetId)
  if (i.presetId === CUSTOM_PRESET_ID) {
    q.set('lat', String(i.lat))
    q.set('lon', String(i.lon))
  }
  q.set('mode', i.mode)
  q.set('irr', i.irrigated ? '1' : '0')
  if (i.elevationM !== null) q.set('el', String(i.elevationM))
  q.set('cur', i.current.join(','))
  q.set('start', String(i.startMonth))
  return q.toString()
}

export type SharedPatch = Partial<Pick<Inputs, 'presetId' | 'lat' | 'lon' | 'mode' | 'irrigated' | 'elevationM' | 'current' | 'startMonth'>>

/** Reads a share link's query string. Returns null unless it names a valid location; ignores any field that does not validate. */
export function decodeShare(search: string): SharedPatch | null {
  const q = new URLSearchParams(search)
  const p = q.get('p')
  if (!p) return null
  const out: SharedPatch = {}
  if (p === CUSTOM_PRESET_ID) {
    const lat = Number(q.get('lat'))
    const lon = Number(q.get('lon'))
    if (q.get('lat') === null || q.get('lon') === null) return null
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
    out.presetId = CUSTOM_PRESET_ID
    out.lat = lat
    out.lon = lon
  } else if (PRESETS.some((x) => x.id === p)) {
    out.presetId = p
  } else return null

  const mode = q.get('mode')
  if (mode === 'seasons' || mode === 'years') out.mode = mode
  const irr = q.get('irr')
  if (irr === '1' || irr === '0') out.irrigated = irr === '1'
  const el = q.get('el')
  if (el !== null && el !== '' && Number.isFinite(Number(el)) && Number(el) >= -500 && Number(el) <= 9000) out.elevationM = Number(el)
  const cur = (q.get('cur') ?? '').split(',')
  if (cur.length === 3 && cur.every((c) => c in CROP_BY_ID)) out.current = cur as [string, string, string]
  const start = q.get('start')
  if (start === 'auto') out.startMonth = 'auto'
  else if (start !== null && /^\d+$/.test(start) && Number(start) >= 1 && Number(start) <= 12) out.startMonth = Number(start)
  return out
}
