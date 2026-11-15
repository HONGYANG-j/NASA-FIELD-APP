// Offline support: registering the service worker (public/sw.js) and saving the demo sites' data for use without a connection.
import { useEffect, useState } from 'react'

// Every bundled data file of the demo sites (NASA POWER snapshots and the satellite layers). Loading them once lets the
// service worker keep a copy. The same files are loaded one by one, on demand, in normal use.
const demoFiles = import.meta.glob('../data/{power,ndvi,modis,landsat,elevation,smap}/*.json')

export const offlineSupported = (): boolean => typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof caches !== 'undefined'

/** Removes the service worker and every copy it kept. Reached by opening the app with ?offline=off, as a way out if anything ever looks stale. */
export async function removeOffline(): Promise<void> {
  try {
    const regs = await navigator.serviceWorker.getRegistrations()
    await Promise.all(regs.map((r) => r.unregister()))
    const names = await caches.keys()
    await Promise.all(names.filter((n) => n.startsWith('pvc-offline-')).map((n) => caches.delete(n)))
  } catch {
    /* nothing to remove */
  }
}

/** Registers the service worker in production builds. Never throws: offline use is a convenience. */
export function registerOffline(): void {
  if (!import.meta.env.PROD || !offlineSupported()) return
  if (new URLSearchParams(window.location.search).get('offline') === 'off') {
    void removeOffline()
    return
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}

/** Downloads every demo-site data file so it is kept for offline use. Returns how many files were loaded. */
export async function saveDemoSitesOffline(): Promise<{ ok: boolean; files: number }> {
  if (!offlineSupported()) return { ok: false, files: 0 }
  try {
    await navigator.serviceWorker.ready
    const loaders = Object.values(demoFiles)
    await Promise.all(loaders.map((load) => load()))
    return { ok: true, files: loaders.length }
  } catch {
    return { ok: false, files: 0 }
  }
}

/** True while the browser reports a connection. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}
