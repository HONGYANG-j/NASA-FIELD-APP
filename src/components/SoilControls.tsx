import { useEffect, useRef, useState } from 'react'
import { EVIDENCE_LABEL, SOIL_RULES, UNKNOWN_SOIL } from '../data/soils'
import type { Drainage, OrganicMatter, SoilProfile, Texture } from '../data/soils'
import { fetchSoilGrids } from '../lib/soilgrids'
import type { Inputs } from '../state'

interface Props {
  soil: SoilProfile
  soilSource: Inputs['soilSource']
  lat: number
  lon: number
  onChange: (patch: Partial<Inputs>) => void
}

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; text: string }
  | { kind: 'fail'; text: string }

export function SoilControls({ soil, soilSource, lat, lon, onChange }: Props) {
  // The message belongs to the location it was produced for; at another location it is simply not shown.
  const here = `${lat},${lon}`
  const [state, setState] = useState<{ at: string; status: Status }>({ at: here, status: { kind: 'idle' } })
  const status: Status = state.at === here ? state.status : { kind: 'idle' }
  const setStatus = (s: Status) => setState({ at: here, status: s })
  const ctrl = useRef<AbortController | null>(null)

  // A new location makes any answer still in flight stale.
  useEffect(() => {
    ctrl.current?.abort()
  }, [lat, lon])
  useEffect(() => () => ctrl.current?.abort(), [])

  const set = (patch: Partial<SoilProfile>, fromHand = true) =>
    onChange({
      soil: { ...soil, ...patch },
      // Choosing texture or organic matter by hand means those values no longer come from SoilGrids.
      ...(fromHand && ('texture' in patch || 'organicMatter' in patch) ? { soilSource: 'manual' as const } : {}),
    })

  const fill = async () => {
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    setStatus({ kind: 'loading' })
    try {
      const r = await fetchSoilGrids(lat, lon, { keepDrainage: soil.drainage, signal: c.signal })
      if (c.signal.aborted) return
      if (!r.ok) {
        setStatus({ kind: 'fail', text: r.message })
        return
      }
      onChange({ soil: r.profile, soilSource: 'soilgrids' })
      const { clayPct, sandPct, siltPct, socGperKg } = r.reading
      setStatus({
        kind: 'ok',
        text: `SoilGrids (0–30 cm average): clay ${clayPct.toFixed(0)}%, sand ${sandPct.toFixed(0)}%, silt ${siltPct.toFixed(0)}%, organic carbon ${socGperKg.toFixed(0)} g/kg${r.fromCache ? ' (saved copy)' : ''}. Drainage is not provided by SoilGrids: set it yourself.`,
      })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setStatus({ kind: 'fail', text: 'SoilGrids lookup failed. Choose the soil by hand.' })
    }
  }

  const reset = () => {
    ctrl.current?.abort()
    setStatus({ kind: 'idle' })
    onChange({ soil: UNKNOWN_SOIL, soilSource: 'manual' })
  }

  return (
    <fieldset>
      <legend>Your soil (optional)</legend>
      <p className="muted">
        Leave a choice on “not specified” and soil has no effect on the scores. Pick from a local soil test or your own knowledge.
      </p>
      <label>
        Texture
        <select value={soil.texture} onChange={(e) => set({ texture: e.target.value as Texture })}>
          <option value="unknown">Not specified</option>
          <option value="sandy">Sandy (light, drains fast)</option>
          <option value="loam">Loam</option>
          <option value="clay">Clay (heavy, sticky)</option>
        </select>
      </label>
      <label>
        Drainage
        <select value={soil.drainage} onChange={(e) => set({ drainage: e.target.value as Drainage })}>
          <option value="unknown">Not specified</option>
          <option value="poor">Poor (water stands after rain)</option>
          <option value="moderate">Moderate</option>
          <option value="good">Good (drains quickly)</option>
        </select>
      </label>
      <label>
        Organic matter
        <select value={soil.organicMatter} onChange={(e) => set({ organicMatter: e.target.value as OrganicMatter })}>
          <option value="unknown">Not specified</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </label>
      <div className="row">
        <button type="button" onClick={fill} disabled={status.kind === 'loading'}>
          {status.kind === 'loading' ? 'Asking SoilGrids…' : 'Fill from SoilGrids'}
        </button>
        <button type="button" className="link" onClick={reset}>Clear soil</button>
      </div>
      <small className="muted">
        SoilGrids is from ISRIC (World Soil Information), not NASA, and its web service is in beta. It is a 250 m
        computer model, not a measurement of your field, and can have no value at some points.
      </small>
      {status.kind === 'ok' && <p className="status-note" role="status">{status.text}</p>}
      {status.kind === 'fail' && <p className="status-note error" role="alert">{status.text}</p>}
      {soilSource === 'soilgrids' && status.kind !== 'ok' && (
        <p className="muted">Texture and organic matter were filled from SoilGrids (non-NASA, beta).</p>
      )}
      <details>
        <summary>How soil is used, and what is unverified</summary>
        <ul className="plain-list">
          {SOIL_RULES.map((r) => (
            <li key={r.id}>
              <strong>{r.title}</strong> [{EVIDENCE_LABEL[r.status]}]
              <br />
              {r.effect} <em>Why:</em> {r.reasoning} <em>Source:</em> {r.source}
            </li>
          ))}
        </ul>
      </details>
    </fieldset>
  )
}
