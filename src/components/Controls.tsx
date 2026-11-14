import { lazy, Suspense, useState } from 'react'
import { CROPS } from '../data/crops'
import { CUSTOM_PRESET_ID, PRESETS } from '../data/presets'
import { monthName } from '../lib/explain'
import type { Inputs } from '../state'
import type { Weights } from '../types'
import { SoilControls } from './SoilControls'

// Leaflet and the map CSS load only when someone opens the map.
const MapPicker = lazy(() => import('./MapPicker'))

interface Props {
  inputs: Inputs
  /** A point clicked on the map: switches to a custom location and loads its data. */
  onPickPoint: (lat: number, lon: number) => void
  autoMonth: number
  onChange: (patch: Partial<Inputs>) => void
  onPreset: (id: string) => void
  onLoadCustom: () => void
  loading: boolean
  /** Elevation of NASA POWER's grid cell for the loaded location. */
  gridElevationM: number | null
  /** The location is chosen on the first page, so the form leaves out the location controls. */
  hideLocation?: boolean
}

const PRIORITIES: { key: keyof Weights; label: string; help: string }[] = [
  { key: 'water', label: 'Save water', help: 'Prefer crops whose water need is small compared with rainfall.' },
  { key: 'soil', label: 'Build soil health', help: 'Prefer cover, organic matter, nitrogen fixing and plant variety.' },
  { key: 'income', label: 'Earn income', help: 'Prefer crops with higher relative market value.' },
  { key: 'resilience', label: 'Avoid risk', help: 'Prefer rotations that worked in most past years.' },
]

export function Controls({
  inputs,
  onPickPoint,
  autoMonth,
  onChange,
  onPreset,
  onLoadCustom,
  loading,
  gridElevationM,
  hideLocation = false,
}: Props) {
  const setW = (k: keyof Weights, v: number) => onChange({ weights: { ...inputs.weights, [k]: v } })
  const setCurrent = (i: number, id: string) => {
    const next = [...inputs.current] as Inputs['current']
    next[i] = id
    onChange({ current: next })
  }
  const toggleCrop = (id: string) => {
    const has = inputs.allowed.includes(id)
    onChange({ allowed: has ? inputs.allowed.filter((x) => x !== id) : [...inputs.allowed, id] })
  }
  const slotWord = inputs.mode === 'seasons' ? 'Season' : 'Year'
  const [mapOpen, setMapOpen] = useState(false)

  return (
    <form className="controls" onSubmit={(e) => e.preventDefault()}>
      <fieldset>
        <legend>{hideLocation ? '1. About your field' : '1. Your farm'}</legend>
        {!hideLocation && (
          <>
        <label>
          Location
          <select value={inputs.presetId} onChange={(e) => onPreset(e.target.value)}>
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
            <option value={CUSTOM_PRESET_ID}>Enter my own coordinates…</option>
          </select>
        </label>
        {inputs.presetId === CUSTOM_PRESET_ID && (
          <div className="row">
            <label>
              Latitude
              <input type="number" step="0.01" min={-90} max={90} value={inputs.lat}
                onChange={(e) => onChange({ lat: Number(e.target.value) })} />
            </label>
            <label>
              Longitude
              <input type="number" step="0.01" min={-180} max={180} value={inputs.lon}
                onChange={(e) => onChange({ lon: Number(e.target.value) })} />
            </label>
            <button type="button" onClick={onLoadCustom} disabled={loading}>Load data</button>
          </div>
        )}
        <button type="button" aria-expanded={mapOpen} aria-controls="farm-map" onClick={() => setMapOpen((o) => !o)}>
          {mapOpen ? 'Hide satellite map' : 'Pick my farm on a satellite map'}
        </button>
        {mapOpen && (
          <div id="farm-map">
            <Suspense fallback={<p className="muted" role="status">Loading map…</p>}>
              <MapPicker lat={inputs.lat} lon={inputs.lon} onPick={onPickPoint} />
            </Suspense>
          </div>
        )}
          </>
        )}
        <label>
          Rotation style
          <select value={inputs.mode} onChange={(e) => onChange({ mode: e.target.value as Inputs['mode'] })}>
            <option value="seasons">3 seasons per year (tropics)</option>
            <option value="years">1 main crop per year, 3-year cycle (temperate)</option>
          </select>
        </label>
        <label>
          Field elevation (m, optional)
          <input
            type="number"
            min={-100}
            max={6000}
            step={10}
            placeholder={gridElevationM !== null ? `NASA grid cell: ${Math.round(gridElevationM)} m` : 'metres above sea level'}
            value={inputs.elevationM ?? ''}
            onChange={(e) => onChange({ elevationM: e.target.value === '' ? null : Number(e.target.value) })}
          />
          <small className="muted">
            Satellite grid cells are about 50 km wide. If your field is much higher or lower than the cell,
            enter its height to correct temperature.
          </small>
        </label>
        <label className="check">
          <input type="checkbox" checked={inputs.irrigated}
            onChange={(e) => onChange({ irrigated: e.target.checked })} />
          I can irrigate (rain is not the only water)
        </label>
        <label>
          Planting starts
          <select value={inputs.startMonth}
            onChange={(e) => onChange({ startMonth: e.target.value === 'auto' ? 'auto' : Number(e.target.value) })}>
            <option value="auto">Auto: best for my current rotation ({monthName(autoMonth)})</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i} value={i + 1}>{monthName(i + 1)}</option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>2. What you grow now</legend>
        {[0, 1, 2].map((i) => (
          <label key={i}>
            {slotWord} {i + 1}
            <select value={inputs.current[i]} onChange={(e) => setCurrent(i, e.target.value)}>
              {CROPS.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        ))}
      </fieldset>

      <SoilControls soil={inputs.soil} soilSource={inputs.soilSource} lat={inputs.lat} lon={inputs.lon} onChange={onChange} />

      <fieldset>
        <legend>3. What matters to you</legend>
        {PRIORITIES.map((p) => (
          <label key={p.key} title={p.help}>
            <span className="label-row">{p.label}<output>{inputs.weights[p.key]}</output></span>
            <input type="range" min={0} max={5} step={1} value={inputs.weights[p.key]}
              onChange={(e) => setW(p.key, Number(e.target.value))} />
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>4. Crops you can grow and sell</legend>
        <div className="chips">
          {CROPS.map((c) => (
            <label key={c.id} className={`chip ${inputs.allowed.includes(c.id) ? 'on' : ''}`}>
              <input type="checkbox" checked={inputs.allowed.includes(c.id)} onChange={() => toggleCrop(c.id)} />
              {c.name}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>5. What if the climate shifts?</legend>
        <label>
          <span className="label-row">Warmer by<output>{inputs.scenario.dTemp > 0 ? '+' : ''}{inputs.scenario.dTemp} °C</output></span>
          <input type="range" min={-2} max={4} step={0.5} value={inputs.scenario.dTemp}
            onChange={(e) => onChange({ scenario: { ...inputs.scenario, dTemp: Number(e.target.value) } })} />
        </label>
        <label>
          <span className="label-row">Rainfall change<output>{inputs.scenario.rainPct > 0 ? '+' : ''}{inputs.scenario.rainPct}%</output></span>
          <input type="range" min={-40} max={40} step={5} value={inputs.scenario.rainPct}
            onChange={(e) => onChange({ scenario: { ...inputs.scenario, rainPct: Number(e.target.value) } })} />
        </label>
        <button type="button" className="link" onClick={() => onChange({ scenario: { dTemp: 0, rainPct: 0 } })}>
          Reset to the past 20 years
        </button>
      </fieldset>
    </form>
  )
}
