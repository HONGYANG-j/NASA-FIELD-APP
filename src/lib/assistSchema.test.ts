import { describe, expect, it } from 'vitest'
import { PRESETS } from '../data/presets'
import { NO_SCENARIO } from './climate'
import { applyPatch, describePatch, parseModelOutput, sanitizeMessages, sanitizePatch, sanitizeState, stateFromInputs } from './assistSchema'
import { UNKNOWN_SOIL } from './soil'
import { DEFAULT_WEIGHTS } from '../state'
import type { Inputs } from '../state'

function inputs(over: Partial<Inputs> = {}): Inputs {
  const p = PRESETS[0]
  return {
    presetId: p.id, lat: p.lat, lon: p.lon, mode: p.mode, irrigated: p.irrigated, elevationM: null,
    current: p.current, allowed: p.crops, weights: DEFAULT_WEIGHTS, soil: UNKNOWN_SOIL, soilSource: 'manual',
    scenario: NO_SCENARIO, startMonth: 'auto', ...over,
  }
}

describe('sanitizePatch', () => {
  it('keeps valid values and clamps numbers into range', () => {
    const p = sanitizePatch({
      mode: 'years', irrigated: false, elevationM: 1440.4, current: ['cabbage', 'potato', 'fallow'],
      weights: { water: 9, soil: -3, income: 2.6 }, startMonth: 6,
      soil: { texture: 'clay', drainage: 'poor', organicMatter: 'high' }, scenario: { dTemp: 9, rainPct: -33 },
    })
    expect(p).toEqual({
      mode: 'years', irrigated: false, elevationM: 1440, current: ['cabbage', 'potato', 'fallow'],
      weights: { water: 5, soil: 0, income: 3 }, startMonth: 6,
      soil: { texture: 'clay', drainage: 'poor', organicMatter: 'high' }, scenario: { dTemp: 4, rainPct: -35 },
    })
  })
  it('drops anything not on the whitelist instead of guessing', () => {
    const p = sanitizePatch({
      mode: 'both', irrigated: 'yes', elevationM: 99999, current: ['rice', 'rice'], allowed: ['rice', 'moonrock', 7],
      weights: { water: 'lots', speed: 5 }, startMonth: 13, soil: { texture: 'rocky' }, scenario: { dTemp: 'hot' },
      overall: 100, score: 100, lat: 5, __proto__: { admin: true },
    })
    expect(p).toEqual({ allowed: ['rice'] })
    expect(p).not.toHaveProperty('overall')
    expect(p).not.toHaveProperty('lat')
  })
  it('accepts null elevation and "auto" start month', () => {
    expect(sanitizePatch({ elevationM: null, startMonth: 'auto' })).toEqual({ elevationM: null, startMonth: 'auto' })
  })
  it('returns an empty patch for non-objects', () => {
    for (const x of [null, undefined, 'x', 5, [], true]) expect(sanitizePatch(x)).toEqual({})
  })
})

describe('sanitizeMessages / sanitizeState', () => {
  it('requires 1-14 messages ending with a user message, each non-empty and capped', () => {
    expect(sanitizeMessages([{ role: 'user', content: 'hi' }])).toEqual([{ role: 'user', content: 'hi' }])
    expect(sanitizeMessages([])).toBeNull()
    expect(sanitizeMessages([{ role: 'assistant', content: 'hello' }])).toBeNull()
    expect(sanitizeMessages([{ role: 'system', content: 'x' }])).toBeNull()
    expect(sanitizeMessages([{ role: 'user', content: '   ' }])).toBeNull()
    expect(sanitizeMessages(Array.from({ length: 15 }, () => ({ role: 'user', content: 'a' })))).toBeNull()
    const long = sanitizeMessages([{ role: 'user', content: 'a'.repeat(5000) }])!
    expect(long[0].content).toHaveLength(1200)
  })
  it('strips control characters', () => {
    expect(sanitizeMessages([{ role: 'user', content: 'a\u0000b\u0007c' }])![0].content).toBe('abc')
  })
  it('builds a state with safe defaults and no coordinates', () => {
    const s = sanitizeState({ place: 'Kedah', mode: 'seasons', irrigated: true, current: ['rice', 'nope'], weights: { water: 99 } })!
    expect(s.current).toEqual(['rice'])
    expect(s.weights.water).toBe(5)
    expect(s.soil.texture).toBe('unknown')
    expect(sanitizeState({ mode: 'seasons' })).toBeNull()
    const fromForm = JSON.stringify(stateFromInputs(inputs(), 'Kedah rice bowl, Malaysia'))
    expect(fromForm).not.toMatch(/lat|lon|6\.25|100\.35/)
  })
})

describe('parseModelOutput', () => {
  it('extracts JSON even with surrounding text and validates the patch', () => {
    const r = parseModelOutput('Sure!\n```json\n{"reply":"Do you irrigate?","patch":{"current":["rice","rice","fallow"],"weights":{"water":8}},"ready":false}\n```')
    expect(r.reply).toBe('Do you irrigate?')
    expect(r.patch).toEqual({ current: ['rice', 'rice', 'fallow'], weights: { water: 5 } })
    expect(r.ready).toBe(false)
  })
  it('falls back to a harmless message for unusable output', () => {
    for (const t of ['', 'no json here', '{"reply": 5}', '{bad json}', '[1,2,3]']) {
      const r = parseModelOutput(t)
      expect(r.patch).toEqual({})
      expect(r.ready).toBe(false)
      expect(r.reply.length).toBeGreaterThan(10)
    }
  })
  it('only treats ready as true when it is exactly true', () => {
    expect(parseModelOutput('{"reply":"ok","patch":{},"ready":"true"}').ready).toBe(false)
    expect(parseModelOutput('{"reply":"ok","patch":{},"ready":true}').ready).toBe(true)
  })
})

describe('applyPatch / describePatch', () => {
  it('merges into the form, keeps the current crops among the crops offered, and marks soil as manual', () => {
    const base = inputs({ soilSource: 'soilgrids' })
    const next = applyPatch(base, { current: ['cabbage', 'potato', 'fallow'], allowed: ['maize'], soil: { texture: 'clay' }, weights: { water: 5 } })
    expect(next.current).toEqual(['cabbage', 'potato', 'fallow'])
    expect(next.allowed).toEqual(expect.arrayContaining(['maize', 'cabbage', 'potato', 'fallow']))
    expect(next.soil.texture).toBe('clay')
    expect(next.soil.drainage).toBe('unknown')
    expect(next.soilSource).toBe('manual')
    expect(next.weights).toEqual({ ...DEFAULT_WEIGHTS, water: 5 })
    expect(next.lat).toBe(base.lat) // location is never changed by the assistant
    expect(next.presetId).toBe(base.presetId)
  })
  it('an empty patch changes nothing that matters', () => {
    const base = inputs()
    const next = applyPatch(base, {})
    expect(next).toEqual({ ...base, allowed: Array.from(new Set([...base.allowed, ...base.current])) })
  })
  it('describes each proposed change in words', () => {
    const lines = describePatch({ mode: 'seasons', current: ['rice', 'rice', 'fallow'], irrigated: true, startMonth: 6, weights: { water: 4 }, scenario: { dTemp: 2, rainPct: -20 } })
    expect(lines.join('\n')).toMatch(/3 seasons per year/)
    expect(lines.join('\n')).toMatch(/Rice \(paddy\) → Rice \(paddy\) → Bare fallow/)
    expect(lines.join('\n')).toMatch(/Jun/)
    expect(lines.join('\n')).toMatch(/Save water 4\/5/)
    expect(lines.join('\n')).toMatch(/\+2 °C, -20% rainfall/)
    expect(describePatch({})).toEqual([])
  })
})
