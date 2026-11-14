// What the AI assistant is allowed to change, and the checks that run on BOTH sides (the Worker and the browser).
// The model never sees or sets scores. It can only propose values for the same form fields a person can fill in by hand,
// and every value is checked against this whitelist before it is shown, let alone applied.
import { CROP_BY_ID, CROPS } from '../data/crops'
import type { Inputs } from '../state'
import type { Drainage, OrganicMatter, Texture } from '../data/soils'
import type { RotationMode } from './rotation'

export interface AssistPatch {
  mode?: RotationMode
  irrigated?: boolean
  elevationM?: number | null
  current?: [string, string, string]
  allowed?: string[]
  weights?: { water?: number; soil?: number; income?: number; resilience?: number }
  startMonth?: 'auto' | number
  soil?: { texture?: Texture; drainage?: Drainage; organicMatter?: OrganicMatter }
  scenario?: { dTemp?: number; rainPct?: number }
}

/** A small, non-personal summary of the current form, sent so the assistant knows what is already filled in. */
export interface AssistState {
  place: string
  mode: RotationMode
  irrigated: boolean
  elevationM: number | null
  current: string[]
  allowed: string[]
  weights: { water: number; soil: number; income: number; resilience: number }
  soil: { texture: Texture; drainage: Drainage; organicMatter: OrganicMatter }
  startMonth: 'auto' | number
}

export interface AssistMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AssistReply {
  reply: string
  patch: AssistPatch
  ready: boolean
}

export const MAX_MESSAGES = 14
export const MAX_MESSAGE_CHARS = 1200

const TEXTURES: Texture[] = ['unknown', 'sandy', 'loam', 'clay']
const DRAINAGES: Drainage[] = ['unknown', 'poor', 'moderate', 'good']
const ORGANICS: OrganicMatter[] = ['unknown', 'low', 'medium', 'high']

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null)
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** Plain text only: control characters removed, length capped. */
export function cleanText(x: unknown, max: number): string {
  if (typeof x !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  return x.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max)
}

function oneOf<T extends string>(x: unknown, allowed: readonly T[]): T | undefined {
  return typeof x === 'string' && (allowed as readonly string[]).includes(x) ? (x as T) : undefined
}

/** Keeps only valid, in-range values. Anything else is dropped, never repaired by guessing. */
export function sanitizePatch(raw: unknown): AssistPatch {
  const out: AssistPatch = {}
  if (!isObj(raw)) return out

  const mode = oneOf(raw.mode, ['seasons', 'years'] as const)
  if (mode) out.mode = mode
  if (typeof raw.irrigated === 'boolean') out.irrigated = raw.irrigated

  if (raw.elevationM === null) out.elevationM = null
  else {
    const e = num(raw.elevationM)
    if (e !== null && e >= -100 && e <= 6000) out.elevationM = Math.round(e)
  }

  if (Array.isArray(raw.current) && raw.current.length === 3 && raw.current.every((c) => typeof c === 'string' && c in CROP_BY_ID)) {
    out.current = raw.current as [string, string, string]
  }
  if (Array.isArray(raw.allowed)) {
    const ids = Array.from(new Set(raw.allowed.filter((c): c is string => typeof c === 'string' && c in CROP_BY_ID)))
    if (ids.length > 0) out.allowed = ids
  }

  if (isObj(raw.weights)) {
    const w: NonNullable<AssistPatch['weights']> = {}
    for (const k of ['water', 'soil', 'income', 'resilience'] as const) {
      const v = num(raw.weights[k])
      if (v !== null) w[k] = clamp(Math.round(v), 0, 5)
    }
    if (Object.keys(w).length) out.weights = w
  }

  if (raw.startMonth === 'auto') out.startMonth = 'auto'
  else {
    const m = num(raw.startMonth)
    if (m !== null && Number.isInteger(m) && m >= 1 && m <= 12) out.startMonth = m
  }

  if (isObj(raw.soil)) {
    const s: NonNullable<AssistPatch['soil']> = {}
    const t = oneOf(raw.soil.texture, TEXTURES)
    const d = oneOf(raw.soil.drainage, DRAINAGES)
    const o = oneOf(raw.soil.organicMatter, ORGANICS)
    if (t) s.texture = t
    if (d) s.drainage = d
    if (o) s.organicMatter = o
    if (Object.keys(s).length) out.soil = s
  }

  if (isObj(raw.scenario)) {
    const s: NonNullable<AssistPatch['scenario']> = {}
    const t = num(raw.scenario.dTemp)
    const r = num(raw.scenario.rainPct)
    if (t !== null) s.dTemp = clamp(Math.round(t * 2) / 2, -2, 4)
    if (r !== null) s.rainPct = clamp(Math.round(r / 5) * 5, -40, 40)
    if (Object.keys(s).length) out.scenario = s
  }
  return out
}

export function sanitizeMessages(raw: unknown): AssistMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) return null
  const out: AssistMessage[] = []
  for (const m of raw) {
    if (!isObj(m) || (m.role !== 'user' && m.role !== 'assistant')) return null
    const content = cleanText(m.content, MAX_MESSAGE_CHARS)
    if (!content) return null
    out.push({ role: m.role, content })
  }
  return out[out.length - 1].role === 'user' ? out : null
}

export function sanitizeState(raw: unknown): AssistState | null {
  if (!isObj(raw)) return null
  const mode = oneOf(raw.mode, ['seasons', 'years'] as const)
  if (!mode || typeof raw.irrigated !== 'boolean') return null
  const ids = (x: unknown) => (Array.isArray(x) ? x.filter((c): c is string => typeof c === 'string' && c in CROP_BY_ID) : [])
  const w = isObj(raw.weights) ? raw.weights : {}
  const wv = (k: string) => clamp(Math.round(num(w[k]) ?? 3), 0, 5)
  const s = isObj(raw.soil) ? raw.soil : {}
  const e = num(raw.elevationM)
  const m = num(raw.startMonth)
  return {
    place: cleanText(raw.place, 80),
    mode,
    irrigated: raw.irrigated,
    elevationM: e !== null && e >= -100 && e <= 6000 ? Math.round(e) : null,
    current: ids(raw.current).slice(0, 3),
    allowed: ids(raw.allowed),
    weights: { water: wv('water'), soil: wv('soil'), income: wv('income'), resilience: wv('resilience') },
    soil: {
      texture: oneOf(s.texture, TEXTURES) ?? 'unknown',
      drainage: oneOf(s.drainage, DRAINAGES) ?? 'unknown',
      organicMatter: oneOf(s.organicMatter, ORGANICS) ?? 'unknown',
    },
    startMonth: m !== null && Number.isInteger(m) && m >= 1 && m <= 12 ? m : 'auto',
  }
}

/** The state of the form as the assistant should see it. Contains no personal data: no name, email or exact coordinates. */
export function stateFromInputs(i: Inputs, place: string): AssistState {
  return {
    place,
    mode: i.mode,
    irrigated: i.irrigated,
    elevationM: i.elevationM,
    current: i.current,
    allowed: i.allowed,
    weights: { ...i.weights },
    soil: { texture: i.soil.texture, drainage: i.soil.drainage, organicMatter: i.soil.organicMatter },
    startMonth: i.startMonth,
  }
}

/** Parses the model's text into a validated reply. Never throws: unusable output becomes a plain message with no changes. */
export function parseModelOutput(text: string): AssistReply {
  const fallback: AssistReply = {
    reply: 'Sorry, I could not work that out. Could you say it another way, or fill the form in by hand on the Setup page?',
    patch: {},
    ready: false,
  }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return fallback
  let raw: unknown
  try {
    raw = JSON.parse(text.slice(start, end + 1))
  } catch {
    return fallback
  }
  if (!isObj(raw)) return fallback
  const reply = cleanText(raw.reply, 700)
  if (!reply) return fallback
  return { reply, patch: sanitizePatch(raw.patch), ready: raw.ready === true }
}

/** Later proposals override earlier ones field by field (nested groups are merged), and the result is validated again. */
export function mergePatch(a: AssistPatch, b: AssistPatch): AssistPatch {
  return sanitizePatch({
    ...a,
    ...b,
    weights: { ...a.weights, ...b.weights },
    soil: { ...a.soil, ...b.soil },
    scenario: { ...a.scenario, ...b.scenario },
  })
}

/** The new inputs after applying a validated patch. The current crops are always kept among the crops offered. */
export function applyPatch(inputs: Inputs, p: AssistPatch): Inputs {
  const next: Inputs = {
    ...inputs,
    ...(p.mode ? { mode: p.mode } : {}),
    ...(p.irrigated !== undefined ? { irrigated: p.irrigated } : {}),
    ...(p.elevationM !== undefined ? { elevationM: p.elevationM } : {}),
    ...(p.current ? { current: p.current } : {}),
    ...(p.startMonth !== undefined ? { startMonth: p.startMonth } : {}),
    weights: { ...inputs.weights, ...(p.weights ?? {}) },
    soil: { ...inputs.soil, ...(p.soil ?? {}) },
    scenario: { ...inputs.scenario, ...(p.scenario ?? {}) },
  }
  if (p.soil) next.soilSource = 'manual'
  const base = p.allowed ?? inputs.allowed
  next.allowed = Array.from(new Set([...base, ...next.current]))
  return next
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEIGHT_LABEL = { water: 'Save water', soil: 'Build soil health', income: 'Earn income', resilience: 'Avoid risk' } as const

/** The proposed changes in plain words, for the confirmation card. */
export function describePatch(p: AssistPatch): string[] {
  const lines: string[] = []
  const name = (id: string) => CROP_BY_ID[id]?.name ?? id
  if (p.mode) lines.push(`Rotation style: ${p.mode === 'seasons' ? '3 seasons per year' : '1 main crop per year, 3-year cycle'}`)
  if (p.current) lines.push(`Current rotation: ${p.current.map(name).join(' → ')}`)
  if (p.irrigated !== undefined) lines.push(`Irrigation: ${p.irrigated ? 'available' : 'not available (rainfed)'}`)
  if (p.elevationM !== undefined) lines.push(p.elevationM === null ? 'Field elevation: not set' : `Field elevation: ${p.elevationM} m`)
  if (p.startMonth !== undefined) lines.push(`Planting starts: ${p.startMonth === 'auto' ? 'automatic (best for the current rotation)' : MONTHS[p.startMonth - 1]}`)
  if (p.allowed) lines.push(`Crops you can grow: ${p.allowed.map(name).join(', ')}`)
  if (p.weights) {
    const parts = (Object.keys(p.weights) as (keyof typeof WEIGHT_LABEL)[]).map((k) => `${WEIGHT_LABEL[k]} ${p.weights?.[k]}/5`)
    lines.push(`Priorities: ${parts.join(', ')}`)
  }
  if (p.soil) {
    const known = (v?: string) => v && v !== 'unknown'
    const parts = [known(p.soil.texture) && `texture ${p.soil.texture}`, known(p.soil.drainage) && `drainage ${p.soil.drainage}`, known(p.soil.organicMatter) && `organic matter ${p.soil.organicMatter}`].filter(Boolean)
    if (parts.length) lines.push(`Soil: ${parts.join(', ')}`)
  }
  if (p.scenario) {
    const parts = [p.scenario.dTemp !== undefined && `${p.scenario.dTemp > 0 ? '+' : ''}${p.scenario.dTemp} °C`, p.scenario.rainPct !== undefined && `${p.scenario.rainPct > 0 ? '+' : ''}${p.scenario.rainPct}% rainfall`].filter(Boolean)
    if (parts.length) lines.push(`What-if climate: ${parts.join(', ')}`)
  }
  return lines
}

/** Crop ids with names, for the system prompt. */
export const CROP_LIST = CROPS.map((c) => `${c.id} = ${c.name}`).join('; ')
