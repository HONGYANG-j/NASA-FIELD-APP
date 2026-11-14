// Fetch real Landsat NDVI and NASADEM elevation/slope for one point and save them as bundled datasets.
//
//   node scripts/fetch-landsat.mjs <id> <lat> <lon> <startYear> <endYear> [--radius <metres>] [--exact] [--elevation-only]
//   e.g. node scripts/fetch-landsat.mjs kedah 6.25 100.35 2022 2025
//
// Writes src/data/landsat/<id>.json and src/data/elevation/<id>.json. Run once; the app never calls this live.
//
// Source: Microsoft Planetary Computer, public STAC API (no account, no token needed from us):
//   search:  https://planetarycomputer.microsoft.com/api/stac/v1/search
//   values:  https://planetarycomputer.microsoft.com/api/data/v1/item/point/{lon},{lat}  (server-side signing)
// Collections: landsat-c2-l2 (USGS/NASA Landsat Collection 2 Level-2 surface reflectance, 30 m),
//              nasadem (NASA JPL NASADEM_HGT v001, 1 arc-second), esa-worldcover (ESA WorldCover 10 m, used
//              only to pick a pixel that is cropland).
//
// Pixel choice: the exact preset coordinate can be a road or a town at 30 m (ESA WorldCover puts the Cameron
// Highlands preset in "built-up"). Unless --exact is given, the script uses the nearest point within --radius
// (default 2000 m) whose 5x5 neighbourhood (10 m spacing) is cropland in WorldCover 2021, and whose centre is
// also cropland in WorldCover 2020. The offset is stored in the output. If no such pixel exists (Cameron Highlands:
// the farms are patches of a few 10 m pixels, so none qualifies) the script stops; run it with --elevation-only to
// write just the NASADEM file, or give a verified farm coordinate with --exact.
// Elevation and slope are always taken at the requested point itself, not at the picked pixel.
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const STAC = 'https://planetarycomputer.microsoft.com/api/stac/v1/search'
const DATA = 'https://planetarycomputer.microsoft.com/api/data/v1/item/point'
const CONCURRENCY = 6

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const opt = (name, dflt) => {
  const i = args.indexOf(name)
  return i >= 0 ? Number(args[i + 1]) : dflt
}
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1] === '--radius'))
const [id, latS, lonS, y0S, y1S] = pos
if (!id || !latS || !lonS || !y0S || !y1S) {
  console.error('usage: node scripts/fetch-landsat.mjs <id> <lat> <lon> <startYear> <endYear> [--radius m] [--exact] [--elevation-only]')
  process.exit(1)
}
const reqLat = Number(latS)
const reqLon = Number(lonS)
const y0 = Number(y0S)
const y1 = Number(y1S)
const radius = opt('--radius', 2000)
const exact = flag('--exact')
const elevationOnly = flag('--elevation-only')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Run fn over items with a fixed number of parallel workers; results keep input order. */
async function pool(items, fn, n = CONCURRENCY) {
  const out = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i], i)
      }
    }),
  )
  return out
}

async function request(url, init, attempts = 8) {
  let last = ''
  for (let i = 1; i <= attempts; i++) {
    let wait = 1500 * i
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) })
      if (res.ok) return await res.json()
      last = `HTTP ${res.status}`
      // 429 = rate limited (seen when scanning many pixels): honour Retry-After, else back off harder.
      if (res.status === 429) wait = Math.max(Number(res.headers.get('retry-after')) * 1000 || 0, 5000 * i)
      // Other 4xx: the point is outside this item, or the request is wrong. Retrying will not help.
      else if (res.status >= 400 && res.status < 500) return { error: last }
    } catch (e) {
      last = String(e.message ?? e)
    }
    await sleep(wait)
  }
  throw new Error(`gave up on ${url.slice(0, 120)}: ${last}`)
}

async function stacSearch(body) {
  const items = []
  let url = STAC
  let b = body
  for (;;) {
    const j = await request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })
    if (j.error) throw new Error(`STAC search failed: ${j.error}`)
    items.push(...j.features)
    const next = j.links.find((l) => l.rel === 'next')
    if (!next) return items
    url = next.href
    b = next.body
  }
}

/** Raw pixel values at a point for the given assets of one item; null when the point is outside the item. */
async function pointValues(collection, item, lat, lon, assets) {
  const q = assets.map((a) => `assets=${a}`).join('&')
  const j = await request(`${DATA}/${lon},${lat}?collection=${collection}&item=${item}&${q}`)
  return j.error ? null : j.values
}

// ---------- geometry helpers (WGS84 series for metres per degree) ----------
const rad = (d) => (d * Math.PI) / 180
const mPerDegLat = (lat) => 111132.954 - 559.822 * Math.cos(rad(2 * lat)) + 1.175 * Math.cos(rad(4 * lat))
const mPerDegLon = (lat) => 111412.84 * Math.cos(rad(lat)) - 93.5 * Math.cos(rad(3 * lat)) + 0.118 * Math.cos(rad(5 * lat))
const offsetPoint = (lat, lon, eastM, northM) => [lat + northM / mPerDegLat(lat), lon + eastM / mPerDegLon(lat)]
const distM = (aLat, aLon, bLat, bLon) =>
  Math.hypot((bLat - aLat) * mPerDegLat(aLat), (bLon - aLon) * mPerDegLon(aLat))

// ---------- 1. pick a cropland pixel with ESA WorldCover ----------
const WC_CROP = 40
const WC_LABEL = {
  10: 'tree cover', 20: 'shrubland', 30: 'grassland', 40: 'cropland', 50: 'built-up',
  60: 'bare / sparse vegetation', 70: 'snow and ice', 80: 'permanent water', 90: 'herbaceous wetland',
  95: 'mangroves', 100: 'moss and lichen',
}
const wcTiles = new Map()
/** WorldCover item ids (2021 v200 and 2020 v100) covering a point, cached per 3-degree tile. */
async function wcItems(lat, lon) {
  const key = `${Math.floor(lat / 3)},${Math.floor(lon / 3)}`
  if (!wcTiles.has(key)) {
    const items = await stacSearch({ collections: ['esa-worldcover'], intersects: { type: 'Point', coordinates: [lon, lat] }, limit: 10 })
    wcTiles.set(key, {
      y2021: items.find((f) => f.id.includes('_2021_'))?.id,
      y2020: items.find((f) => f.id.includes('_2020_'))?.id,
    })
  }
  return wcTiles.get(key)
}
async function wcClass(lat, lon, year) {
  const t = await wcItems(lat, lon)
  const item = year === 2021 ? t.y2021 : t.y2020
  if (!item) return null
  const v = await pointValues('esa-worldcover', item, lat, lon, ['map'])
  return v ? v[0] : null
}

async function pickPixel() {
  const c0 = await wcClass(reqLat, reqLon, 2021)
  const c0b = await wcClass(reqLat, reqLon, 2020)
  const requested = { wc2021: c0, wc2020: c0b }
  if (exact) return { lat: reqLat, lon: reqLon, requested, picked: requested }
  // Candidates on a 60 m grid inside the radius, nearest first.
  const cands = []
  for (let e = -radius; e <= radius; e += 60) {
    for (let n = -radius; n <= radius; n += 60) {
      const d = Math.hypot(e, n)
      if (d <= radius) cands.push({ e, n, d })
    }
  }
  cands.sort((a, b) => a.d - b.d)
  const CHUNK = 24
  for (let i = 0; i < cands.length; i += CHUNK) {
    const chunk = cands.slice(i, i + CHUNK)
    const screened = await pool(chunk, async (c) => {
      const [la, lo] = offsetPoint(reqLat, reqLon, c.e, c.n)
      const [a, b] = await Promise.all([wcClass(la, lo, 2021), wcClass(la, lo, 2020)])
      return a === WC_CROP && b === WC_CROP ? { ...c, la, lo } : null
    })
    for (const c of screened.filter(Boolean)) {
      // 5x5 neighbourhood at 10 m spacing (a 40 m span: a 30 m Landsat pixel plus registration slack).
      const offs = []
      for (let dx = -20; dx <= 20; dx += 10) for (let dy = -20; dy <= 20; dy += 10) offs.push([dx, dy])
      const classes = await pool(offs, async ([dx, dy]) => {
        const [la, lo] = offsetPoint(c.la, c.lo, dx, dy)
        return wcClass(la, lo, 2021)
      })
      if (classes.every((k) => k === WC_CROP)) {
        return {
          lat: c.la,
          lon: c.lo,
          requested,
          picked: { wc2021: WC_CROP, wc2020: WC_CROP, neighbourhood: '5x5 at 10 m, all cropland (2021)' },
        }
      }
    }
  }
  throw new Error(`no cropland pixel with a cropland 5x5 neighbourhood within ${radius} m of ${reqLat},${reqLon}`)
}

// ---------- 2. Landsat NDVI ----------
// USGS Collection 2 Level-2 surface reflectance: reflectance = DN * 0.0000275 - 0.2 (also in each item's
// raster:bands). We check that every scene we use declares the same scale and offset.
const SCALE = 0.0000275
const OFFSET = -0.2
// QA_PIXEL bit flags (also in each item's classification:bitfields): 0 fill, 1 dilated cloud, 2 cirrus,
// 3 cloud, 4 cloud shadow, 5 snow. Bits 8-9 cloud confidence, 10-11 shadow confidence, 14-15 cirrus
// confidence: 3 = high. A scene is rejected at this pixel if any of those flags is set.
function qaClear(qa) {
  if (qa & 0b111111) return false
  if (((qa >> 8) & 3) === 3 || ((qa >> 10) & 3) === 3 || ((qa >> 14) & 3) === 3) return false
  return true
}

async function landsatSeries(lat, lon) {
  const scenes = await stacSearch({
    collections: ['landsat-c2-l2'],
    intersects: { type: 'Point', coordinates: [lon, lat] },
    datetime: `${y0}-01-01T00:00:00Z/${y1}-12-31T23:59:59Z`,
    // Tier 1 only: the highest geometric accuracy (Tier 2 can be poorly registered).
    query: { 'landsat:collection_category': { eq: 'T1' } },
    limit: 100,
  })
  console.log(`[${id}] ${scenes.length} Tier-1 scenes cover the pixel in ${y0}-${y1}`)
  const stats = { scenesSearched: scenes.length, noData: 0, cloudOrShadowMasked: 0, outOfRange: 0, badScaling: 0, clear: 0 }
  const platforms = {}
  const byDate = new Map()
  let done = 0
  await pool(scenes, async (f) => {
    const band = (a) => f.assets[a]?.['raster:bands']?.[0]
    const r = band('red')
    const n = band('nir08')
    if (!r || !n || r.scale !== SCALE || r.offset !== OFFSET || n.scale !== SCALE || n.offset !== OFFSET) {
      stats.badScaling++
      return
    }
    const v = await pointValues('landsat-c2-l2', f.id, lat, lon, ['red', 'nir08', 'qa_pixel'])
    if (++done % 50 === 0) console.log(`  ${done}/${scenes.length}`)
    if (!v || v[0] === 0 || v[1] === 0) return void stats.noData++ // 0 is the declared nodata value
    if (!qaClear(v[2])) return void stats.cloudOrShadowMasked++
    const red = v[0] * SCALE + OFFSET
    const nir = v[1] * SCALE + OFFSET
    if (red < 0 || red > 1 || nir < 0 || nir > 1 || nir + red === 0) return void stats.outOfRange++
    const date = f.properties.datetime.slice(0, 10)
    const plat = f.properties.platform.replace('landsat-', 'L')
    const ndvi = (nir - red) / (nir + red)
    const list = byDate.get(date) ?? []
    list.push({ ndvi, plat })
    byDate.set(date, list)
    platforms[plat] = (platforms[plat] ?? 0) + 1
    stats.clear++
  })
  // Two scenes on the same date (overlapping paths) see the same surface: average them.
  const points = [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, l]) => [date, Math.round((l.reduce((s, x) => s + x.ndvi, 0) / l.length) * 1e4) / 1e4, [...new Set(l.map((x) => x.plat))].join('+')])
  return { points, stats, platforms, datesAveraged: stats.clear - points.length }
}

// ---------- 3. NASADEM elevation and slope ----------
const ARCSEC = 1 / 3600
/** Horn (1981) slope in degrees from a 3x3 grid z[row][col], row 0 = north, spacing in metres. */
function hornSlope(z, dxM, dyM) {
  const [[a, b, c], [d, , f], [g, h, i]] = z
  const dzdx = (c + 2 * f + i - (a + 2 * d + g)) / (8 * dxM)
  const dzdy = (a + 2 * b + c - (g + 2 * h + i)) / (8 * dyM)
  return (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI
}

async function elevation(lat, lon) {
  const items = await stacSearch({ collections: ['nasadem'], intersects: { type: 'Point', coordinates: [lon, lat] }, limit: 5 })
  const item = items[0]
  if (!item) throw new Error('no NASADEM tile covers this point')
  // The tile is a 1 arc-second grid, so shifting the query by k arc-seconds moves it by exactly k pixels.
  const grid = async (k) => {
    const rows = []
    for (const dn of [1, 0, -1]) {
      rows.push(
        await pool([-1, 0, 1], async (de) => {
          const v = await pointValues('nasadem', item.id, lat + dn * k * ARCSEC, lon + de * k * ARCSEC, ['elevation'])
          if (!v) throw new Error('NASADEM sample outside tile')
          return v[0]
        }),
      )
    }
    return rows
  }
  const g1 = await grid(1)
  const g3 = await grid(3)
  const slopeFor = (g, k) => hornSlope(g, k * ARCSEC * mPerDegLon(lat), k * ARCSEC * mPerDegLat(lat))
  const flat = g1.flat()
  return {
    item: item.id,
    elevationM: g1[1][1],
    mean3x3M: Math.round((flat.reduce((s, x) => s + x, 0) / 9) * 10) / 10,
    min3x3M: Math.min(...flat),
    max3x3M: Math.max(...flat),
    slope30mDeg: Math.round(slopeFor(g1, 1) * 100) / 100,
    slope90mDeg: Math.round(slopeFor(g3, 3) * 100) / 100,
    grid1: g1,
    grid3: g3,
  }
}

// ---------- run ----------
const t0 = Date.now()
const today = new Date().toISOString().slice(0, 10)
const here = dirname(fileURLToPath(import.meta.url))
const label = (c) => (c === null ? null : WC_LABEL[c] ?? String(c))
const write = async (dir, obj) => {
  const out = resolve(here, '..', 'src', 'data', dir, `${id}.json`)
  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, JSON.stringify(obj) + '\n')
  console.log('wrote', out)
}

let pix = null
let ls = null
if (!elevationOnly) {
  pix = await pickPixel()
  const off = Math.round(distM(reqLat, reqLon, pix.lat, pix.lon))
  console.log(`[${id}] pixel ${pix.lat.toFixed(5)}, ${pix.lon.toFixed(5)} (${off} m from the preset); WorldCover at preset:`, pix.requested)
  ls = await landsatSeries(Math.round(pix.lat * 1e5) / 1e5, Math.round(pix.lon * 1e5) / 1e5)
}
const dem = await elevation(reqLat, reqLon)
const wcAtPoint = {
  wc2021: label(await wcClass(reqLat, reqLon, 2021)),
  wc2020: label(await wcClass(reqLat, reqLon, 2020)),
}

if (pix && ls) {
  const lat = Math.round(pix.lat * 1e5) / 1e5
  const lon = Math.round(pix.lon * 1e5) / 1e5
  await write('landsat', {
    id,
    source: 'Landsat Collection 2 Level-2 surface reflectance (USGS/NASA; Landsat 7, 8, 9), via Microsoft Planetary Computer',
    service: 'https://planetarycomputer.microsoft.com/api/stac/v1 (collection landsat-c2-l2)',
    formula: 'NDVI = (NIR - Red) / (NIR + Red); Landsat 7 bands 4/3, Landsat 8-9 bands 5/4; reflectance = DN * 0.0000275 - 0.2',
    pixelMetres: 30,
    latitude: lat,
    longitude: lon,
    requested: { latitude: reqLat, longitude: reqLon, offsetMetres: Math.round(distM(reqLat, reqLon, lat, lon)) },
    landCover: {
      source: 'ESA WorldCover 10 m (CC BY 4.0), via Microsoft Planetary Computer',
      atRequestedPoint: wcAtPoint,
      atPixel: exact ? 'not checked (--exact)' : pix.picked.neighbourhood,
    },
    years: [y0, y1],
    fetched: today,
    maskRule: 'Tier-1 scenes only; a scene is dropped at this pixel if QA_PIXEL flags fill, dilated cloud, cirrus, cloud, cloud shadow or snow, or reports high confidence of cloud, shadow or cirrus; reflectance outside 0-1 is dropped.',
    observations: { ...ls.stats, byPlatform: ls.platforms, sameDayAveraged: ls.datesAveraged },
    /** [calendar date YYYY-MM-DD, NDVI, Landsat platform(s)] for clear observations only. */
    points: ls.points,
  })
}
await write('elevation', {
  id,
  source: 'NASADEM_HGT v001 (NASA JPL; SRTM-derived, 1 arc-second, about 30 m), via Microsoft Planetary Computer',
  service: 'https://planetarycomputer.microsoft.com/api/stac/v1 (collection nasadem)',
  item: dem.item,
  latitude: reqLat,
  longitude: reqLon,
  landCoverAtPoint: { source: 'ESA WorldCover 10 m (CC BY 4.0)', ...wcAtPoint },
  elevationM: dem.elevationM,
  mean3x3M: dem.mean3x3M,
  min3x3M: dem.min3x3M,
  max3x3M: dem.max3x3M,
  slope30mDeg: dem.slope30mDeg,
  slope90mDeg: dem.slope90mDeg,
  slopeMethod: 'Horn (1981) 3x3 slope; 30 m uses adjacent 1 arc-second pixels, 90 m uses pixels 3 apart. Single pixels, no smoothing.',
  samples30m: dem.grid1,
  fetched: today,
})
console.log(`[${id}]`, ls ? `clear observations ${ls.points.length} of ${ls.stats.scenesSearched} scenes; ${JSON.stringify(ls.stats)};` : 'Landsat skipped;', `elevation ${dem.elevationM} m, slope ${dem.slope30mDeg}/${dem.slope90mDeg} deg;`, `${Math.round((Date.now() - t0) / 1000)} s`)
