// Generic JSON fetch helper with a small in-memory cache.
// Challenge-agnostic: used for any public API call (NASA or otherwise).

const cache = new Map<string, unknown>()

export async function fetchJson<T>(
  url: string,
  options: { cache?: boolean; signal?: AbortSignal } = {},
): Promise<T> {
  const useCache = options.cache ?? true
  if (useCache && cache.has(url)) return cache.get(url) as T

  const res = await fetch(url, { signal: options.signal })
  if (!res.ok) {
    throw new Error(`Request failed (${res.status}) for ${url.split('?')[0]}`)
  }
  const data = (await res.json()) as T
  if (useCache) cache.set(url, data)
  return data
}
