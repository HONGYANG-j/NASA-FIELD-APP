import { lazy, Suspense, useState } from 'react'
import type { ReactNode } from 'react'
import { CUSTOM_PRESET_ID, PRESETS } from '../data/presets'
import type { Inputs } from '../state'
import { PlaceSearch } from './PlaceSearch'
import './Assist.css'

// Leaflet and the map CSS load only when someone opens the map.
const MapPicker = lazy(() => import('./MapPicker'))

export type FillMode = 'ai' | 'manual'

interface Props {
  inputs: Inputs
  loading: boolean
  failed: boolean
  /** Label of the chosen place, or null until the visitor has chosen one (the results stay locked until then). */
  picked: string | null
  onPicked: (label: string) => void
  onPreset: (id: string) => void
  onPickPoint: (lat: number, lon: number) => void
  /** A place found by name, pasted coordinates, or the device location. */
  onSearchPick: (lat: number, lon: number, label: string) => void
  /** Loads the typed coordinates. Returns false (and loads nothing) when they are not valid. */
  onLoadCustom: () => boolean
  /** Why the typed coordinates were refused, or null. */
  formError: string | null
  onChange: (patch: Partial<Inputs>) => void
  fill: FillMode
  onFill: (m: FillMode) => void
  /** The AI assistant page and the manual form, shown one at a time. */
  ai: ReactNode
  manual: ReactNode
  onShowResults: () => void
  onSkip: () => void
}

const SUBTITLE: Record<string, string> = {
  kedah: 'Rice bowl of Malaysia. Tropical, irrigated, three seasons a year.',
  cameron: 'Highland vegetables. Cool, rainfed, about 1,440 m up.',
  iowa: 'US corn belt. Temperate, one crop a year. A stress test, not a Malaysian site.',
}

/** The first page: choose the place (required), then describe the farm by chatting with the AI or by filling in the form. */
export function StartScreen({ inputs, loading, failed, picked, onPicked, onPreset, onPickPoint, onSearchPick, onLoadCustom, formError, onChange, fill, onFill, ai, manual, onShowResults, onSkip }: Props) {
  const [custom, setCustom] = useState(() => (picked?.startsWith('Custom') ?? false))
  const [mapOpen, setMapOpen] = useState(false)

  const choosePreset = (id: string, name: string) => {
    setCustom(false)
    setMapOpen(false)
    onPreset(id)
    onPicked(name)
  }

  return (
    <section className="start" aria-label="Your farm">
      <div>
        <p className="eyebrow start-eyebrow">NASA Space Apps Challenge 2026 · Field Shift</p>
        <h1>Compare crop rotations for your farm</h1>
        <p className="lede">Two steps: tell us where the farm is, then describe it by chatting with the AI or by filling in the form. Everything is scored from 20 years of NASA climate data.</p>
      </div>

      <div className="card start-step">
        <h2><span className={`step-n ${picked ? 'done' : ''}`}>{picked ? '✓' : '1'}</span> Where is your farm? <small className="muted">(required)</small></h2>
        <h3 className="sub">Search for your place</h3>
        <PlaceSearch onChoose={(lat, lon, label) => { setCustom(false); setMapOpen(false); onSearchPick(lat, lon, label) }} />
        <h3 className="sub">Or choose a demo site, or enter coordinates</h3>
        <div className="place-cards">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" className={`place-card ${picked === p.name ? 'on' : ''}`} onClick={() => choosePreset(p.id, p.name)} aria-pressed={picked === p.name}>
              <strong>{p.name}</strong>
              <span>{SUBTITLE[p.id]}</span>
            </button>
          ))}
          <button
            type="button"
            className={`place-card ${custom ? 'on' : ''}`}
            onClick={() => { setCustom(true); onPreset(CUSTOM_PRESET_ID) }}
            aria-expanded={custom}
          >
            <strong>My own coordinates</strong>
            <span>Type a latitude and longitude, or click the map. Works anywhere in the world.</span>
          </button>
        </div>

        {custom && (
          <>
            <div className="start-custom">
              <label>
                Latitude
                <input type="number" step="0.01" min={-90} max={90} value={inputs.lat} onChange={(e) => onChange({ lat: Number(e.target.value) })} />
              </label>
              <label>
                Longitude
                <input type="number" step="0.01" min={-180} max={180} value={inputs.lon} onChange={(e) => onChange({ lon: Number(e.target.value) })} />
              </label>
              <button type="button" onClick={() => { if (onLoadCustom()) onPicked(`Custom point ${inputs.lat}, ${inputs.lon}`) }}>Use these coordinates</button>
              <button type="button" className="ghost" aria-expanded={mapOpen} onClick={() => setMapOpen((o) => !o)}>{mapOpen ? 'Hide map' : 'Pick on the satellite map'}</button>
            </div>
            {mapOpen && (
              <Suspense fallback={<p className="muted" role="status">Loading map…</p>}>
                <MapPicker lat={inputs.lat} lon={inputs.lon} onPick={(la, lo) => { onPickPoint(la, lo); onPicked(`Custom point ${la}, ${lo}`) }} />
              </Suspense>
            )}
          </>
        )}

        {formError && <p className="banner" role="alert">{formError}</p>}
        {picked && !formError && (
          <p className="start-status" role="status">
            {failed ? 'Could not load NASA data for this place yet. You can still continue and press “Try again” on the results page.' : loading ? `Selected: ${picked}. Loading 20 years of NASA climate data in the background…` : `Selected: ${picked}. NASA climate data is ready.`}
          </p>
        )}
      </div>

      <div className={`card start-step ${picked ? '' : 'locked'}`} aria-disabled={!picked}>
        <h2><span className="step-n">2</span> Describe your farm</h2>
        {!picked ? (
          <p className="start-status">Choose a place first. The AI assistant and the form unlock once you have.</p>
        ) : (
          <>
            <div className="seg" role="tablist" aria-label="How to describe your farm">
              <button type="button" role="tab" aria-selected={fill === 'ai'} className={`seg-btn ${fill === 'ai' ? 'on' : ''}`} onClick={() => onFill('ai')}>
                Ask the AI <span className="beta">beta</span>
              </button>
              <button type="button" role="tab" aria-selected={fill === 'manual'} className={`seg-btn ${fill === 'manual' ? 'on' : ''}`} onClick={() => onFill('manual')}>
                Fill in myself
              </button>
            </div>
            <div role="tabpanel" hidden={fill !== 'ai'}>{ai}</div>
            <div role="tabpanel" hidden={fill !== 'manual'} className="manual-grid">{manual}</div>
            <div className="start-cta">
              <button type="button" className="cta" onClick={onShowResults}>See my results →</button>
              <span className="muted">You can change anything later with “Your farm” in the menu.</span>
            </div>
          </>
        )}
      </div>

      <p className="start-skip">
        Just want to look first? <button type="button" className="link" onClick={onSkip}>Show the Kedah demo results</button>
      </p>
    </section>
  )
}
