import { useEffect, useRef, useState } from 'react'
import { GeocodeError, parseCoordinates, placeLabel, roundCoord, searchPlaces } from '../lib/geocode'
import type { Place } from '../lib/geocode'

interface Props {
  /** A place was chosen. The coordinates are already rounded to about 1 km. */
  onChoose: (lat: number, lon: number, label: string) => void
}

const ERROR_TEXT = {
  too_short: 'Type at least two letters.',
  network: 'Could not reach the place search. Check your connection, or paste coordinates or use the map instead.',
  busy: 'The place search is busy. Wait a moment and try again, or paste coordinates.',
  unavailable: 'The place search is not available right now. Paste coordinates, use the map, or pick a demo site.',
} as const

/** Find a place by name, paste coordinates, or use the device's location. Searches run only when Search is pressed. */
export function PlaceSearch({ onChoose }: Props) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<Place[] | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const lastSearch = useRef(0)
  const canLocate = typeof navigator !== 'undefined' && 'geolocation' in navigator

  useEffect(() => () => abort.current?.abort(), [])

  const choose = (lat: number, lon: number, label: string) => {
    setResults(null)
    setNote(null)
    onChoose(roundCoord(lat), roundCoord(lon), label)
  }

  const submit = async () => {
    const coords = parseCoordinates(q)
    if (coords) {
      choose(coords.lat, coords.lon, `Custom point ${roundCoord(coords.lat)}, ${roundCoord(coords.lon)}`)
      return
    }
    if (busy) return
    // At most one search a second: this is a typed, button-pressed search, never search-as-you-type.
    if (Date.now() - lastSearch.current < 1000) return
    lastSearch.current = Date.now()
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    setBusy(true)
    setNote(null)
    setResults(null)
    try {
      const found = await searchPlaces(q, ctrl.signal)
      if (ctrl.signal.aborted) return
      setResults(found)
      if (found.length === 0) {
        setNote('No match. This search finds villages, towns, districts, mountains and airports, not street addresses. Try a nearby town, paste coordinates (for example 6.12, 100.36), or use the map.')
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setNote(e instanceof GeocodeError ? ERROR_TEXT[e.code] : ERROR_TEXT.unavailable)
    } finally {
      if (!ctrl.signal.aborted) setBusy(false)
    }
  }

  const locate = () => {
    setNote(null)
    setBusy(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false)
        const lat = roundCoord(pos.coords.latitude)
        const lon = roundCoord(pos.coords.longitude)
        choose(lat, lon, `My current location (about ${lat}, ${lon})`)
      },
      (err) => {
        setBusy(false)
        setNote(err.code === 1 ? 'Location permission was declined. Search for a place or paste coordinates instead.' : 'Could not find your location. Search for a place or paste coordinates instead.')
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    )
  }

  return (
    <div className="place-search">
      <form onSubmit={(e) => { e.preventDefault(); void submit() }} role="search">
        <label htmlFor="place-q" className="visually-hidden">Search for a place, or paste coordinates</label>
        <input
          id="place-q"
          type="search"
          value={q}
          maxLength={100}
          placeholder="Search a village, town or district, or paste coordinates (6.12, 100.36)"
          autoComplete="off"
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="submit" disabled={busy || q.trim().length < 2}>{busy ? 'Searching…' : 'Search'}</button>
        {canLocate && <button type="button" className="ghost" onClick={locate} disabled={busy}>Use my location</button>}
      </form>
      <p className="place-note" role="status">{note}</p>
      {results && results.length > 0 && (
        <ul className="place-results" aria-label="Matching places">
          {results.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => choose(p.lat, p.lon, placeLabel(p))}>
                <strong>{p.name}</strong>
                <span>{p.detail ? `${p.detail} · ` : ''}{p.kind}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="muted place-privacy">
        Place names come from Open-Meteo’s geocoder (GeoNames data, CC BY 4.0); what you type is sent there when you press Search, so do not type a
        home address. “Use my location” is read by your browser only; just the rounded point (about 1 km) is used to fetch NASA climate data.
      </p>
    </div>
  )
}
