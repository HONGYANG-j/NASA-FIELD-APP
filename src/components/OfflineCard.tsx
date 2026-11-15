import { useState } from 'react'
import { offlineSupported, saveDemoSitesOffline } from '../lib/offline'

/** Lets a visitor keep the three demo sites on the device for use without a connection. */
export function OfflineCard() {
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'failed'>('idle')
  const [files, setFiles] = useState(0)
  const supported = offlineSupported() && import.meta.env.PROD

  const save = async () => {
    setState('saving')
    const r = await saveDemoSitesOffline()
    setFiles(r.files)
    setState(r.ok ? 'done' : 'failed')
  }

  return (
    <section className="card offline-card no-print" aria-labelledby="offline-title">
      <h2 id="offline-title">Use it without a connection</h2>
      {supported ? (
        <>
          <p className="muted">
            After your first visit the app itself opens offline. Press the button to also keep the three demo sites (Kedah, Cameron Highlands, Iowa: NASA
            climate record and satellite layers, about 1 MB) on this device.
          </p>
          <div className="share-actions">
            <button type="button" onClick={() => void save()} disabled={state === 'saving'}>
              {state === 'saving' ? 'Saving…' : state === 'done' ? 'Saved. Save again' : 'Save the demo sites for offline use'}
            </button>
          </div>
          <p className="muted" role="status">
            {state === 'done' && `Saved ${files} data files on this device. The demo sites will now open without a connection.`}
            {state === 'failed' && 'Could not save the files. Check your connection and try again.'}
          </p>
          <p className="muted">
            Still needs a connection: other places (live NASA data), the place search, the map, SoilGrids and the AI assistant. Nothing is uploaded; the files
            are only stored in this browser, and clearing the browser’s site data removes them.
          </p>
        </>
      ) : (
        <p className="muted">Offline use is not available in this browser (it needs service-worker support and the published site).</p>
      )}
    </section>
  )
}
