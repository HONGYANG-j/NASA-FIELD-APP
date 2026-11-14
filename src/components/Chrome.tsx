import type { KeyboardEvent, ReactNode } from 'react'

/** The pages of the app. "setup" (the farm inputs) is its own page on phones only; on desktop it is the side panel. */
export type PageId = 'setup' | 'summary' | 'climate' | 'satellite' | 'rotations' | 'data'

const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

const PAGES: { id: PageId; label: string; mobileOnly?: boolean; icon: ReactNode }[] = [
  { id: 'setup', label: 'Setup', mobileOnly: true, icon: svg(<><path d="M4 7h10" /><path d="M18 7h2" /><circle cx="16" cy="7" r="2" /><path d="M4 17h2" /><path d="M10 17h10" /><circle cx="8" cy="17" r="2" /></>) },
  { id: 'summary', label: 'Summary', icon: svg(<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>) },
  { id: 'climate', label: 'Climate', icon: svg(<><path d="M7 18a4 4 0 0 1-.6-7.96A6 6 0 0 1 18 9.5 4 4 0 0 1 17 18Z" /></>) },
  { id: 'satellite', label: 'Satellite', icon: svg(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18" /><path d="M12 3a14 14 0 0 0 0 18" /></>) },
  { id: 'rotations', label: 'Rotations', icon: svg(<><path d="M20 11a8 8 0 0 0-14-4l-2 2" /><path d="M4 4v5h5" /><path d="M4 13a8 8 0 0 0 14 4l2-2" /><path d="M20 20v-5h-5" /></>) },
  { id: 'data', label: 'Data & share', icon: svg(<><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></>) },
]

export function TopBar({ place, onShare }: { place: string; onShare: () => void }) {
  return (
    <div className="topbar-wrap no-print">
      <div className="topbar">
        <a className="brand" href="#/summary" aria-label="Crop Rotation Explorer, home">
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <rect width="64" height="64" rx="16" fill="currentColor" />
            <path d="M32 52V30" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
            <path d="M32 33c-9 0-14-5-14-13 9 0 14 5 14 13Z" fill="#9be3c4" />
            <path d="M32 29c0-8 5-13 14-13 0 8-5 13-14 13Z" fill="#fff" />
          </svg>
          <span>Crop Rotation Explorer</span>
        </a>
        <span className="topbar-place" title="Location being analysed">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" /></svg>
          {place}
        </span>
        <span className="topbar-chip">NASA POWER · 2005–2024</span>
        <button type="button" className="topbar-share" onClick={onShare}>Share</button>
      </div>
    </div>
  )
}

/** Desktop: tab bar under the top bar. Phone: fixed bottom navigation bar. */
export function PageTabs({ tab, onChange, isMobile }: { tab: PageId; onChange: (id: PageId) => void; isMobile: boolean }) {
  const items = PAGES.filter((p) => isMobile || !p.mobileOnly)
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const next = items[(i + (e.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length]
    onChange(next.id)
    document.getElementById(`tab-${next.id}`)?.focus()
  }
  return (
    <nav className="tabs no-print" aria-label="Pages">
      <div className="tabs-inner" role="tablist">
        {items.map((p, i) => (
          <button
            key={p.id}
            id={`tab-${p.id}`}
            type="button"
            role="tab"
            aria-selected={tab === p.id}
            aria-controls={`page-${p.id}`}
            tabIndex={tab === p.id ? 0 : -1}
            className={`tab ${tab === p.id ? 'on' : ''}`}
            onClick={() => onChange(p.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {p.icon}
            <span>{p.label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}

/** Previous / next page buttons at the end of a page. */
export function PageNav({ tab, onChange }: { tab: PageId; onChange: (id: PageId) => void }) {
  const flow = PAGES.filter((p) => !p.mobileOnly)
  const i = flow.findIndex((p) => p.id === tab)
  const prev = i > 0 ? flow[i - 1] : null
  const next = i >= 0 && i < flow.length - 1 ? flow[i + 1] : null
  return (
    <div className="page-nav no-print">
      {prev ? (
        <button type="button" className="ghost" onClick={() => onChange(prev.id)}>
          <small>Previous</small>
          <span>← {prev.label}</span>
        </button>
      ) : <span />}
      {next && (
        <button type="button" className="ghost next" onClick={() => onChange(next.id)}>
          <small>Next</small>
          <span>{next.label} →</span>
        </button>
      )}
    </div>
  )
}

/** Numbered pagination with a "showing x-y of n" line. */
export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <nav className="pagination no-print" aria-label="Rotation pages">
      <span className="pagination-info" role="status">Showing {from}–{to} of {total} rotations</span>
      <div className="pagination-btns">
        <button type="button" className="ghost" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous rotations">‹</button>
        {Array.from({ length: pages }, (_, i) => (
          <button
            key={i}
            type="button"
            className={`ghost num ${page === i + 1 ? 'on' : ''}`}
            aria-current={page === i + 1 ? 'page' : undefined}
            aria-label={`Page ${i + 1}`}
            onClick={() => onChange(i + 1)}
          >
            {i + 1}
          </button>
        ))}
        <button type="button" className="ghost" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next rotations">›</button>
      </div>
    </nav>
  )
}

/** Placeholder shapes shown while the 20 years of NASA data load. */
export function Skeleton() {
  return (
    <div className="skeleton" role="status" aria-live="polite">
      <p className="visually-hidden">Loading 20 years of NASA POWER data…</p>
      <div className="sk sk-glance" />
      <div className="sk sk-card" />
      <div className="sk-row"><div className="sk sk-card" /><div className="sk sk-card" /></div>
      <p className="muted skeleton-note">Loading 20 years of NASA POWER data. The first load of a place takes about 10–15 seconds.</p>
    </div>
  )
}
