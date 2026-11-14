import { describe, expect, it } from 'vitest'
import { PRESETS } from './presets'
import { RAIN_CHECK, RAIN_CHECK_NUMBERS } from './rainfallCheck'

const fmt = (n: number) => n.toLocaleString('en-US')

describe('rainfall cross-check notes', () => {
  it('exist only for demo sites that have an IMERG comparison (not Cameron, not custom)', () => {
    expect(Object.keys(RAIN_CHECK).sort()).toEqual(['iowa', 'kedah'])
    expect(Object.keys(RAIN_CHECK_NUMBERS).sort()).toEqual(['iowa', 'kedah'])
    const ids = PRESETS.map((p) => p.id)
    for (const id of Object.keys(RAIN_CHECK)) expect(ids).toContain(id)
  })

  for (const id of ['kedah', 'iowa']) {
    it(`${id}: the sentence quotes exactly the numbers it is built from`, () => {
      const n = RAIN_CHECK_NUMBERS[id]
      expect(RAIN_CHECK[id]).toContain(fmt(n.power))
      expect(RAIN_CHECK[id]).toContain(fmt(n.imerg))
    })
  }

  it('the percentages in the wording match the numbers', () => {
    const k = RAIN_CHECK_NUMBERS.kedah
    const i = RAIN_CHECK_NUMBERS.iowa
    expect(Math.round((Math.abs(k.power - k.imerg) / k.imerg) * 100)).toBe(2) // "about 2% apart"
    expect(Math.round((1 - i.power / i.imerg) * 100)).toBe(17) // "about 17% lower"
  })

  it('says plainly that gauges were not used', () => {
    expect(RAIN_CHECK.kedah).toMatch(/rain gauges/)
    expect(RAIN_CHECK.iowa).toMatch(/rain-gauge data/)
  })
})
