/** A 0-100 score drawn as a ring. The colour is fixed: no pass mark or risk band is implied. */
export function ScoreRing({ value, label, muted = false }: { value: number; label: string; muted?: boolean }) {
  const v = Math.max(0, Math.min(100, Math.round(value)))
  const r = 38
  const c = 2 * Math.PI * r
  return (
    <div className={`ring ${muted ? 'muted-ring' : ''}`} role="img" aria-label={label}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="ring-track" cx="50" cy="50" r={r} />
        <circle className="ring-fill" cx="50" cy="50" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} />
      </svg>
      <div className="ring-num" aria-hidden="true">
        <span>
          {v}
          <small>/100</small>
        </span>
      </div>
    </div>
  )
}
