import { describe, expect, it, vi } from 'vitest'
import { GEOCODE_URL, GeocodeError, parseCoordinates, placeLabel, roundCoord, searchPlaces } from './geocode'

describe('parseCoordinates', () => {
  it('reads common ways of writing a latitude and longitude', () => {
    expect(parseCoordinates('6.12, 100.36')).toEqual({ lat: 6.12, lon: 100.36 })
    expect(parseCoordinates('6.12 100.36')).toEqual({ lat: 6.12, lon: 100.36 })
    expect(parseCoordinates('-1.29;36.82')).toEqual({ lat: -1.29, lon: 36.82 })
    expect(parseCoordinates('  41.95N, 93.55W ')).toEqual({ lat: 41.95, lon: -93.55 })
    expect(parseCoordinates('1.3 S 36.8 E')).toEqual({ lat: -1.3, lon: 36.8 })
    expect(parseCoordinates('https://www.google.com/maps/@4.46,101.38,14z')).toEqual({ lat: 4.46, lon: 101.38 })
  })
  it('rejects out-of-range numbers and anything that is not a pair of numbers', () => {
    for (const bad of ['95, 10', '10, 190', '2024 2025', 'Alor Setar', '6.12', '6.12, 100.36, 5', '', 'NaN, 1']) expect(parseCoordinates(bad)).toBeNull()
  })
})

describe('roundCoord', () => {
  it('rounds to two decimals (about 1 km)', () => {
    expect(roundCoord(6.12104)).toBe(6.12)
    expect(roundCoord(100.36014)).toBe(100.36)
    expect(roundCoord(-93.61994)).toBe(-93.62)
  })
})

const reply = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('searchPlaces', () => {
  it('asks the Open-Meteo geocoder in English with a small result count, and parses places', async () => {
    const f = vi.fn(reply({ results: [
      { id: 1, name: 'Alor Star', latitude: 6.12104, longitude: 100.36014, feature_code: 'PPLA', country: 'Malaysia', admin1: 'Kedah', admin2: 'Daerah Kota Setar' },
      { id: 2, name: 'Tanah Rata', latitude: 4.46361, longitude: 101.3763, feature_code: 'PPLA2', country: 'Malaysia', admin1: 'Pahang', admin2: 'Cameron Highlands' },
    ] }))
    const out = await searchPlaces('  Alor Setar ', undefined, f as unknown as typeof fetch)
    const url = String((f.mock.calls[0] as unknown[])[0])
    expect(url.startsWith(GEOCODE_URL + '?')).toBe(true)
    expect(url).toContain('name=Alor+Setar')
    expect(url).toContain('language=en')
    expect(url).toContain('count=6')
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ name: 'Alor Star', lat: 6.12104, lon: 100.36014, kind: 'city' })
    expect(placeLabel(out[0])).toBe('Alor Star, Daerah Kota Setar, Kedah, Malaysia')
  })

  it('drops results that are not valid places instead of trusting them', async () => {
    const f = reply({ results: [
      { name: 'Nowhere', latitude: 999, longitude: 10 },
      { name: '', latitude: 1, longitude: 1 },
      { name: 'Text coordinates', latitude: '1', longitude: '2' },
      null,
      'junk',
      { name: 'Good place', latitude: 4.5, longitude: 101.4, country: 'Malaysia' },
    ] })
    const out = await searchPlaces('good', undefined, f as unknown as typeof fetch)
    expect(out.map((p) => p.name)).toEqual(['Good place'])
  })

  it('returns an empty list when nothing matches (the service sends no results field)', async () => {
    expect(await searchPlaces('Jalan Alor Kuala Lumpur', undefined, reply({ generationtime_ms: 0.3 }) as unknown as typeof fetch)).toEqual([])
  })

  it('reports problems with clear codes', async () => {
    await expect(searchPlaces('a')).rejects.toMatchObject({ code: 'too_short' })
    await expect(searchPlaces('ab', undefined, reply({}, 429) as unknown as typeof fetch)).rejects.toMatchObject({ code: 'busy' })
    await expect(searchPlaces('ab', undefined, reply({}, 500) as unknown as typeof fetch)).rejects.toMatchObject({ code: 'unavailable' })
    await expect(searchPlaces('ab', undefined, (async () => { throw new TypeError('failed') }) as unknown as typeof fetch)).rejects.toMatchObject({ code: 'network' })
    await expect(searchPlaces('ab', undefined, (async () => new Response('not json', { status: 200 })) as unknown as typeof fetch)).rejects.toBeInstanceOf(GeocodeError)
  })

  it('lets an aborted search surface as an abort, not as a failure message', async () => {
    const f = async () => { throw new DOMException('aborted', 'AbortError') }
    await expect(searchPlaces('ab', undefined, f as unknown as typeof fetch)).rejects.toMatchObject({ name: 'AbortError' })
  })
})
