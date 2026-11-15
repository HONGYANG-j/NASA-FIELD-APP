import { useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import './App.css'
import './components/Extras.css'
import { BackToTop } from './components/BackToTop'
import { Credits } from './components/Credits'
import { DataRoles } from './components/DataRoles'
import { EvidencePanel, ModelCard } from './components/Evidence'
import { Guide, Hero } from './components/Guide'
import { PageNav, PageTabs, Pagination, Skeleton, TopBar } from './components/Chrome'
import type { PageId } from './components/Chrome'
import { RankList } from './components/RankList'
import { CompareCard } from './components/Insights'
import { OfflineCard } from './components/OfflineCard'
import { resultsCsv, whyFirst } from './lib/insights'
import { useOnline } from './lib/offline'
import { forgetFarm, inputsFromSaved, loadSaved, saveFarm } from './lib/savedFarm'
import type { SavedFarm } from './lib/savedFarm'
import { SensitivityCard } from './components/SensitivityCard'
import { sensitivityCheck } from './lib/sensitivity'
import type { Sensitivity } from './lib/sensitivity'
import { AssistantPage } from './components/AssistantPage'
import { StartScreen } from './components/StartScreen'
import type { FillMode } from './components/StartScreen'
import { fetchAssistStatus } from './lib/assistClient'
import type { AssistStatus } from './lib/assistClient'
import { applyPatch } from './lib/assistSchema'
import { useMedia } from './lib/useMedia'
import { ScoreRing } from './components/ScoreRing'
import { ShareBar } from './components/ShareBar'
import { decodeShare, encodeShare } from './lib/share'
import { ClimateChart } from './components/ClimateChart'
import { PermanentCard } from './components/PermanentCard'
import { permanentCheck } from './lib/permanent'
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
import { SmapPanel } from './components/SmapPanel'
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
  snapshotDate: string | null
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

/** Starting setup: a valid share link in the address (see lib/share.ts) or the first demo preset. */
function initialSetup(): Inputs {
  const shared = decodeShare(window.location.search)
  if (!shared) return fromPreset(PRESETS[0])
  const preset = PRESETS.find((p) => p.id === shared.presetId)
  const base = fromPreset(preset ?? PRESETS[0])
  const merged: Inputs = {
    ...base,
    ...shared,
    presetId: shared.presetId ?? base.presetId,
    elevationM: shared.elevationM ?? base.elevationM,
    current: shared.current ?? base.current,
  }
  // The crops of the current rotation must be among the crops offered.
  merged.allowed = Array.from(new Set([...base.allowed, ...merged.current]))
  return merged
}

const PAGE_IDS: PageId[] = ['start', 'summary', 'climate', 'satellite', 'rotations', 'data']

/** The page named in the address (#/climate). With none: the summary for a share link, otherwise the start screen. */
function readTab(): PageId {
  const id = window.location.hash.replace(/^#\/?/, '')
  if ((PAGE_IDS as string[]).includes(id)) return id as PageId
  if (id === 'assistant' || id === 'setup') return 'start'
  return decodeShare(window.location.search) ? 'summary' : 'start'
}

/** Name of the chosen place, or null for a point that has not been chosen yet. */
function placeLabel(i: Inputs): string {
  return i.presetId === CUSTOM_PRESET_ID ? `Custom point ${i.lat}, ${i.lon}` : (PRESETS.find((p) => p.id === i.presetId)?.name ?? '')
}

function App() {
  const [inputs, setInputs] = useState<Inputs>(initialSetup)
  const [site, setSite] = useState(() => {
    const i = initialSetup()
    return { lat: i.lat, lon: i.lon }
  })
  // The satellite section starts closed on a phone, where the page is long.
  const [satOpen, setSatOpen] = useState(() => !window.matchMedia('(max-width: 860px)').matches)
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
          snapshotDate: r.snapshotDate,
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

  const onLoadCustom = (): boolean => {
    const { lat, lon } = inputs
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      setFormError('Enter a latitude between -90 and 90 and a longitude between -180 and 180.')
      return false
    }
    setFormError(null)
    if (lat === site.lat && lon === site.lon) setReloadKey((k) => k + 1)
    else {
      setSite({ lat, lon })
      patch({ soil: UNKNOWN_SOIL, soilSource: 'manual' }) // soil belongs to the previous location
    }
    return true
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

  // Temperature check for crops that stay in the ground for years. Uses the past record (elevation-corrected), not the what-if series.
  const permanent = useMemo(() => (series ? permanentCheck(series, inputs.scenario.dTemp) : null), [series, inputs.scenario.dTemp])

  const baseline = strategies[0]?.result.overall ?? 0
  // The highest-scoring alternative to the current rotation (the first strategy is always the current one).
  const bestAlt = strategies.slice(1).reduce<(typeof strategies)[number] | null>((a, b) => (!a || b.result.overall > a.result.overall ? b : a), null)
  const bestBeatsCurrent = bestAlt !== null && bestAlt.result.overall > baseline + 0.5

  const placeName =
    inputs.presetId === CUSTOM_PRESET_ID
      ? `Custom point ${inputs.lat}, ${inputs.lon}`
      : (PRESETS.find((p) => p.id === inputs.presetId)?.name ?? '')
  const isMobile = useMedia('(max-width: 860px)')
  const [tabRaw, setTabRaw] = useState<PageId>(readTab)
  // The results stay locked until a place has been chosen on the first page. A share link or a results address counts as chosen.
  const [picked, setPicked] = useState<string | null>(() => (readTab() !== 'start' ? placeLabel(inputs) : null))
  // A searched place keeps its name in the header; a typed or clicked point shows its coordinates.
  const shownPlace = inputs.presetId === CUSTOM_PRESET_ID && picked && !picked.startsWith('Custom point') ? picked : placeName
  const [fill, setFill] = useState<FillMode>('ai')
  const [fillTouched, setFillTouched] = useState(false)
  // "Save my farm on this device": remembered in this browser only, offered again on the next visit (not when a share link is opened).
  const [saved, setSaved] = useState<SavedFarm | null>(() => (decodeShare(window.location.search) ? null : loadSaved()))
  // 'auto': remember changes. 'sharedView': opened from a share link, so nothing is saved until the visitor chooses a place of their own. 'forgotten': the visitor pressed Forget it.
  const [saveState, setSaveState] = useState<'auto' | 'sharedView' | 'forgotten'>(() => (decodeShare(window.location.search) ? 'sharedView' : 'auto'))
  const saveOn = saveState === 'auto'
  const choseOwnPlace = () => setSaveState((s) => (s === 'sharedView' ? 'auto' : s))
  useEffect(() => {
    if (picked !== null && saveOn) saveFarm(inputs, shownPlace)
  }, [inputs, picked, saveOn, shownPlace])
  const resumeSaved = () => {
    if (!saved) return
    const next = inputsFromSaved(fromPreset(PRESETS.find((p) => p.id === saved.presetId) ?? PRESETS[0]), saved)
    setFormError(null)
    setInputs(next)
    setSite({ lat: next.lat, lon: next.lon })
    setPicked(saved.label)
    setSaved(null)
    setSaveState('auto')
  }
  const forgetSaved = () => {
    forgetFarm()
    setSaved(null)
    setSaveState('forgotten')
  }
  const online = useOnline()
  useEffect(() => {
    const on = () => {
      const next = readTab()
      // A results address typed before a place is chosen shows the first page, and the address is corrected to match.
      if (picked === null && next !== 'start') {
        window.history.replaceState(null, '', '#/start')
        setTabRaw('start')
      } else setTabRaw(next)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [picked])
  const tab: PageId = picked === null ? 'start' : tabRaw
  /** `placeJustChosen`: the same click has just chosen a place, so the results are allowed even though `picked` has not updated yet. */
  const goTo = (id: PageId, placeJustChosen = false) => {
    if (id !== 'start' && picked === null && !placeJustChosen) return
    if (window.location.hash !== `#/${id}`) window.history.pushState(null, '', `#/${id}`)
    setTabRaw(id)
    window.scrollTo({ top: 0 })
  }
  // "See my results": coordinates typed but not yet loaded are loaded first, so the results always match what is on screen.
  const showResults = () => {
    if (inputs.presetId === CUSTOM_PRESET_ID && (inputs.lat !== site.lat || inputs.lon !== site.lon)) {
      if (!onLoadCustom()) return
      setPicked(`Custom point ${inputs.lat}, ${inputs.lon}`)
      choseOwnPlace()
    }
    goTo('summary')
  }
  // Sensitivity check: run in the background (about 0.6 s) once the Summary page is open, and show it only for the inputs it was run for.
  const sensKey = JSON.stringify([site, start, inputs.scenario, inputs.weights, inputs.allowed, inputs.current, inputs.mode, inputs.irrigated, inputs.soil, inputs.elevationM])
  const [sens, setSens] = useState<{ key: string; value: Sensitivity | null } | null>(null)
  useEffect(() => {
    if (!series || tab !== 'summary' || sens?.key === sensKey) return
    const id = window.setTimeout(() => {
      const value = sensitivityCheck(series, inputs.scenario, start, opts, currentCrops, inputs.weights, new Set(inputs.allowed))
      setSens({ key: sensKey, value })
    }, 60)
    return () => window.clearTimeout(id)
  }, [series, tab, sensKey, sens, start, opts, currentCrops, inputs.scenario, inputs.weights, inputs.allowed])
  const sensNow = sens && sens.key === sensKey ? sens : null

  const [cardPage, setCardPage] = useState(1)
  const pageSize = isMobile ? 1 : 2
  const cardPages = Math.max(1, Math.ceil(strategies.length / pageSize))
  const shownCardPage = Math.min(cardPage, cardPages)
  // Printing shows every rotation and every section, not only the page on screen.
  const [printAll, setPrintAll] = useState(false)
  useEffect(() => {
    const before = () => flushSync(() => { setPrintAll(true); setSatOpen(true) })
    const after = () => setPrintAll(false)
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [])
  const shownStrategies = printAll ? strategies : strategies.slice((shownCardPage - 1) * pageSize, shownCardPage * pageSize)
  const openStrategy = (index: number) => {
    setCardPage(Math.floor(index / pageSize) + 1)
    goTo('rotations')
  }
  const panel = (id: PageId) => ({ id: `page-${id}`, role: 'tabpanel', 'aria-labelledby': `tab-${id}`, hidden: tab !== id, className: 'page-panel' })
  const ready = data.status === 'ready'
  // Is the AI assistant switched on for this site? (null while we ask)
  const [assistStatus, setAssistStatus] = useState<AssistStatus | null>(null)
  // Until the visitor picks, open the AI if it is switched on and the form if it is not.
  const fillShown: FillMode = fillTouched ? fill : assistStatus && !assistStatus.configured ? 'manual' : fill
  useEffect(() => {
    const ctrl = new AbortController()
    fetchAssistStatus(ctrl.signal).then((s) => {
      if (!ctrl.signal.aborted) setAssistStatus(s)
    })
    return () => ctrl.abort()
  }, [])

  return (
    <>
      <TopBar place={shownPlace} onShare={() => goTo('data')} />
      {!online && (
        <p className="offline-bar app-offline" role="status">
          You are offline. The demo sites still open if this device has them; other places, the place search, the map and the AI assistant need a connection.
        </p>
      )}
      <div className="app">
        <PageTabs tab={tab} onChange={goTo} locked={picked === null} />

        <div hidden={tab !== 'start'}>
          <StartScreen
            inputs={inputs}
            loading={data.status === 'loading'}
            failed={data.status === 'error'}
            picked={picked}
            onPicked={(label) => {
              setPicked(label)
              choseOwnPlace()
            }}
            onPreset={onPreset}
            onPickPoint={onPickPoint}
            onSearchPick={(lat, lon, label) => {
              onPickPoint(lat, lon)
              setPicked(label)
              choseOwnPlace()
            }}
            onLoadCustom={onLoadCustom}
            formError={formError}
            onChange={patch}
            fill={fillShown}
            onFill={(m) => { setFill(m); setFillTouched(true) }}
            ai={
              <AssistantPage
                inputs={inputs}
                place={inputs.presetId === CUSTOM_PRESET_ID ? 'a custom point chosen by the user' : placeName}
                status={assistStatus}
                onApply={(p) => setInputs((prev) => applyPatch(prev, p))}
                onSeeResults={showResults}
                onSetup={() => { setFill('manual'); setFillTouched(true) }}
              />
            }
            manual={
              <Controls
                inputs={inputs}
                onPickPoint={onPickPoint}
                autoMonth={autoMonth}
                onChange={patch}
                onPreset={onPreset}
                onLoadCustom={onLoadCustom}
                loading={data.status === 'loading'}
                gridElevationM={gridElev}
                hideLocation
              />
            }
            onShowResults={showResults}
            savedLabel={saved?.label ?? null}
            onResume={resumeSaved}
            remembered={saveOn}
            onForget={forgetSaved}
            onSkip={() => {
              onPreset('kedah')
              setPicked(PRESETS[0].name)
              choseOwnPlace()
              goTo('summary', true)
            }}
          />
        </div>
        {tab !== 'start' && (
        <div className="results">

          <main className="app-main">
            {data.status === 'loading' && <Skeleton />}
            {data.status === 'error' && (
              <div className="status error" role="alert">
                <p>{data.error}</p>
                <button type="button" onClick={() => { setFormError(null); setReloadKey((k) => k + 1) }}>Try again</button>
              </div>
            )}

            <div {...panel('summary')}>
              <Hero />
              <Guide />
              {data.status === 'ready' && climate && table && (
                <>
                  <p className="print-only">
                    Setup: {shownPlace} ({site.lat}, {site.lon}); {inputs.mode === 'seasons' ? '3 seasons per year' : '1 main crop per year, 3-year cycle'};
                    {inputs.irrigated ? ' irrigation available' : ' rainfed'}; current rotation: {inputs.current.map((c) => CROP_BY_ID[c]?.name ?? c).join(', ')}.
                    Printed from {window.location.origin}.
                  </p>
                  <section className="setup-summary" aria-label="Your setup">
                    <span className="chip-static">{shownPlace}</span>
                    <span className="chip-static">{inputs.current.map((c) => CROP_BY_ID[c]?.name ?? c).join(' → ')}</span>
                    <span className="chip-static">{inputs.irrigated ? 'Irrigation available' : 'Rainfed'}</span>
                    <button type="button" className="ghost" onClick={() => goTo('start')}>Edit your farm</button>
                  </section>
                  {bestAlt && (
                    <section className="glance" aria-label="Result at a glance">
                      <div className="glance-rings">
                        <div>
                          <ScoreRing value={baseline} label={`Current rotation scores ${Math.round(baseline)} out of 100`} muted />
                          <div className="ring-cap">Current</div>
                        </div>
                        <span className="glance-vs" aria-hidden="true">→</span>
                        <div>
                          <ScoreRing value={bestAlt.result.overall} label={`${bestAlt.title} scores ${Math.round(bestAlt.result.overall)} out of 100`} />
                          <div className="ring-cap">Highest alternative</div>
                        </div>
                      </div>
                      <div>
                        <h2>At a glance</h2>
                        {bestBeatsCurrent ? (
                          <p>
                            For your priorities, <strong>{bestAlt.title}</strong> scores{' '}
                            <strong>{Math.round(bestAlt.result.overall) - Math.round(baseline)} points higher</strong> than your current rotation:
                          </p>
                        ) : (
                          <p>Your current rotation scores as high as any alternative found for your priorities. The best alternative is:</p>
                        )}
                        <p className="path">{bestAlt.result.crops.map((c) => c.name).join(' → ')}</p>
                        {bestBeatsCurrent && (
                          <ul className="why-first" aria-label="Why it comes first">
                            {whyFirst(bestAlt, strategies[0]).map((line) => <li key={line}>{line}</li>)}
                          </ul>
                        )}
                        <p className="fine">
                          Scores rank options for your inputs and 20 years of NASA POWER weather. They are not yield forecasts.
                        </p>
                      </div>
                    </section>
                  )}
                  {(inputs.scenario.dTemp !== 0 || inputs.scenario.rainPct !== 0) && (
                    <p className="banner" role="status">
                      What-if mode: scores below assume {inputs.scenario.dTemp > 0 ? '+' : ''}
                      {inputs.scenario.dTemp} °C and {inputs.scenario.rainPct > 0 ? '+' : ''}
                      {inputs.scenario.rainPct}% rainfall compared with the past 20 years.
                    </p>
                  )}
                  <RankList strategies={strategies} baseline={baseline} bestId={bestBeatsCurrent ? (bestAlt?.id ?? null) : null} onOpen={openStrategy} />
                  {bestAlt && !(sensNow && sensNow.value === null) && (
                    <SensitivityCard result={sensNow?.value ?? null} topNames={bestAlt.result.crops.map((c) => c.name).join(' → ')} />
                  )}
                  <PageNav tab="summary" onChange={goTo} />
                </>
              )}
            </div>

            <div {...panel('climate')}>
              {data.status === 'ready' && climate && table && (
                <>
                  <section className="card" id="climate">
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
                        ({START_YEAR}–{END_YEAR}){data.snapshotDate ? `, from a copy of the NASA POWER data downloaded on ${data.snapshotDate} and bundled with the app` : data.fromCache ? ', loaded from this device’s saved copy' : ', fetched live from NASA POWER'}.
                      </li>
                    </ul>
                  </section>
                  {permanent && <PermanentCard result={permanent} userDTemp={inputs.scenario.dTemp} />}
                  <PageNav tab="climate" onChange={goTo} />
                </>
              )}
            </div>

            <div {...panel('satellite')}>
              {data.status === 'ready' && climate && table && (
                <>
                  <section className="card" id="satellite">
                    <details className="sat-details" open={satOpen} onToggle={(e) => setSatOpen(e.currentTarget.open)}>
                      <summary><h2>What the satellite sees</h2></summary>
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
                      <SmapPanel presetId={inputs.presetId} />
                    </details>
                  </section>
                  <PageNav tab="satellite" onChange={goTo} />
                </>
              )}
            </div>

            <div {...panel('rotations')}>
              {data.status === 'ready' && climate && table && (
                <>
                  {(inputs.scenario.dTemp !== 0 || inputs.scenario.rainPct !== 0) && (
                    <p className="banner" role="status">
                      What-if mode: scores below assume {inputs.scenario.dTemp > 0 ? '+' : ''}
                      {inputs.scenario.dTemp} °C and {inputs.scenario.rainPct > 0 ? '+' : ''}
                      {inputs.scenario.rainPct}% rainfall compared with the past 20 years.
                    </p>
                  )}
                  <h2 className="section-title" id="rotations">Rotation strategies compared</h2>
                  {strategies.length < 4 && (
                    <p className="banner" role="status">
                      Select more crops you can grow (at least two that are not cover crops or fallow) to see all alternatives.
                    </p>
                  )}
                  <div className="grid">
                    {shownStrategies.map((s) => (
                      <StrategyCard
                        key={s.id}
                        strategy={s}
                        explanation={explain(s, strategies[0].result, table, slotSat, ndviFile !== null, inputs.soilSource === 'soilgrids', RAIN_CHECK[inputs.presetId] ?? null)}
                        table={table}
                        satellite={slotSat}
                        baseline={baseline}
                        highlight={bestBeatsCurrent && s.id === bestAlt?.id}
                      />
                    ))}
                  </div>
                  <Pagination page={shownCardPage} pageSize={pageSize} total={strategies.length} onChange={(p) => { setCardPage(p); window.scrollTo({ top: 0 }) }} />
                  <CompareCard strategies={strategies} table={table} bestId={bestAlt?.id ?? null} />
                  <PageNav tab="rotations" onChange={goTo} />
                </>
              )}
            </div>

            <div {...panel('data')}>
              {ready && (
                <>
                  <DataRoles />
                  <EvidencePanel />
                  <ModelCard />
                  <ShareBar
                    inputs={inputs}
                    beforePrint={() => flushSync(() => setSatOpen(true))}
                    csv={() =>
                      table && strategies.length
                        ? {
                            name: 'plant-vs-climate-results.csv',
                            text: resultsCsv(strategies, {
                              appName: 'Plant vs Climate',
                              place: shownPlace,
                              lat: site.lat,
                              lon: site.lon,
                              mode: table.mode === 'seasons' ? '3 seasons per year' : '1 main crop per year, 3-year cycle',
                              irrigated: inputs.irrigated,
                              startMonth: table.startMonth,
                              whatIf: inputs.scenario,
                              url: `${window.location.origin}${window.location.pathname}?${encodeShare(inputs)}`,
                              date: new Date().toLocaleDateString('en-CA'),
                            }),
                          }
                        : null
                    }
                  />
                  <OfflineCard />
                </>
              )}
              <section className="card local-advice" id="advice">
                <h2>Get local advice</h2>
                <p>
                  Use these results to prepare questions, not to decide. Show them to someone who knows your land: in Malaysia, the
                  Department of Agriculture (Jabatan Pertanian,{' '}
                  <a href="https://www.doa.gov.my/" target="_blank" rel="noreferrer">doa.gov.my</a>) provides agricultural extension
                  services, so ask for the extension officer for your district or state. Elsewhere, ask your national or regional
                  agricultural extension service. The contact details of an office are not listed here because we have not verified them.
                </p>
              </section>
              <PageNav tab="data" onChange={goTo} />
            </div>
          </main>
        </div>
        )}

        <footer className="app-footer">
          <p className="muted privacy">
            <strong>Plant vs Climate</strong> by team ApaSpace, a NASA Space Apps Challenge 2026 entry (Kuala Lumpur) for the challenge “Field Shift:
            Adapting Farms with NASA Data”. Privacy: there are no accounts, ads or tracking code in this app. For the three demo sites the climate data is a copy bundled with the app, so nothing about
            your visit is sent to NASA; for any other point the location you choose is sent from your browser to NASA POWER, to Open-Meteo’s place search only if you type a place name and press Search, and to ISRIC SoilGrids only if you press the soil button (“Use my location” is read by your browser only, and just a point rounded to about 1 km is used); map pictures
            come from NASA GIBS. If you use the optional AI assistant, the messages you type and a short summary of the setup form (never
            your coordinates) go through this site’s server to Groq, which runs an open-weight model to write the replies; do not type
            personal details. Downloaded climate data and your farm setup are saved on your own device only (you can press “Forget it” on the first page), and the app keeps a copy of itself there so it can open offline. The site is hosted on
            Cloudflare, which, like any web host, can see that a page was requested.
          </p>
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
                ORNL DAAC), SMAP soil moisture (NASA NSIDC DAAC; Kedah, 2024 only), Landsat and NASADEM elevation (NASA/USGS, served by Microsoft Planetary Computer) and NASA GIBS
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
                SMAP soil moisture other than one year (2024) for Kedah, measured soil data for your field, and prices.
              </li>
              <li>
                Built with help from AI tools (Claude by Anthropic) for code and wording; the team reviewed the results.
              </li>
            </ul>
          </details>
          <Credits />
        </footer>
        <BackToTop />
      </div>
    </>
  )
}

export default App
