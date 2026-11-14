import { useState } from 'react'
import { encodeShare } from '../lib/share'
import type { Inputs } from '../state'

interface Props {
  inputs: Inputs
  /** Called just before the print dialog so collapsed sections can be opened. */
  beforePrint: () => void
}

/** Copy a link to this setup, or print / save the page as a PDF. */
export function ShareBar({ inputs, beforePrint }: Props) {
  const [note, setNote] = useState<string | null>(null)
  const url = `${window.location.origin}${window.location.pathname}?${encodeShare(inputs)}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setNote('Link copied.')
    } catch {
      setNote('Could not copy automatically. Select the link below and copy it.')
    }
  }

  return (
    <section className="card share-bar no-print" aria-label="Share or save">
      <h2>Share or save</h2>
      <div className="share-actions">
        <button type="button" onClick={copy}>Copy link to this setup</button>
        <button
          type="button"
          onClick={() => {
            beforePrint()
            setTimeout(() => window.print(), 50)
          }}
        >
          Print or save as PDF
        </button>
      </div>
      <p className="muted" role="status">{note}</p>
      <label className="share-url">
        <span className="visually-hidden">Link to this setup</span>
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
      </label>
      <p className="muted">
        The link keeps the location, rotation style, current crops, irrigation, elevation and start month. It does not keep soil entries or
        priority sliders, and it holds no data: whoever opens it downloads the NASA data again. For a PDF, choose “Save as PDF” in the print window.
      </p>
    </section>
  )
}
