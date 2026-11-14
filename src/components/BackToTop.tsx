import { useEffect, useState } from 'react'

export function BackToTop() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 700)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  if (!show) return null
  return (
    <button type="button" className="back-to-top no-print" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
      ↑ Top
    </button>
  )
}
