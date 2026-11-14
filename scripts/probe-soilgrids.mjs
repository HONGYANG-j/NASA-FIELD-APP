// Probe the ISRIC SoilGrids REST service (v2.0, beta) for a few points and report latency/reliability.
// Usage: node scripts/probe-soilgrids.mjs [rounds]
// Prints one line per request; sequential, with a pause because ISRIC documents a rate limit (5 calls/min).
const POINTS = [
  { id: 'kedah', lat: 6.25, lon: 100.35 },
  { id: 'cameron', lat: 4.47, lon: 101.38 },
  { id: 'iowa', lat: 41.95, lon: -93.55 },
]
const PROPS = ['clay', 'sand', 'silt', 'soc']
const DEPTHS = ['0-5cm', '5-15cm', '15-30cm']
const rounds = Number(process.argv[2] ?? 1)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function url(p) {
  const q = new URLSearchParams()
  q.set('lon', String(p.lon))
  q.set('lat', String(p.lat))
  for (const x of PROPS) q.append('property', x)
  for (const d of DEPTHS) q.append('depth', d)
  q.set('value', 'mean')
  return `https://rest.isric.org/soilgrids/v2.0/properties/query?${q}`
}

for (let r = 0; r < rounds; r++) {
  for (const p of POINTS) {
    const t0 = Date.now()
    try {
      const res = await fetch(url(p), { signal: AbortSignal.timeout(60000) })
      const text = await res.text()
      const ms = Date.now() - t0
      if (!res.ok) {
        console.log(`${p.id} round ${r + 1}: HTTP ${res.status} in ${ms} ms: ${text.slice(0, 160)}`)
      } else {
        const j = JSON.parse(text)
        const summary = j.properties.layers.map((l) => {
          const vals = l.depths.map((d) => d.values.mean)
          return `${l.name}[${l.unit_measure.mapped_units}] ${vals.join('/')} (d_factor ${l.unit_measure.d_factor})`
        })
        console.log(`${p.id} round ${r + 1}: OK in ${ms} ms; ${summary.join('; ')}`)
        if (r === 0 && p.id === 'kedah') console.log(JSON.stringify(j).slice(0, 700))
      }
    } catch (e) {
      console.log(`${p.id} round ${r + 1}: FAILED after ${Date.now() - t0} ms: ${e.name}: ${e.message}`)
    }
    await sleep(15000)
  }
}
