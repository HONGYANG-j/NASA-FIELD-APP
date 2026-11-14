// Download NASA POWER daily data once for each demo site and store it as a small bundled file, so the demo sites load
// instantly and do not depend on the live API (which sometimes rate-limits or resets connections).
//
//   node scripts/fetch-power.mjs            -> src/data/power/<id>.json for kedah, cameron, iowa
//
// Same request the app makes (community AG, daily point, 2005-2024, parameters below). Values are kept exactly as POWER returns them
// (fill value -999 included) so the app parses them with the same code as a live response. Custom locations still use the live API.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PARAMS = ['T2M', 'T2M_MAX', 'T2M_MIN', 'PRECTOTCORR', 'GWETROOT', 'EVPTRNS']
const START = 2005
const END = 2024
// Keep in step with src/data/presets.ts.
const SITES = [
  { id: 'kedah', lat: 6.25, lon: 100.35 },
  { id: 'cameron', lat: 4.47, lon: 101.38 },
  { id: 'iowa', lat: 41.95, lon: -93.55 },
]

const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(here, '..', 'src', 'data', 'power')
fs.mkdirSync(outDir, { recursive: true })

function url(lat, lon) {
  const q = new URLSearchParams({
    parameters: PARAMS.join(','), community: 'AG', longitude: lon.toFixed(4), latitude: lat.toFixed(4),
    start: `${START}0101`, end: `${END}1231`, format: 'JSON',
  })
  return `https://power.larc.nasa.gov/api/temporal/daily/point?${q}`
}

async function get(u) {
  let last = ''
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 4000 * attempt))
    try {
      const res = await fetch(u)
      if (res.ok) return await res.json()
      last = `HTTP ${res.status}`
    } catch (e) {
      last = String(e)
    }
  }
  throw new Error(`POWER request failed: ${last}`)
}

for (const s of SITES) {
  const json = await get(url(s.lat, s.lon))
  const p = json.properties.parameter
  const dates = Object.keys(p.T2M).sort()
  const days = (Date.UTC(END, 11, 31) - Date.UTC(START, 0, 1)) / 86_400_000 + 1
  if (dates.length !== days) throw new Error(`${s.id}: expected ${days} days, got ${dates.length}`)
  if (dates[0] !== `${START}0101` || dates[dates.length - 1] !== `${END}1231`) throw new Error(`${s.id}: unexpected date range`)
  const series = {}
  for (const name of PARAMS) {
    if (!p[name]) throw new Error(`${s.id}: missing ${name}`)
    series[name] = dates.map((d) => p[name][d])
  }
  const fill = json.header?.fill_value ?? -999
  const out = {
    id: s.id,
    source: 'NASA POWER daily point API (community AG), Prediction Of Worldwide Energy Resources, NASA Langley Research Center',
    api: 'https://power.larc.nasa.gov/api/temporal/daily/point',
    fetched: new Date().toISOString().slice(0, 10),
    latitude: json.geometry?.coordinates?.[1],
    longitude: json.geometry?.coordinates?.[0],
    gridElevationM: json.geometry?.coordinates?.[2] ?? null,
    requested: { lat: s.lat, lon: s.lon },
    years: [START, END],
    fill,
    days: dates.length,
    series,
  }
  const file = path.join(outDir, `${s.id}.json`)
  fs.writeFileSync(file, JSON.stringify(out) + '\n')
  const missing = PARAMS.map((n) => `${n}:${series[n].filter((v) => v === fill || v <= -990).length}`).join(' ')
  console.log(`${s.id}: ${dates.length} days, grid elevation ${out.gridElevationM} m, missing ${missing}, ${(fs.statSync(file).size / 1024).toFixed(0)} KB`)
  await new Promise((r) => setTimeout(r, 4000))
}
