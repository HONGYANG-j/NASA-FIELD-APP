// Fetch real MODIS evapotranspiration, land-surface temperature, leaf area and growing-season dates
// for one point and save them as one bundled dataset.
//
//   node scripts/fetch-modis.mjs <id> <lat> <lon> [startYear endYear] [--cache <dir>]
//   e.g. node scripts/fetch-modis.mjs kedah 6.25 100.35
//
// Data comes from the public ORNL DAAC MODIS web service (no login): https://modis.ornl.gov/rst/api/v1
//   MOD16A2   ET_500m, PET_500m (8-day, 500 m; exists only from 2021)   QC: ET_QC_500m
//   MOD11A2   LST_Day_1km, LST_Night_1km (8-day, 1 km)                  QC: QC_Day, QC_Night
//   MCD15A2H  Lai_500m (8-day, 500 m)                                   QC: FparLai_QC
//   MCD12Q2   growing-season dates (yearly, 500 m), up to 2 cycles a year
//   MCD12Q1   land cover class of the pixel (yearly, 500 m)
// Scale factors, valid ranges and fill values below were read from the service's /bands endpoint on
// 14 Nov 2026 (see the README, "MODIS evapotranspiration, surface temperature, leaf area, phenology").
//
// The service allows 10 dates per request, takes 3-60 s per request and sometimes returns 502, so this runs
// strictly sequentially with retries, and is meant to be run once (in the background), never live from the app.
// --cache <dir> keeps every raw response so an interrupted run resumes without repeating requests.
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = 'https://modis.ornl.gov/rst/api/v1'
const MAX_DATES = 10

const args = process.argv.slice(2)
let cacheDir = null
const ci = args.indexOf('--cache')
if (ci >= 0) {
  cacheDir = resolve(args[ci + 1])
  args.splice(ci, 2)
}
// QC bands and PET double the number of requests, so they are opt-in: --qc, --pet.
const withQc = args.includes('--qc')
const withPet = args.includes('--pet')
let CONCURRENCY = 1
const ki = args.indexOf('--concurrency')
if (ki >= 0) {
  CONCURRENCY = Math.max(1, Math.min(4, Number(args[ki + 1]) || 1))
  args.splice(ki, 2)
}
const positional = args.filter((a) => !a.startsWith('--'))
const [id, latS, lonS, y0S = '2021', y1S = '2025'] = positional
if (!id || !latS || !lonS) {
  console.error('usage: node scripts/fetch-modis.mjs <id> <lat> <lon> [startYear endYear] [--cache <dir>]')
  process.exit(1)
}
const lat = Number(latS)
const lon = Number(lonS)
const y0 = Number(y0S)
const y1 = Number(y1S)
if (cacheDir) await mkdir(cacheDir, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getJson(url, attempts = 7) {
  let cacheFile = null
  if (cacheDir) {
    cacheFile = resolve(cacheDir, createHash('sha1').update(url).digest('hex') + '.json')
    try {
      return JSON.parse(await readFile(cacheFile, 'utf8'))
    } catch {
      /* not cached yet */
    }
  }
  let last = ''
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(180_000) })
      const text = await res.text()
      if (res.ok) {
        const json = JSON.parse(text)
        if (cacheFile) await writeFile(cacheFile, text)
        return json
      }
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

const datesCache = new Map()
async function datesOf(product) {
  if (!datesCache.has(product)) {
    const d = (await getJson(`${BASE}/${product}/dates?latitude=${lat}&longitude=${lon}`)).dates
    datesCache.set(product, d)
  }
  return datesCache.get(product)
}

/** Raw integer series of one band over [y0, y1], sequential, 10 dates per request. */
async function fetchBand(product, band, firstYear = y0, lastYear = y1) {
  const dates = (await datesOf(product)).filter((d) => {
    const y = Number(d.calendar_date.slice(0, 4))
    return y >= firstYear && y <= lastYear
  })
  const out = []
  let cellsize = null
  let meta = null
  const chunks = []
  for (let i = 0; i < dates.length; i += MAX_DATES) chunks.push(dates.slice(i, i + MAX_DATES))
  // CONCURRENCY = 1 is fully sequential (the default). The service was measured to answer 3 parallel
  // requests in about the time of one, so a small value (--concurrency 3) shortens a slow run.
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      batch.map((chunk) =>
        getJson(
          `${BASE}/${product}/subset?latitude=${lat}&longitude=${lon}&band=${encodeURIComponent(band)}` +
            `&startDate=${chunk[0].modis_date}&endDate=${chunk[chunk.length - 1].modis_date}&kmAboveBelow=0&kmLeftRight=0`,
        ),
      ),
    )
    results.forEach((json, k) => {
      cellsize = json.cellsize
      meta = { units: json.units, scale: json.scale }
      if (json.subset.length !== batch[k].length) {
        throw new Error(`${product} ${band}: asked for ${batch[k].length} dates, got ${json.subset.length}`)
      }
      for (const s of json.subset) out.push([s.calendar_date, s.data[0], s.tile])
    })
  }
  console.log(`[${id}] ${product} ${band}: ${out.length} dates (${dates.length ? dates[0].calendar_date : '-'} to ${dates.length ? dates[dates.length - 1].calendar_date : '-'})`)
  return { raw: out, cellsize, meta }
}

// --- time series -------------------------------------------------------------------------------
// valid = [lo, hi] range of raw values that are real data (from /bands "valid_range"); anything else,
// including the fill value, becomes null. offset/scale are the documented ones. K -> deg C is done here.
const SERIES = [
  {
    key: 'et', product: 'MOD16A2', band: 'ET_500m', qcBand: 'ET_QC_500m', scale: 0.1, offset: 0,
    valid: [-32767, 32700], fill: 32767, unit: 'mm per 8-day composite (kg/m2/8day)', digits: 1,
  },
  {
    key: 'pet', product: 'MOD16A2', band: 'PET_500m', qcBand: null, scale: 0.1, offset: 0,
    valid: [-32767, 32700], fill: 32767, unit: 'mm per 8-day composite (kg/m2/8day)', digits: 1,
  },
  {
    key: 'lstDay', product: 'MOD11A2', band: 'LST_Day_1km', qcBand: 'QC_Day', scale: 0.02, offset: -273.15,
    firstYear: 2022, valid: [7500, 65535], fill: 0, unit: 'deg C (raw is Kelvin x 0.02)', digits: 2,
  },
  {
    key: 'lstNight', product: 'MOD11A2', band: 'LST_Night_1km', qcBand: 'QC_Night', scale: 0.02, offset: -273.15,
    firstYear: 2022, valid: [7500, 65535], fill: 0, unit: 'deg C (raw is Kelvin x 0.02)', digits: 2,
  },
  {
    key: 'lai', product: 'MCD15A2H', band: 'Lai_500m', qcBand: 'FparLai_QC', scale: 0.1, offset: 0,
    firstYear: 2022, valid: [0, 100], fill: 255, unit: 'm2/m2 (leaf area per ground area)', digits: 1,
  },
]

const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d
const series = {}
for (const s of SERIES) {
  if (s.key === 'pet' && !withPet) continue
  const main = await fetchBand(s.product, s.band, s.firstYear ?? y0)
  const qc = s.qcBand && withQc ? await fetchBand(s.product, s.qcBand, s.firstYear ?? y0) : null
  let nullCount = 0
  const points = main.raw.map(([date, raw], i) => {
    const ok = typeof raw === 'number' && raw !== s.fill && raw >= s.valid[0] && raw <= s.valid[1]
    if (!ok) nullCount++
    if (qc && qc.raw[i][0] !== date) throw new Error(`${s.key}: QC date mismatch at ${date}`)
    const q = qc && typeof qc.raw[i][1] === 'number' ? qc.raw[i][1] : null
    return [date, ok ? round(raw * s.scale + s.offset, s.digits) : null, q]
  })
  series[s.key] = {
    product: s.product,
    band: s.band,
    qcBand: qc ? s.qcBand : null,
    unit: s.unit,
    scale: s.scale,
    offset: s.offset,
    validRaw: s.valid,
    fillRaw: s.fill,
    years: [s.firstYear ?? y0, y1],
    pixelMetres: main.cellsize ? Math.round(main.cellsize) : null,
    tile: main.raw[0]?.[2] ?? null,
    nullCount,
    /** [calendar date (start of the composite), value or null, raw QC integer or null]. */
    points,
  }
}

// --- growing-season dates (MCD12Q2) -----------------------------------------------------------
// Dates are stored as "days since 1970-01-01" with valid range 11138..32766 and fill 32767.
const EVENTS = {
  greenup: 'Greenup',
  midGreenup: 'MidGreenup',
  maturity: 'Maturity',
  senescence: 'Senescence',
  midGreendown: 'MidGreendown',
  dormancy: 'Dormancy',
}
const PHENO_FIRST = 2018
const PHENO_LAST = y1 // service lists MCD12Q2 up to A2025001; clamp via the dates endpoint
const dayToIso = (d) => new Date(d * 86_400_000).toISOString().slice(0, 10)
const validDay = (v) => typeof v === 'number' && v >= 11138 && v <= 32766

const numCycles = await fetchBand('MCD12Q2', 'NumCycles', PHENO_FIRST, PHENO_LAST)
const pheno = {} // year label -> record
for (const [date, v] of numCycles.raw) {
  pheno[date.slice(0, 4)] = { label: date, numCycles: typeof v === 'number' && v >= 0 && v <= 7 ? v : null, modes: [{}, {}] }
}
for (const mode of [1, 2]) {
  const suffix = `Num_Modes_0${mode}`
  const qo = await fetchBand('MCD12Q2', `QA_Overall.${suffix}`, PHENO_FIRST, PHENO_LAST)
  for (const [date, v] of qo.raw) pheno[date.slice(0, 4)].modes[mode - 1].qaOverall = typeof v === 'number' && v >= 0 && v <= 3 ? v : null
  for (const [key, band] of Object.entries(EVENTS)) {
    const r = await fetchBand('MCD12Q2', `${band}.${suffix}`, PHENO_FIRST, PHENO_LAST)
    for (const [date, v] of r.raw) pheno[date.slice(0, 4)].modes[mode - 1][key] = validDay(v) ? dayToIso(v) : null
  }
}
const phenology = {
  product: 'MCD12Q2',
  source: 'MODIS/Terra+Aqua Land Cover Dynamics Yearly L3 Global 500 m (MCD12Q2), up to two vegetation cycles per year',
  pixelMetres: numCycles.cellsize ? Math.round(numCycles.cellsize) : null,
  fillRaw: 32767,
  /** One entry per MCD12Q2 yearly layer, labelled with the layer date (YYYY-MM-DD) the service lists. */
  layers: Object.entries(pheno).map(([year, r]) => ({
    layerYear: Number(year),
    layerDate: r.label,
    numCycles: r.numCycles,
    cycles: r.modes.map((m) => ({ ...m })),
  })),
}

// --- land cover of the pixel ------------------------------------------------------------------
const IGBP = {
  1: 'evergreen needleleaf forest', 2: 'evergreen broadleaf forest', 3: 'deciduous needleleaf forest',
  4: 'deciduous broadleaf forest', 5: 'mixed forest', 6: 'closed shrubland', 7: 'open shrubland',
  8: 'woody savanna', 9: 'savanna', 10: 'grassland', 11: 'permanent wetland', 12: 'cropland',
  13: 'urban and built-up', 14: 'cropland / natural vegetation mosaic', 15: 'snow and ice',
  16: 'barren', 17: 'water',
}
let landCover = null
try {
  const lcDates = (await datesOf('MCD12Q1')).map((d) => Number(d.calendar_date.slice(0, 4)))
  const lcLast = Math.min(y1, Math.max(...lcDates))
  const lc = await fetchBand('MCD12Q1', 'LC_Type1', y0, lcLast)
  landCover = {
    source: 'MODIS/Terra+Aqua Land Cover Type Yearly (MCD12Q1), LC_Type1 (IGBP), 500 m',
    byYear: lc.raw.map(([date, cls]) => [date.slice(0, 4), cls, IGBP[cls] ?? 'unknown']),
  }
} catch (e) {
  console.log(`[${id}] land cover lookup failed (${e.message}); continuing without it`)
}

const out = {
  id,
  latitude: lat,
  longitude: lon,
  years: [y0, y1],
  fetched: new Date().toISOString().slice(0, 10),
  service: BASE,
  ...(landCover ? { landCover } : {}),
  series,
  phenology,
}
const file = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'modis', `${id}.json`)
await mkdir(dirname(file), { recursive: true })
await writeFile(file, JSON.stringify(out) + '\n')
for (const [k, s] of Object.entries(series)) {
  const vs = s.points.filter((p) => p[1] !== null).map((p) => p[1])
  console.log(`[${id}] ${k}: ${s.points.length} points, ${vs.length} valid, ${vs.length ? `${Math.min(...vs)}..${Math.max(...vs)}` : 'none'}`)
}
console.log(`[${id}] wrote ${file}`)
