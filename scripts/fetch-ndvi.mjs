// Fetch real MODIS NDVI for one point and save it as a bundled dataset.
//
//   node scripts/fetch-ndvi.mjs <id> <lat> <lon> <startYear> <endYear>
//   e.g. node scripts/fetch-ndvi.mjs kedah 6.25 100.35 2022 2025
//
// Data: MOD13Q1 (MODIS/Terra Vegetation Indices, 16-day, 250 m), band 250m_16_days_NDVI,
// from the public ORNL DAAC MODIS web service (no login): https://modis.ornl.gov/rst/api/v1
// The service allows at most 10 dates per request and is slow (20-60 s) and sometimes
// returns 502, so this runs sequentially with retries and is meant to be run once, not live.
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = 'https://modis.ornl.gov/rst/api/v1'
const PRODUCT = 'MOD13Q1'
const BAND = '250m_16_days_NDVI'
const SCALE = 0.0001
const FILL = -3000 // documented fill value; valid range is -2000..10000
const MAX_DATES = 10

const [id, latS, lonS, y0S, y1S] = process.argv.slice(2)
if (!id || !latS || !lonS || !y0S || !y1S) {
  console.error('usage: node scripts/fetch-ndvi.mjs <id> <lat> <lon> <startYear> <endYear>')
  process.exit(1)
}
const lat = Number(latS)
const lon = Number(lonS)
const y0 = Number(y0S)
const y1 = Number(y1S)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getJson(url, attempts = 7) {
  let last = ''
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(180_000) })
      const text = await res.text()
      if (res.ok) return JSON.parse(text)
      last = `HTTP ${res.status}: ${text.slice(0, 120)}`
      if (res.status === 400) throw new Error(last) // a bad request will not fix itself
    } catch (e) {
      last = String(e.message ?? e)
      if (last.startsWith('HTTP 400')) throw e
    }
    console.log(`  [${id}] attempt ${i}/${attempts} failed (${last}); retrying`)
    await sleep(5000 * i)
  }
  throw new Error(`gave up on ${url}: ${last}`)
}

const dates = (await getJson(`${BASE}/${PRODUCT}/dates?latitude=${lat}&longitude=${lon}`)).dates
  .filter((d) => {
    const y = Number(d.calendar_date.slice(0, 4))
    return y >= y0 && y <= y1
  })
console.log(`[${id}] ${dates.length} composites from ${y0} to ${y1}`)

const points = []
let cell = null
for (let i = 0; i < dates.length; i += MAX_DATES) {
  const chunk = dates.slice(i, i + MAX_DATES)
  const first = chunk[0].modis_date
  const last = chunk[chunk.length - 1].modis_date
  const url =
    `${BASE}/${PRODUCT}/subset?latitude=${lat}&longitude=${lon}&band=${BAND}` +
    `&startDate=${first}&endDate=${last}&kmAboveBelow=0&kmLeftRight=0`
  const json = await getJson(url)
  cell = json.cellsize
  for (const s of json.subset) {
    const raw = s.data[0]
    const ok = typeof raw === 'number' && raw !== FILL && raw >= -2000 && raw <= 10000
    points.push([s.calendar_date, ok ? Math.round(raw * SCALE * 1e4) / 1e4 : null])
  }
  console.log(`[${id}] ${points.length}/${dates.length} done`)
}

// What is at this pixel? MODIS land cover (IGBP classes), so users know what the NDVI describes.
const IGBP = {
  1: 'evergreen needleleaf forest', 2: 'evergreen broadleaf forest', 3: 'deciduous needleleaf forest',
  4: 'deciduous broadleaf forest', 5: 'mixed forest', 6: 'closed shrubland', 7: 'open shrubland',
  8: 'woody savanna', 9: 'savanna', 10: 'grassland', 11: 'permanent wetland', 12: 'cropland',
  13: 'urban and built-up', 14: 'cropland / natural vegetation mosaic', 15: 'snow and ice',
  16: 'barren', 17: 'water',
}
let landCover
try {
  const lc = await getJson(
    `${BASE}/MCD12Q1/subset?latitude=${lat}&longitude=${lon}&band=LC_Type1` +
      `&startDate=A${y0}001&endDate=A${y0}001&kmAboveBelow=0&kmLeftRight=0`,
  )
  const cls = lc.subset[0].data[0]
  landCover = {
    igbpClass: cls,
    label: IGBP[cls] ?? 'unknown',
    year: y0,
    source: 'MODIS/Terra+Aqua Land Cover Type Yearly (MCD12Q1), LC_Type1, 500 m',
  }
  console.log(`[${id}] land cover class ${cls}: ${landCover.label}`)
} catch (e) {
  console.log(`[${id}] land cover lookup failed (${e.message}); continuing without it`)
}

const out = {
  id,
  source:
    'MODIS/Terra Vegetation Indices 16-Day L3 Global 250 m (MOD13Q1), NDVI band, via the ORNL DAAC MODIS web service',
  service: `${BASE}/${PRODUCT}/subset`,
  band: BAND,
  latitude: lat,
  longitude: lon,
  pixelMetres: cell ? Math.round(cell) : null,
  years: [y0, y1],
  fetched: new Date().toISOString().slice(0, 10),
  ...(landCover ? { landCover } : {}),
  points,
}
const file = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'ndvi', `${id}.json`)
await mkdir(dirname(file), { recursive: true })
await writeFile(file, JSON.stringify(out) + '\n')
const valid = points.filter((p) => p[1] !== null).map((p) => p[1])
console.log(
  `[${id}] wrote ${file}: ${points.length} points, ${valid.length} valid, NDVI ${Math.min(...valid)}..${Math.max(...valid)}`,
)
