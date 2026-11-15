// Runs public/sw.js against a small fake of the browser's service-worker environment, to check its rules without a browser.
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const SOURCE = fs.readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8')
const ORIGIN = 'https://app.test'

type Handler = (event: unknown) => void

function makeWorker(opts: { online: boolean; pages?: Record<string, string>; existingCaches?: string[] }) {
  const store = new Map<string, Map<string, Response>>()
  for (const name of opts.existingCaches ?? []) store.set(name, new Map())
  const key = (r: RequestInfo | URL) => new URL(typeof r === 'string' ? r : r instanceof URL ? r.href : r.url, ORIGIN).pathname
  const caches = {
    open: async (name: string) => {
      const m = store.get(name) ?? new Map<string, Response>()
      store.set(name, m)
      return {
        keys: async () => [...m.keys()].map((p) => ({ url: ORIGIN + p })),
        delete: async (r: { url: string } | string) => m.delete(key(typeof r === 'string' ? r : r.url)),
        put: async (r: RequestInfo | URL, res: Response) => void m.set(key(r), res),
        add: async (r: RequestInfo | URL) => {
          const res = await network(key(r))
          if (!res.ok) throw new Error('bad')
          m.set(key(r), res)
        },
      }
    },
    match: async (r: RequestInfo | URL) => {
      for (const m of store.values()) {
        const hit = m.get(key(r))
        if (hit) return hit.clone()
      }
      return undefined
    },
    keys: async () => [...store.keys()],
    delete: async (n: string) => store.delete(n),
  }
  const calls: string[] = []
  const pages = opts.pages ?? {}
  const network = async (path: string): Promise<Response> => {
    calls.push(path)
    if (!opts.online) throw new TypeError('offline')
    if (path in pages) return new Response(pages[path], { status: 200 })
    return new Response('not found', { status: 404 })
  }
  const handlers: Record<string, Handler> = {}
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, h: Handler) => void (handlers[type] = h),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  }
  const fakeFetch = (r: RequestInfo | URL) => network(key(r))
  new Function('self', 'caches', 'fetch', SOURCE)(self, caches, fakeFetch)

  const run = async (type: string, extra: Record<string, unknown> = {}) => {
    const pending: Promise<unknown>[] = []
    let responded: Promise<Response> | null = null
    handlers[type]({ ...extra, waitUntil: (p: Promise<unknown>) => void pending.push(p), respondWith: (p: Promise<Response>) => void (responded = p) })
    await Promise.all(pending)
    return responded as Promise<Response> | null
  }
  const request = (path: string, init: { method?: string; mode?: string; origin?: string } = {}) => ({
    method: init.method ?? 'GET',
    mode: init.mode ?? 'no-cors',
    url: (init.origin ?? ORIGIN) + path,
  })
  return { store, calls, run, request }
}

const HOME = '<html><link href="/assets/app-1.css"><script src="/assets/app-1.js"></script></html>'
const pages = { '/': HOME, '/assets/app-1.js': 'js', '/assets/app-1.css': 'css', '/favicon.svg': '<svg/>' }

describe('public/sw.js', () => {
  it('on install, keeps the page, its script and stylesheet, and the icon', async () => {
    const w = makeWorker({ online: true, pages })
    await w.run('install')
    const cache = w.store.get('pvc-offline-v1')!
    expect([...cache.keys()].sort()).toEqual(['/', '/assets/app-1.css', '/assets/app-1.js', '/favicon.svg'])
  })

  it('page loads go to the network first, and the saved page is used only when the network fails', async () => {
    const online = makeWorker({ online: true, pages })
    await online.run('install')
    online.calls.length = 0
    const res = await (await online.run('fetch', { request: online.request('/', { mode: 'navigate' }) }))!
    expect(await res.text()).toBe(HOME)
    expect(online.calls).toEqual(['/'])

    const offline = makeWorker({ online: true, pages })
    await offline.run('install')
    // the network now drops: same stores, new connection state
    const down = makeWorker({ online: false, pages })
    for (const [n, m] of offline.store) down.store.set(n, m)
    const res2 = await (await down.run('fetch', { request: down.request('/', { mode: 'navigate' }) }))!
    expect(await res2.text()).toBe(HOME)
  })

  it('shows a plain network error, not a wrong page, when offline with nothing saved', async () => {
    const w = makeWorker({ online: false, pages })
    const res = await (await w.run('fetch', { request: w.request('/', { mode: 'navigate' }) }))!
    expect(res.type).toBe('error')
  })

  it('serves built files from the saved copy first, and saves them the first time they are fetched', async () => {
    const w = makeWorker({ online: true, pages })
    await w.run('install')
    w.calls.length = 0
    const hit = await (await w.run('fetch', { request: w.request('/assets/app-1.js') }))!
    expect(await hit.text()).toBe('js')
    expect(w.calls).toEqual([]) // from the saved copy, no network
    const w2 = makeWorker({ online: true, pages: { ...pages, '/assets/kedah-9.js': 'data' } })
    const miss = await (await w2.run('fetch', { request: w2.request('/assets/kedah-9.js') }))!
    expect(await miss.text()).toBe('data')
    expect(w2.store.get('pvc-offline-v1')!.has('/assets/kedah-9.js')).toBe(true)
  })

  it('never touches the assistant route, other sites, or anything that is not a plain GET', async () => {
    const w = makeWorker({ online: true, pages })
    expect(await w.run('fetch', { request: w.request('/api/assist') })).toBeNull()
    expect(await w.run('fetch', { request: w.request('/api/assist', { method: 'POST' }) })).toBeNull()
    expect(await w.run('fetch', { request: w.request('/power', { origin: 'https://power.larc.nasa.gov' }) })).toBeNull()
    expect(await w.run('fetch', { request: w.request('/robots.txt') })).toBeNull()
    expect(w.calls).toEqual([])
  })

  it('keeps the saved copy from growing without limit: the oldest built files go first, the page and icon stay', async () => {
    const many: Record<string, string> = { ...pages }
    for (let i = 0; i < 140; i++) many[`/assets/old-${i}.js`] = 'x'
    const w = makeWorker({ online: true, pages: many })
    await w.run('install')
    for (let i = 0; i < 140; i++) await w.run('fetch', { request: w.request(`/assets/old-${i}.js`) })
    const cache = w.store.get('pvc-offline-v1')!
    expect(cache.size).toBeLessThanOrEqual(120)
    expect(cache.has('/')).toBe(true)
    expect(cache.has('/favicon.svg')).toBe(true)
    expect(cache.has('/assets/old-139.js')).toBe(true) // newest kept
    expect(cache.has('/assets/old-0.js')).toBe(false) // oldest dropped
  })

  it('on activate, removes copies kept by older versions of itself and nothing else', async () => {
    const w = makeWorker({ online: true, pages, existingCaches: ['pvc-offline-v0', 'pvc-offline-v1', 'someone-elses-cache'] })
    await w.run('activate')
    expect([...w.store.keys()].sort()).toEqual(['pvc-offline-v1', 'someone-elses-cache'])
  })
})
