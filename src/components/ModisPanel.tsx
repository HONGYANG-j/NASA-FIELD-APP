import { useEffect, useMemo, useState } from 'react'
import { monthName, slotLabel, slotName, slotStartMonth } from '../lib/explain'
import { SLOT_MONTHS } from '../lib/rotation'
import type { RotationMode } from '../lib/rotation'
import { growingSeasons, loadBundledModis, MIN_LST_COMPOSITES, monthlyModis, slotModis } from '../lib/satellite'
import type { ModisFile, ModisKey, SlotStat } from '../lib/satellite'
import { ModisMonthlyChart } from './ModisMonthlyChart'
import { PhenologyChart } from './PhenologyChart'
import './ModisPanel.css'

interface Props {
  presetId: string | undefined
  /** First month (1-12) of season 1 and whether the three slots are seasons or years (same as the strategy table). */
  startMonth: number
  mode: RotationMode
}

interface Loaded {
  id: string
  file: ModisFile | null
}

const WINDOW_DAYS = Math.round(SLOT_MONTHS * 30.4)

function range(s: SlotStat, digits: number): string {
  return s.years > 1 ? ` (${s.min.toFixed(digits)}–${s.max.toFixed(digits)} across composites)` : ''
}

function seasonLine(file: ModisFile, label: string, startMonth: number): string {
  const parts: string[] = []
  const stat = (key: ModisKey) => slotModis(file, key, startMonth, SLOT_MONTHS)
  const et = stat('et')
  if (et) {
    parts.push(
      `evapotranspiration ${et.mean.toFixed(1)} mm/day${range(et, 1)}, about ${Math.round(et.mean * WINDOW_DAYS)} mm over ${SLOT_MONTHS} months (${et.years} seasons)`,
    )
  }
  // Surface temperature has no value under cloud, so a season needs only a quarter of its composites to count.
  const day = slotModis(file, 'lstDay', startMonth, SLOT_MONTHS, 0.25)
  const night = slotModis(file, 'lstNight', startMonth, SLOT_MONTHS, 0.25)
  if (day) {
    parts.push(
      `daytime surface ${day.mean.toFixed(1)} °C${night ? `, night ${night.mean.toFixed(1)} °C` : ''} (clear-sky composites only: ${day.n} daytime in ${day.years} seasons${night ? `, ${night.n} night in ${night.years}` : ''})`,
    )
  }
  const lai = stat('lai')
  if (lai) parts.push(`leaf area index ${lai.mean.toFixed(1)} on average, up to ${lai.max.toFixed(1)}${range(lai, 1)} (${lai.years} seasons)`)
  return parts.length ? `${label}: ${parts.join('; ')}.` : `${label}: not enough clear composites to describe this window.`
}

/**
 * MODIS evapotranspiration, land-surface temperature, leaf area and growing-season dates for a demo location.
 * Descriptive evidence only: none of it feeds the rotation scores. Loads its own bundled file.
 */
export function ModisPanel({ presetId, startMonth, mode }: Props) {
  const [state, setState] = useState<Loaded | null>(null)

  useEffect(() => {
    if (!presetId) return
    let cancelled = false
    loadBundledModis(presetId).then((file) => {
      if (!cancelled) setState({ id: presetId, file })
    })
    return () => {
      cancelled = true
    }
  }, [presetId])

  const file = state && state.id === presetId ? state.file : null
  const months = useMemo(
    () =>
      file
        ? {
            et: monthlyModis(file, 'et'),
            day: monthlyModis(file, 'lstDay', MIN_LST_COMPOSITES),
            night: monthlyModis(file, 'lstNight', MIN_LST_COMPOSITES),
            lai: monthlyModis(file, 'lai'),
          }
        : null,
    [file],
  )
  const seasons = useMemo(() => (file ? growingSeasons(file) : []), [file])

  if (!presetId || !state || state.id !== presetId) return null
  if (!file || !months) {
    return (
      <div className="modis-panel">
        <h3>Water use, surface heat, leaf area and season dates (MODIS)</h3>
        <p className="muted">
          Not bundled for this location: the MODIS evapotranspiration, surface-temperature, leaf-area and season-date
          series were downloaded only for the two demo points whose MODIS pixel is verified cropland (Kedah and Iowa),
          because the live service takes seconds to minutes per request.
        </p>
      </div>
    )
  }

  const et = file.series.et
  const lst = file.series.lstDay
  const lai = file.series.lai
  const windows = mode === 'seasons' ? [0, 1, 2] : [0]
  const peakMonth = (ms: { month: number; mean: number }[]) =>
    ms.filter((m) => Number.isFinite(m.mean)).reduce((a, b) => (b.mean > a.mean ? b : a))
  const etLo = Math.min(...months.et.filter((m) => Number.isFinite(m.mean)).map((m) => m.mean))
  const etHi = peakMonth(months.et)
  const laiHi = peakMonth(months.lai)

  return (
    <div className="modis-panel">
      <h3>Water use, surface heat, leaf area and season dates (MODIS)</h3>
      <p className="descriptive">
        Descriptive evidence about what the land does at one satellite pixel. It is not used to score the rotations and is
        not a measurement of your field.
      </p>

      {et && (
        <>
          <h4>Evapotranspiration (water leaving the ground and crop), mm per day</h4>
          <ModisMonthlyChart
            kind="bars"
            unit="mm/day"
            digits={1}
            series={[{ name: 'Evapotranspiration', cls: 'chart-modis-et', months: months.et }]}
            label={`MODIS evapotranspiration by month, from ${etLo.toFixed(1)} mm per day to ${etHi.mean.toFixed(1)} mm per day in ${monthName(etHi.month)}.`}
          />
          <p className="legend">
            <span className="key bar-key modis-et" /> Average evapotranspiration per month (MOD16A2, {et.years[0]}–{et.years[1]}) &nbsp; thin line = range across 8-day composites
          </p>
        </>
      )}

      {lst && (
        <>
          <h4>Land-surface temperature, °C (day and night)</h4>
          <ModisMonthlyChart
            kind="lines"
            unit="°C"
            digits={1}
            series={[
              { name: 'Daytime', cls: 'chart-modis-day', months: months.day },
              { name: 'Night', cls: 'chart-modis-night', months: months.night },
            ]}
            label={`MODIS land-surface temperature by month: daytime ${Math.min(...months.day.filter((m) => Number.isFinite(m.mean)).map((m) => m.mean)).toFixed(1)} to ${Math.max(...months.day.filter((m) => Number.isFinite(m.mean)).map((m) => m.mean)).toFixed(1)} degrees Celsius.`}
          />
          <p className="legend">
            <span className="key bar-key modis-day" /> Daytime &nbsp; <span className="key bar-key modis-night" /> Night
            (MOD11A2, {lst.years[0]}–{lst.years[1]}). This is the temperature of the ground and plant surface seen from
            space, not the air temperature in the climate chart above, so the two differ. There is no value under cloud, so
            months with fewer than {MIN_LST_COMPOSITES} clear composites in all years are left blank, and the months that
            are shown describe clear-sky days only.
          </p>
        </>
      )}

      {lai && (
        <>
          <h4>Leaf area index (leaf area per ground area)</h4>
          <ModisMonthlyChart
            kind="bars"
            unit="m²/m²"
            digits={1}
            series={[{ name: 'Leaf area index', cls: 'chart-modis-lai', months: months.lai }]}
            label={`MODIS leaf area index by month, peaking at ${laiHi.mean.toFixed(1)} in ${monthName(laiHi.month)}.`}
          />
          <p className="legend">
            <span className="key bar-key modis-lai" /> Average leaf area index per month (MCD15A2H, {lai.years[0]}–{lai.years[1]})
          </p>
        </>
      )}

      {seasons.length > 0 && (
        <>
          <h4>Growing-season dates found by MODIS</h4>
          <PhenologyChart file={file} />
        </>
      )}

      <h4>What this shows for your season windows</h4>
      <ul className="plain-list">
        {windows.map((i) => (
          <li key={i}>
            {seasonLine(
              file,
              mode === 'seasons' ? `${slotName(i, mode)} (${slotLabel(startMonth, i, mode)})` : `Your growing season (${slotLabel(startMonth, 0, mode)})`,
              slotStartMonth(startMonth, i, mode),
            )}
            {mode === 'years' && ' One window shared by all three rotation years.'}
          </li>
        ))}
        <li>
          These are averages over the years downloaded, not forecasts and not scores. Evapotranspiration also depends on
          what is growing, and the pixel is about {et?.pixelMetres ?? 500} m across so it can include more than one crop; it is not the water need of any one crop.
        </li>
        <li>
          Data: MODIS products MOD16A2, MOD11A2, MCD15A2H and MCD12Q2 (NASA LP DAAC) via the ORNL DAAC MODIS web service;
          one pixel at {file.latitude}, {file.longitude}
          {file.landCover
            ? `; MODIS land cover there is “${file.landCover.byYear[file.landCover.byYear.length - 1][2]}” (${file.landCover.byYear[file.landCover.byYear.length - 1][0]})`
            : ''}
          . Pixel size: {et?.pixelMetres ?? 500} m for evapotranspiration, leaf area and season dates, {lst?.pixelMetres ?? 1000} m for
          surface temperature. Downloaded {file.fetched}; bundled because the live service is too slow to call in the app.
          Cloud-quality (QC) bands were not applied: only each product’s documented fill and out-of-range values are dropped.
        </li>
      </ul>
    </div>
  )
}
