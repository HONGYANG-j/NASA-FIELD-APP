import { lazy, Suspense, useState } from 'react'
import { CUSTOM_PRESET_ID, PRESETS } from '../data/presets'
import type { AssistStatus } from '../lib/assistClient'
import type { Inputs } from '../state'
import './Assist.css'

// Leaflet and the map CSS load only when someone opens the map.
const MapPicker = lazy(() => import('./MapPicker'))

interface Props {
  inputs: Inputs
  loading: boolean
  failed: boolean
  status: AssistStatus | null
  onPreset: (id: string) => void
  onPickPoint: (lat: number, lon: number) => void
  onLoadCustom: () => void
  onChange: (patch: Partial<Inputs>) => void
  onChoose: (path: 'ai' | 'manual') => void
  onSkip: () => void
}

const SUBTITLE: Record<string, string> = {
  kedah: 'Rice bowl of Malaysia. Tropical, irrigated, three seasons a year.',
  cameron: 'Highland vegetables. Cool, rainfed, about 1,440 m up.',
  iowa: 'US corn belt. Temperate, one crop a year. A stress test, not a Malaysian site.',
}

/** The first screen: choose the place (required), then choose how to fill in the rest. */
export function StartScreen({ inputs, loading, failed, status, onPreset, onPickPoint, onLoadCustom, onChange, onChoose, onSkip }: Props) {
  const [picked, setPicked] = useState<string | null>(null)
  const [custom, setCustom] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)

  const choosePreset = (id: string, name: string) => {
    setCustom(false)
    setMapOpen(false)
    onPreset(id)
    setPicked(name)
  }
  const aiOff = status !== null && !status.configured

  return (
    <section className="start" aria-label="Get started">
      <div>
        <p className="eyebrow start-eyebrow">NASA Space Apps Challenge 2026 · Field Shift</p>
        <h1>Compare crop rotations for your farm</h1>
        <p className="lede">Two steps: tell us where the farm is, then choose how you want to describe it. Everything is scored from 20 years of NASA climate data.</p>
      </div>

      <div className="card start-step">
        <h2><span className={`step-n ${picked ? 'done' : ''}`}>{picked ? '✓' : '1'}</span> Where is your farm? <small className="muted">(required)</small></h2>
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
              <button type="button" onClick={() => { onLoadCustom(); setPicked(`Custom point ${inputs.lat}, ${inputs.lon}`) }}>Use these coordinates</button>
              <button type="button" className="ghost" aria-expanded={mapOpen} onClick={() => setMapOpen((o) => !o)}>{mapOpen ? 'Hide map' : 'Pick on the satellite map'}</button>
            </div>
            {mapOpen && (
              <Suspense fallback={<p className="muted" role="status">Loading map…</p>}>
                <MapPicker lat={inputs.lat} lon={inputs.lon} onPick={(la, lo) => { onPickPoint(la, lo); setPicked(`Custom point ${la}, ${lo}`) }} />
              </Suspense>
            )}
          </>
        )}

        {picked && (
          <p className="start-status" role="status">
            {failed ? 'Could not load NASA data for this place yet. You can still continue and press “Try again” on the next screen.' : loading ? `Selected: ${picked}. Loading 20 years of NASA climate data in the background…` : `Selected: ${picked}. NASA climate data is ready.`}
          </p>
        )}
      </div>

      <div className={`card start-step ${picked ? '' : 'locked'}`} aria-disabled={!picked}>
        <h2><span className="step-n">2</span> How would you like to describe your farm?</h2>
        <div className="path-cards">
          <button type="button" className="path-card primary" disabled={!picked || aiOff} onClick={() => onChoose('ai')}>
            <strong>Guide me with AI <span className="beta">beta</span></strong>
            <span>
              {aiOff
                ? 'Not available right now. Use the manual setup.'
                : 'Answer a few questions in plain language. The AI fills in the setup, you check it, and the NASA-data engine does the scoring.'}
            </span>
          </button>
          <button type="button" className="path-card" disabled={!picked} onClick={() => onChoose('manual')}>
            <strong>I’ll fill it in myself</strong>
            <span>Use the setup panel: rotation style, current crops, priorities, soil and a climate what-if.</span>
          </button>
        </div>
        {!picked && <p className="start-status">Choose a place first.</p>}
      </div>

      <p className="start-skip">
        Just want to look first? <button type="button" className="link" onClick={onSkip}>Show the Kedah demo results</button>
      </p>
    </section>
  )
}
