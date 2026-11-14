// Turn a folder of trimmed SMAP files into one small bundled data file.
//
//   npm install --no-save h5wasm        (a NetCDF-4/HDF5 reader from NIST; not an app dependency)
//   node scripts/extract-smap.mjs <folder with *_subsetted.nc4> <id> <requested box w,s,e,n>
//   e.g. node scripts/extract-smap.mjs "C:/Users/me/Downloads/SPL3SMP_E_006-2026..." kedah 100.10,6.00,100.60,6.50
//
// Input: files ordered from NASA Earthdata Search for SPL3SMP_E V006 (SMAP Enhanced L3 radiometer, daily, 9 km EASE-Grid 2.0)
// with Harmony "Customize": spatial subset, the groups Soil_Moisture_Retrieval_Data_AM and _PM, NetCDF-4, no reprojection.
// Each file holds a small patch of 9 km cells for the morning (AM) and evening (PM) passes.
//
// A cell counts when:
//   - soil_moisture is within the product's documented valid range 0.02-0.5 cm3/cm3 (fill value is -9999), and
//   - retrieval_qual_flag has bit 0 set. The file's own flag text lists the bits as Retrieval_recommended, Retrieval_attempted,
//     Retrieval_success, FT_retrieval_success; a set bit is read as "true". The data agree: 99% of in-range cells have bit 0 set.
// Values above 0.5 are outside the documented range and are excluded, but counted, so the app can say where that happens.
//
// Output src/data/smap/<id>.json: one row per day [date, usable cells (AM+PM pooled), mean of those cells or null, cells above 0.5].
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import h5wasm from 'h5wasm/node'

const [dir, id, boxArg] = process.argv.slice(2)
if (!dir || !id || !boxArg) {
  console.error('usage: node scripts/extract-smap.mjs <folder> <id> <west,south,east,north>')
  process.exit(1)
}
const box = boxArg.split(',').map(Number)
if (box.length !== 4 || box.some((x) => !Number.isFinite(x))) throw new Error('box must be west,south,east,north')

const VALID = [0.02, 0.5]
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.nc4')).sort()
if (!files.length) throw new Error('no .nc4 files in ' + dir)
await h5wasm.ready

const days = []
let cellsPerPass = 0
let year = null
for (const name of files) {
  const m = name.match(/_(\d{4})(\d{2})(\d{2})_/)
  if (!m) throw new Error('cannot read the date from ' + name)
  year ??= Number(m[1])
  const f = new h5wasm.File(path.join(dir, name), 'r')
  const usable = []
  let over = 0
  for (const [grp, suf] of [['Soil_Moisture_Retrieval_Data_AM', ''], ['Soil_Moisture_Retrieval_Data_PM', '_pm']]) {
    const g = f.get(grp)
    const sm = g.get('soil_moisture' + suf).value
    const qf = g.get('retrieval_qual_flag' + suf).value
    cellsPerPass = Math.max(cellsPerPass, sm.length)
    for (let i = 0; i < sm.length; i++) {
      if (sm[i] > VALID[1]) over++
      else if (sm[i] >= VALID[0] && (qf[i] & 1) === 1) usable.push(sm[i])
    }
  }
  f.close()
  const mean = usable.length ? usable.reduce((a, b) => a + b, 0) / usable.length : null
  days.push([`${m[1]}-${m[2]}-${m[3]}`, usable.length, mean === null ? null : Math.round(mean * 1e4) / 1e4, over])
}

const out = {
  id,
  source:
    'NASA SMAP Enhanced L3 Radiometer Global and Polar Grid Daily 9 km EASE-Grid Soil Moisture V006 (SPL3SMP_E), customized with Harmony in NASA Earthdata Search',
  collection: 'C2938664763-NSIDC_CPRD',
  box,
  year,
  fetched: new Date().toISOString().slice(0, 10),
  units: 'cm3/cm3',
  validRange: VALID,
  rule: 'soil_moisture within the valid range and retrieval_qual_flag bit 0 set; morning and evening cells pooled; values above the valid range excluded and counted',
  cellsPerPass,
  days,
}
const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'smap', `${id}.json`)
fs.mkdirSync(path.dirname(file), { recursive: true })
fs.writeFileSync(file, JSON.stringify(out) + '\n')
const used = days.filter((d) => d[2] !== null)
console.log(`${files.length} files, year ${year}, ${cellsPerPass} cells per pass; ${used.length} days with usable values; wrote ${file}`)
