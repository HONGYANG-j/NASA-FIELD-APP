// Service worker for Plant vs Climate: lets the app open without a connection.
//
// Rules, chosen so that an online visitor can never be shown an out-of-date app:
//   - Page loads (navigation): always try the network first; the saved copy is used only when the network fails.
//   - Files under /assets/ have a unique name per build, so a saved copy is always the right one: saved copy first, network otherwise.
//   - Everything else (the /api/ assistant route, NASA and other outside services) is never touched or stored.
const CACHE = 'pvc-offline-v1'
const SHELL = '/'
// Each release adds new uniquely named files. Keep at most this many entries; the oldest go first (never the page or the icon).
const MAX_ENTRIES = 120

async function trim(cache) {
  const keys = await cache.keys()
  let extra = keys.length - MAX_ENTRIES
  for (const k of keys) {
    if (extra <= 0) break
    const p = new URL(k.url).pathname
    if (p === SHELL || p === '/favicon.svg') continue
    await cache.delete(k)
    extra--
  }
}

async function saveShell() {
  const cache = await caches.open(CACHE)
  const res = await fetch(SHELL, { cache: 'no-store' })
  if (!res.ok) return
  const html = await res.clone().text()
  await cache.put(SHELL, res)
  // The page's own script and stylesheet, plus the icon.
  const urls = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1])
  urls.push('/favicon.svg')
  await Promise.all(urls.map((u) => cache.add(u).catch(() => undefined)))
  await trim(cache)
}

self.addEventListener('install', (event) => {
  event.waitUntil(saveShell().catch(() => undefined).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('pvc-offline-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            event.waitUntil(caches.open(CACHE).then((c) => c.put(SHELL, copy)).catch(() => undefined))
          }
          return res
        })
        .catch(async () => (await caches.match(SHELL)) ?? Response.error()),
    )
    return
  }

  if (url.pathname.startsWith('/assets/') || url.pathname === '/favicon.svg') {
    event.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit
        return fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            event.waitUntil(caches.open(CACHE).then(async (c) => { await c.put(req, copy); await trim(c) }).catch(() => undefined))
          }
          return res
        })
      }),
    )
  }
})
