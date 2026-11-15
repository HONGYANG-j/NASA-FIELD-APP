// "Save my farm on this device": the setup is kept in this browser's own storage and nowhere else.
// Whatever is read back is validated again (the same whitelist the AI assistant's proposals go through), so a damaged or
// edited entry can never put an invalid value into the form.
import { CUSTOM_PRESET_ID, PRESETS } from '../data/presets'
import type { Inputs } from '../state'
import { applyPatch, cleanText, sanitizePatch } from './assistSchema'

const KEY = 'pvc:farm:v1'

export interface SavedFarm {
  /** The label shown for the place (a preset name, a searched place name, or "Custom point lat, lon"). */
  label: string
  presetId: string
  lat: number
  lon: number
  /** Everything else, in the form of a validated patch. */
  patch: ReturnType<typeof sanitizePatch>
}

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function toSaved(i: Inputs, label: string): SavedFarm {
  return {
    label: cleanText(label, 120),
    presetId: i.presetId,
    lat: i.lat,
    lon: i.lon,
    patch: sanitizePatch({
      mode: i.mode, irrigated: i.irrigated, elevationM: i.elevationM, current: i.current, allowed: i.allowed,
      weights: i.weights, startMonth: i.startMonth, soil: i.soil, scenario: i.scenario,
    }),
  }
}

/** Parses and validates a stored entry. Returns null for anything that is not a complete, valid farm. */
export function parseSaved(text: string | null): SavedFarm | null {
  if (!text) return null
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const label = cleanText(r.label, 120)
  if (!label || typeof r.presetId !== 'string') return null
  const preset = PRESETS.find((p) => p.id === r.presetId)
  if (preset) return { label: preset.name, presetId: preset.id, lat: preset.lat, lon: preset.lon, patch: sanitizePatch(r.patch) }
  if (r.presetId !== CUSTOM_PRESET_ID) return null
  const lat = typeof r.lat === 'number' ? r.lat : NaN
  const lon = typeof r.lon === 'number' ? r.lon : NaN
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { label, presetId: CUSTOM_PRESET_ID, lat, lon, patch: sanitizePatch(r.patch) }
}

export function loadSaved(): SavedFarm | null {
  try {
    return parseSaved(storage()?.getItem(KEY) ?? null)
  } catch {
    return null
  }
}

export function saveFarm(i: Inputs, label: string): void {
  try {
    storage()?.setItem(KEY, JSON.stringify(toSaved(i, label)))
  } catch {
    /* storage full or blocked: saving is a convenience, never an error */
  }
}

export function forgetFarm(): void {
  try {
    storage()?.removeItem(KEY)
  } catch {
    /* nothing to do */
  }
}

/** The form values for a saved farm, built on top of `base` (the defaults for that place). */
export function inputsFromSaved(base: Inputs, s: SavedFarm): Inputs {
  return applyPatch({ ...base, presetId: s.presetId, lat: s.lat, lon: s.lon }, s.patch)
}
