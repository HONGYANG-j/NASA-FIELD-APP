// Release smoke test for a deployed copy of the app. It only makes plain HTTP requests and never sends a valid assistant request,
// so it does not call (or use up) the AI service.
//
//   node scripts/smoke.mjs [https://your-site.example]     (default: the live submission URL)
//   npm run smoke
//
// Exit code 0 = every check passed; 1 = at least one failed.
const base = (process.argv[2] ?? 'https://crop-rotation-explorer.pahang-risk-nav.workers.dev').replace(/\/$/, '')
let failed = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -  ' + detail : ''}`)
  if (!ok) failed++
}

const home = await fetch(base + '/')
const html = await home.text()
check('home page loads', home.status === 200 && /text\/html/.test(home.headers.get('content-type') ?? ''), `HTTP ${home.status}`)
check('page title', /<title>Plant vs Climate/.test(html))
check('licence and AI-assistance metadata present', /name="license" content="Apache-2.0"/.test(html) && /name="ai-assistance"/.test(html))

const csp = home.headers.get('content-security-policy') ?? ''
check('Content-Security-Policy set, no inline scripts, no framing', /script-src 'self'/.test(csp) && !/script-src[^;]*unsafe/.test(csp) && /frame-ancestors 'none'/.test(csp))
check('CSP allows only the expected outside hosts', ['power.larc.nasa.gov', 'rest.isric.org', 'gibs.earthdata.nasa.gov', 'geocoding-api.open-meteo.com'].every((h) => csp.includes(h)) && !/\*/.test(csp))
check('other security headers', home.headers.get('x-content-type-options') === 'nosniff' && home.headers.get('x-frame-options') === 'DENY' && /strict-origin/.test(home.headers.get('referrer-policy') ?? ''))

// every script and stylesheet the page loads must exist and have the right type
const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1])
check('page references built assets', assets.length >= 2, `${assets.length} found`)
for (const a of assets) {
  const r = await fetch(base + a)
  const want = a.endsWith('.js') ? /javascript/ : /css/
  check(`asset ${a}`, r.status === 200 && want.test(r.headers.get('content-type') ?? ''), `HTTP ${r.status}`)
}
const fav = await fetch(base + '/favicon.svg')
check('favicon', fav.status === 200 && /svg/.test(fav.headers.get('content-type') ?? ''))
const sw = await fetch(base + '/sw.js')
check('service worker script is served as JavaScript', sw.status === 200 && /javascript/.test(sw.headers.get('content-type') ?? '') && /pvc-offline-/.test(await sw.text()))
const robots = await fetch(base + '/robots.txt')
check('robots.txt blocks /api/', robots.status === 200 && /Disallow: \/api\//.test(await robots.text()))
const spa = await fetch(base + '/some/unknown/path')
check('unknown paths fall back to the app (single-page app)', spa.status === 200 && /<div id="root">/.test(await spa.text()))

// assistant route: status, refusals, and no secrets in any answer
const status = await fetch(base + '/api/assist')
const sj = await status.json()
check('assistant status endpoint', status.status === 200 && typeof sj.configured === 'boolean', `configured=${sj.configured}, model=${sj.model}`)
check('status reveals no key', !/gsk_|api[_-]?key|bearer/i.test(JSON.stringify(sj)))
const cross = await fetch(base + '/api/assist', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{}' })
check('foreign origin is refused', cross.status === 403, `HTTP ${cross.status}`)
const bad = await fetch(base + '/api/assist', { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: '{"messages":[],"state":{}}' })
check('invalid request is rejected before any model call', bad.status === 400 || bad.status === 503, `HTTP ${bad.status}`)
const get405 = await fetch(base + '/api/assist', { method: 'DELETE' })
check('other methods are refused', get405.status === 405, `HTTP ${get405.status}`)

console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) FAILED.`)
process.exit(failed === 0 ? 0 : 1)
