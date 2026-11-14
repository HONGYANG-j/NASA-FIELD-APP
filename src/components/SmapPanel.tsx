import { useEffect, useMemo, useState } from 'react'
import { monthName } from '../lib/explain'
import { loadBundledSmap, MIN_SMAP_DAYS, monthlySmap, smapTotals } from '../lib/smap'
import type { SmapFile } from '../lib/smap'
import { ModisMonthlyChart } from './ModisMonthlyChart'
import './SmapPanel.css'

interface Loaded {
  id: string
  file: SmapFile | null
}

/**
 * SMAP soil moisture for a demo location: ONE year of 9 km data, shown month by month as evidence.
 * Not used to score rotations. Renders nothing for locations without a bundled file.
 */
export function SmapPanel({ presetId }: { presetId: string | undefined }) {
  const [state, setState] = useState<Loaded | null>(null)

  useEffect(() => {
    if (!presetId) return
    let cancelled = false
    loadBundledSmap(presetId).then((file) => {
      if (!cancelled) setState({ id: presetId, file })
    })
    return () => {
      cancelled = true
    }
  }, [presetId])

  const file = state && state.id === presetId ? state.file : null
  const months = useMemo(() => (file ? monthlySmap(file) : null), [file])
  const totals = useMemo(() => (file ? smapTotals(file) : null), [file])

  if (!presetId || !state || state.id !== presetId) return null
  if (!file || !months || !totals) {
    return (
      <div className="smap-panel">
        <h3>Soil moisture (SMAP)</h3>
        <p className="muted">
          Not bundled for this location: a year of SMAP soil moisture was ordered only for the Kedah demo site.
        </p>
      </div>
    )
  }

  const valid = months.filter((m) => Number.isFinite(m.mean))
  const lo = valid.reduce((a, b) => (b.mean < a.mean ? b : a))
  const hi = valid.reduce((a, b) => (b.mean > a.mean ? b : a))
  const blank = months.filter((m) => !Number.isFinite(m.mean)).map((m) => monthName(m.month))
  const [w, s, e, n] = file.box

  return (
    <div className="smap-panel">
      <h3>Soil moisture from the SMAP satellite ({file.year} only)</h3>
      <p className="descriptive">
        One year of 9 km soil moisture around the site. It is a rough wetness picture of the top few centimetres of soil
        over an area much larger than a field. It is not used to score the rotations and is not a measurement of your field.
      </p>
      <ModisMonthlyChart
        kind="bars"
        unit="cm³/cm³"
        digits={2}
        series={[{ name: 'Soil moisture', cls: 'chart-smap', months }]}
        label={`SMAP soil moisture by month in ${file.year}, from ${lo.mean.toFixed(2)} in ${monthName(lo.month)} to ${hi.mean.toFixed(2)} in ${monthName(hi.month)}.`}
      />
      <p className="legend">
        <span className="key bar-key smap" /> Average soil moisture per month, {file.year} (volume of water per volume of
        soil) &nbsp; thin line = lowest to highest daily value
      </p>
      <ul className="plain-list">
        <li>
          Driest month {monthName(lo.month)} ({lo.mean.toFixed(2)}), wettest {monthName(hi.month)} ({hi.mean.toFixed(2)}).
          This is a single year, so it shows what that year looked like, not a typical year, and not a trend.
        </li>
        <li>
          SMAP returned a usable value on {totals.usableDays} of {totals.days} days; a month needs at least {MIN_SMAP_DAYS}{' '}
          such days to be drawn
          {blank.length ? ` (left blank: ${blank.join(', ')})` : ''}. A day without a value is one on which no cell in the
          box passed the checks; the satellite does not see every spot every day.
        </li>
        {totals.wetMonths.length > 0 && (
          <li>
            In {totals.wetMonths.map((m) => monthName(m)).join(', ')} more than a fifth of the cells that returned a value
            were above the product’s documented upper limit of {file.validRange[1]} cm³/cm³ (very wet ground or standing
            water). Those cells are left out, so the bars for these months are probably too low rather than too high.
          </li>
        )}
        <li>
          Data: NASA SMAP Enhanced L3 radiometer soil moisture, 9 km, daily (SPL3SMP_E, version 6; NASA NSIDC DAAC),
          trimmed in NASA Earthdata Search to the box {s}–{n}° N, {w}–{e}° E (about 48 cells per pass, morning and evening
          passes pooled). A value counts when it is inside {file.validRange[0]}–{file.validRange[1]} cm³/cm³ and the file’s
          first quality flag (“retrieval recommended”) is set. Downloaded {file.fetched}. The flag convention was read from
          the file’s own description and the data, not from a separate validation against field sensors.
        </li>
      </ul>
    </div>
  )
}
