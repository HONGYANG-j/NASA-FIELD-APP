import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { ClimateChart } from './components/ClimateChart'
import { Controls } from './components/Controls'
import { StrategyCard } from './components/StrategyCard'
import { CROP_BY_ID } from './data/crops'
import { CUSTOM_PRESET_ID, PRESETS } from './data/presets'
import { RAIN_CHECK } from './data/rainfallCheck'
import type { Preset } from './data/presets'
import {
  annualStats,
  applyElevation,
  elevationOffset,
  linearTrend,
  monthlyClimatology,
  NO_SCENARIO,
} from './lib/climate'
import { LandsatPanel } from './components/LandsatPanel'
import { ModisPanel } from './components/ModisPanel'
import { VegetationChart } from './components/VegetationChart'
import { explain, monthName as monthLabel, satelliteLine, slotLabel, slotStartMonth } from './lib/explain'
import { loadDaily } from './lib/power'
import { buildSlotTable, buildStrategies, bestStartMonth, SLOT_MONTHS } from './lib/rotation'
import { loadBundledNdvi, monthlyNdvi, slotNdvi } from './lib/satellite'
import { UNKNOWN_SOIL } from './lib/soil'
import type { NdviFile } from './lib/satellite'
import { DEFAULT_WEIGHTS } from './state'
import type { Inputs } from './state'
import type { DailySeries } from './types'

const START_YEAR = 2005
const END_YEAR = 2024

type Failed = { status: 'error'; error: string }
type Ready = {
  status: 'ready'
  series: DailySeries
  gridElevationM: number | null
  fromCache: boolean
}
type Data = { status: 'loading' } | Failed | Ready
type Result = (Failed | Ready) & { key: string }

function fromPreset(p: Preset, prev?: Inputs): Inputs {
  return {
    presetId: p.id,
    lat: p.lat,
    lon: p.lon,
    mode: p.mode,
    irrigated: p.irrigated,
    elevationM: p.elevationM ?? null,
    current: p.current,
    allowed: p.crops,
    weights: prev?.weights ?? DEFAULT_WEIGHTS,
    soil: UNKNOWN_SOIL, // soil belongs to a place: never carried over to another location
    soilSource: 'manual',
    scenario: prev?.scenario ?? NO_SCENARIO,
    startMonth: 'auto',
  }
}

function App() {
  const [inputs, setInputs] = useState<Inputs>(() => fromPreset(PRESETS[0]))
  const [site, setSite] = useState({ lat: PRESETS[0].lat, lon: PRESETS[0].lon })
  const [result, setResult] = useState<Result | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [ndvi, setNdvi] = useState<{ id: string; file: NdviFile | null } | null>(null)

  // Bundled satellite vegetation exists only for the demo locations.
  useEffect(() => {
    let cancelled = false
    const id = inputs.presetId
    loadBundledNdvi(id).then((file) => {
      if (!cancelled) setNdvi({ id, file })
    })
    return () => {
      cancelled = true
    }
  }, [inputs.presetId])
  const ndviFile = ndvi && ndvi.id === inputs.presetId ? ndvi.file : null

  // A result only counts if it belongs to the location/attempt currently requested.
  const requestKey = `${site.lat},${site.lon},${reloadKey}`
  const data: Data =
    formError !== null
      ? { status: 'error', error: formError }
      : result && result.key === requestKey
        ? result
        : { status: 'loading' }

  useEffect(() => {
    const ctrl = new AbortController()
    loadDaily(site.lat, site.lon, START_YEAR, END_YEAR, ctrl.signal)
      .then((r) =>
        setResult({
          key: requestKey,
          status: 'ready',
          series: r.series,
          gridElevationM: r.gridElevationM,
          fromCache: r.fromCache,
        }),
      )
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setResult({ key: requestKey, status: 'error', error: e.message })
      })
    return () => ctrl.abort()
  }, [site, requestKey])

  const patch = (p: Partial<Inputs>) => setInputs((prev) => ({ ...prev, ...p }))

  const onPreset = (id: string) => {
    setFormError(null)
    if (id === CUSTOM_PRESET_ID) {
      patch({ presetId: id })
      return
    }
    const p = PRESETS.find((x) => x.id === id)
    if (!p) return
    setInputs((prev) => fromPreset(p, prev))
    setSite({ lat: p.lat, lon: p.lon })
  }

  const onLoadCustom = () => {
    const { lat, lon } = inputs
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      setFormError('Enter a latitude between -90 and 90 and a longitude between -180 and 180.')
      return
    }
    setFormError(null)
    if (lat === site.lat && lon === site.lon) setReloadKey((k) => k + 1)
    else {
      setSite({ lat, lon })
      patch({ soil: UNKNOWN_SOIL, soilSource: 'manual' }) // soil belongs to the previous location
    }
  }

  // A click on the map: same flow as typing coordinates and pressing "Load data".
  const onPickPoint = (lat: number, lon: number) => {
    setFormError(null)
    // The elevation belonged to the previous location; do not apply it to a new point.
    setInputs((prev) => ({
      ...prev,
      presetId: CUSTOM_PRESET_ID,
      lat,
      lon,
      elevationM: lat === prev.lat && lon === prev.lon ? prev.elevationM : null,
      // Soil also belongs to the previous point.
      ...(lat === prev.lat && lon === prev.lon ? {} : { soil: UNKNOWN_SOIL, soilSource: 'manual' as const }),
    }))
    if (lat === site.lat && lon === site.lon) setReloadKey((k) => k + 1)
    else setSite({ lat, lon })
  }

  const rawSeries = data.status === 'ready' ? data.series : null
  const gridElev = data.status === 'ready' ? data.gridElevationM : null
  const tempOffset = elevationOffset(gridElev, inputs.elevationM)
  // Everything downstream (charts, trends, scores) uses temperatures corrected for elevation.
  const series = useMemo(
    () => (rawSeries ? applyElevation(rawSeries, gridElev, inputs.elevationM) : null),
    [rawSeries, gridElev, inputs.elevationM],
  )
  const currentCrops = useMemo(() => inputs.current.map((id) => CROP_BY_ID[id]), [inputs.current])
  const opts = useMemo(
    () => ({ mode: inputs.mode, irrigated: inputs.irrigated, soil: inputs.soil }),
    [inputs.mode, inputs.irrigated, inputs.soil],
  )

  const autoMonth = useMemo(
    () => (series ? bestStartMonth(series, NO_SCENARIO, currentCrops, opts) : 1),
    [series, currentCrops, opts],
  )
  const start = inputs.startMonth === 'auto' ? autoMonth : inputs.startMonth

  const table = useMemo(
    () => (series ? buildSlotTable(series, inputs.scenario, start, opts) : null),
    [series, inputs.scenario, start, opts],
  )
  const strategies = useMemo(
    () =>
      table
        ? buildStrategies(currentCrops, table, inputs.weights, new Set(inputs.allowed))
        : [],
    [table, currentCrops, inputs.weights, inputs.allowed],
  )

  // What the satellite sees in each season's months (null when this location has no layer).
  // Per-season satellite evidence only makes sense when seasons are different months of the year.
  // In one-crop-per-year mode all three rotation years share one window, so the satellite cannot
  // be attributed to a particular rotation year; it is shown once in the satellite panel instead.
  const slotSat = useMemo(
    () =>
      table && ndviFile && table.mode === 'seasons'
        ? [0, 1, 2].map((i) => slotNdvi(ndviFile, slotStartMonth(table.startMonth, i, table.mode), SLOT_MONTHS))
        : null,
    [table, ndviFile],
  )
  const seasonSat = useMemo(
    () => (table && ndviFile ? slotNdvi(ndviFile, table.startMonth, SLOT_MONTHS) : null),
    [table, ndviFile],
  )
  const ndviMonths = useMemo(() => (ndviFile ? monthlyNdvi(ndviFile) : null), [ndviFile])

  const climate = useMemo(() => {
    if (!series) return null
    const ann = annualStats(series)
    const years = ann.map((a) => a.year)
    return {
      months: monthlyClimatology(series),
      temp: linearTrend(years, ann.map((a) => a.tmean)),
      rain: linearTrend(years, ann.map((a) => a.rainMm)),
      years: ann.length,
    }
  }, [series])

  const baseline = strategies[0]?.result.overall ?? 0

  return (
    <div className="app">
      <header className="app-header">
        <h1>Crop Rotation Explorer</h1>
        <p className="lede">
          Compare crop rotations for your farm using 20 years of NASA satellite and model
          data for your location. It highlights patterns and options; it does not replace
          your own judgment or local agricultural advice.
        </p>
      </header>

      <div className="layout">
        <aside>
          <Controls
            inputs={inputs}
            onPickPoint={onPickPoint}
            autoMonth={autoMonth}
            onChange={patch}
            onPreset={onPreset}
            onLoadCustom={onLoadCustom}
            loading={data.status === 'loading'}
            gridElevationM={gridElev}
          />
        </aside>

        <main className="app-main">
          {data.status === 'loading' && <p className="status" role="status">Loading 20 years of NASA POWER data…</p>}
          {data.status === 'error' && (
            <div className="status error" role="alert">
              <p>{data.error}</p>
              <button type="button" onClick={() => { setFormError(null); setReloadKey((k) => k + 1) }}>Try again</button>
            </div>
          )}

          {data.status === 'ready' && climate && table && (
            <>
              <section className="card">
                <h2>Climate at this location</h2>
                <ClimateChart months={climate.months} />
                <p className="legend">
                  <span className="key bar-key" /> Rainfall per month (mm) &nbsp;
                  <span className="key line-key" /> Average temperature (°C)
                </p>
                <ul className="plain-list">
                  <li>
                    Temperature trend:{' '}
                    <strong>{(climate.temp.slope * 10).toFixed(2)} °C per decade</strong>{' '}
                    {climate.temp.significant ? '(unlikely to be chance)' : '(within normal year-to-year variation)'}.
                  </li>
                  <li>
                    Rainfall trend:{' '}
                    <strong>{Math.round(climate.rain.slope * 10)} mm per decade</strong>{' '}
                    {climate.rain.significant ? '(unlikely to be chance)' : '(within normal variation)'}.
                    Satellite-era rainfall products can change over time, so treat this trend with care.
                  </li>
                  {tempOffset !== 0 && (
                    <li>
                      Temperatures adjusted by <strong>{tempOffset > 0 ? '+' : ''}{tempOffset.toFixed(1)} °C</strong>:
                      your field is at {inputs.elevationM} m but NASA’s grid cell is at about {Math.round(gridElev ?? 0)} m
                      (air cools roughly 6.5 °C per 1,000 m). Rainfall is not adjusted.
                    </li>
                  )}
                  <li>
                    Based on {climate.years} complete years of daily NASA POWER data
                    ({START_YEAR}–{END_YEAR}){data.fromCache ? ', loaded from this device’s saved copy' : ''}.
                  </li>
                </ul>
              </section>

              <section className="card">
                <h2>What the satellite sees</h2>
                {ndviFile && ndviMonths ? (
                  <>
                    <VegetationChart months={ndviMonths} />
                    <p className="legend">
                      <span className="key bar-key green" /> Average greenness (NDVI) per month &nbsp;
                      <span className="key bar-key sparse" /> Sparse or bare (below 0.3, dashed line) &nbsp; thin line = range across years
                    </p>
                    <ul className="plain-list">
                      <li>
                        {(() => {
                          const sparse = ndviMonths.filter((m) => Number.isFinite(m.mean) && m.mean < 0.3)
                          return sparse.length
                            ? `Typically sparse or bare in: ${sparse.map((m) => monthLabel(m.month)).join(', ')}. These are the months when soil is most exposed.`
                            : 'No month is typically sparse or bare at this point (average NDVI stays at 0.3 or above).'
                        })()}
                      </li>
                      {table.mode === 'years' && seasonSat && (
                        <li>
                          Your main growing season ({slotLabel(table.startMonth, 0, table.mode)}):{' '}
                          {satelliteLine(seasonSat)} This is one window shared by all three rotation years.
                        </li>
                      )}
                      <li>
                        Data: {ndviFile.source}, {ndviFile.years[0]}–{ndviFile.years[1]}, one MODIS pixel (250 m
                        product, {ndviFile.pixelMetres ?? 250} m cell) at {ndviFile.latitude}, {ndviFile.longitude}
                        {ndviFile.landCover
                          ? `; MODIS land cover there is “${ndviFile.landCover.label}” (${ndviFile.landCover.year}).`
                          : '.'}{' '}
                        Downloaded {ndviFile.fetched}; bundled because the live service is too slow to call in the app.
                      </li>
                      <li>
                        It describes what is growing at that point, not your field, and is not used to score rotations.
                      </li>
                    </ul>
                  </>
                ) : (
                  <p className="muted">
                    No satellite vegetation layer for this location. It is bundled only for demo locations whose
                    MODIS pixel is verified farmland, because the live MODIS service takes 20–60 seconds per request.
                  </p>
                )}
                <LandsatPanel presetId={inputs.presetId} />
                <ModisPanel presetId={inputs.presetId} startMonth={table.startMonth} mode={table.mode} />
              </section>

              {(inputs.scenario.dTemp !== 0 || inputs.scenario.rainPct !== 0) && (
                <p className="banner" role="status">
                  What-if mode: scores below assume {inputs.scenario.dTemp > 0 ? '+' : ''}
                  {inputs.scenario.dTemp} °C and {inputs.scenario.rainPct > 0 ? '+' : ''}
                  {inputs.scenario.rainPct}% rainfall compared with the past 20 years.
                </p>
              )}

              <h2 className="section-title">Rotation strategies compared</h2>
              {strategies.length < 4 && (
                <p className="banner" role="status">
                  Select more crops you can grow (at least two that are not cover crops or fallow) to see all alternatives.
                </p>
              )}
              <div className="grid">
                {strategies.map((s) => (
                  <StrategyCard
                    key={s.id}
                    strategy={s}
                    explanation={explain(s, strategies[0].result, table, slotSat, ndviFile !== null, inputs.soilSource === 'soilgrids', RAIN_CHECK[inputs.presetId] ?? null)}
                    table={table}
                    satellite={slotSat}
                    baseline={baseline}
                  />
                ))}
              </div>
            </>
          )}
        </main>
      </div>

      <footer className="app-footer">
        <details>
          <summary>How this works, data sources and limits</summary>
          <ul className="plain-list">
            <li>
              Climate data: <a href="https://power.larc.nasa.gov/" target="_blank" rel="noreferrer">NASA POWER</a>{' '}
              (Prediction Of Worldwide Energy Resources, NASA Langley Research Center): daily air temperature,
              rainfall, root-zone soil wetness and evapotranspiration, {START_YEAR}–{END_YEAR}.
            </li>
            <li>
              Other data: MODIS vegetation, evapotranspiration, temperature and growing-season dates (NASA, served by the
              ORNL DAAC), Landsat and NASADEM elevation (NASA/USGS, served by Microsoft Planetary Computer) and NASA GIBS
              imagery. These satellite layers are bundled for the demo sites only. Soil can come from ISRIC SoilGrids
              (not NASA, beta). Crop requirements come from FAO tables.
            </li>
            <li>
              Each crop is scored for each season on temperature, cold and heat stress, and water supply versus need,
              for every past year; need is estimated from local temperature (FAO-56). Rotations are then scored on soil
              health, water demand, reliability and income.
            </li>
            <li>
              Crop characteristics are approximate reference values and must be checked locally.
              Not included: satellite data outside the demo sites or in the scores (it is shown as evidence only),
              SMAP soil moisture, measured soil data for your field, and prices.
            </li>
            <li>
              Built with help from AI tools (Claude by Anthropic) for code and wording; the team reviewed the results.
            </li>
          </ul>
        </details>
      </footer>
    </div>
  )
}

export default App
