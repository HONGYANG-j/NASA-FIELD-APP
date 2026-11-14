import { describe, expect, it } from 'vitest'
import { PRESETS } from '../data/presets'
import { NO_SCENARIO } from './climate'
import { decodeShare, encodeShare } from './share'
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

describe('share links', () => {
  it('round-trips a preset location with its options', () => {
    const q = encodeShare(inputs({ presetId: 'cameron', irrigated: false, elevationM: 1440, current: ['cabbage', 'potato', 'fallow'], startMonth: 3 }))
    expect(decodeShare(q)).toEqual({
      presetId: 'cameron', mode: 'seasons', irrigated: false, elevationM: 1440, current: ['cabbage', 'potato', 'fallow'], startMonth: 3,
    })
  })
  it('round-trips custom coordinates, and writes them only for custom locations', () => {
    expect(encodeShare(inputs())).not.toContain('lat=')
    const d = decodeShare(encodeShare(inputs({ presetId: 'custom', lat: 3.2, lon: 102.2 })))!
    expect(d.presetId).toBe('custom')
    expect(d.lat).toBe(3.2)
    expect(d.lon).toBe(102.2)
  })
  it('never carries soil, priorities or scenario', () => {
    const q = encodeShare(inputs())
    expect(q).not.toMatch(/soil|weight|scenario/i)
  })
  it('rejects links without a valid location', () => {
    expect(decodeShare('')).toBeNull()
    expect(decodeShare('?p=nowhere')).toBeNull()
    expect(decodeShare('?p=custom')).toBeNull()
    expect(decodeShare('?p=custom&lat=95&lon=10')).toBeNull()
    expect(decodeShare('?p=custom&lat=abc&lon=10')).toBeNull()
  })
  it('ignores individual fields that do not validate instead of trusting them', () => {
    const d = decodeShare('?p=kedah&mode=bogus&irr=2&el=99999&cur=rice,rice,notacrop&start=13')!
    expect(d).toEqual({ presetId: 'kedah' })
  })
  it('accepts start=auto and a month', () => {
    expect(decodeShare('?p=kedah&start=auto')!.startMonth).toBe('auto')
    expect(decodeShare('?p=kedah&start=12')!.startMonth).toBe(12)
  })
})
