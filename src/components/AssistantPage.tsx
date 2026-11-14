import { useEffect, useRef, useState } from 'react'
import { ERROR_TEXT, askAssistant } from '../lib/assistClient'
import type { AssistStatus } from '../lib/assistClient'
import { MAX_MESSAGES, MAX_MESSAGE_CHARS, applyPatch, describePatch, mergePatch, stateFromInputs } from '../lib/assistSchema'
import type { AssistMessage, AssistPatch } from '../lib/assistSchema'
import type { Inputs } from '../state'
import './Assist.css'

interface Props {
  inputs: Inputs
  place: string
  status: AssistStatus | null
  onApply: (patch: AssistPatch) => void
  onSeeResults: () => void
  onSetup: () => void
}

const INTRO: AssistMessage = {
  role: 'assistant',
  content:
    'Hi! Tell me about your farm in your own words and I will ask a few short questions, then propose a setup for you to check. To begin: what do you grow now, season by season?',
}

const STARTERS = [
  'I grow rice, then rice again, then leave the land bare',
  'I have no irrigation, only rain',
  'Saving water and soil health matter most to me',
  'What if it gets 2 °C warmer and 20% drier?',
]

/** Chat that fills in the same form as “Fill in myself”. The model proposes; the person confirms; the NASA-data engine scores. */
export function AssistantPage({ inputs, place, status, onApply, onSeeResults, onSetup }: Props) {
  const [messages, setMessages] = useState<AssistMessage[]>([INTRO])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<AssistPatch | null>(null)
  const [ready, setReady] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const log = useRef<HTMLDivElement>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    const el = log.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy])
  useEffect(() => () => abort.current?.abort(), [])

  const limitReached = messages.length >= MAX_MESSAGES
  const proposal = pending ? describePatch(pending) : []

  const send = async (raw: string) => {
    const content = raw.trim()
    if (!content || busy || limitReached) return
    const next: AssistMessage[] = [...messages, { role: 'user', content }]
    setMessages(next)
    setText('')
    setError(null)
    setNotice(null)
    setBusy(true)
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    // The assistant also sees what you have already agreed to apply and what is waiting for your confirmation.
    const view = pending ? applyPatch(inputs, pending) : inputs
    const result = await askAssistant(next, stateFromInputs(view, place), ctrl.signal)
    if (ctrl.signal.aborted) return
    setBusy(false)
    if (!result.ok) {
      setMessages(messages) // take the message back so it can be sent again
      setText(content)
      setError(ERROR_TEXT[result.error])
      return
    }
    setMessages([...next, { role: 'assistant', content: result.data.reply }])
    if (Object.keys(result.data.patch).length > 0) setPending((p) => mergePatch(p ?? {}, result.data.patch))
    setReady(result.data.ready)
  }

  const apply = (thenResults: boolean) => {
    if (!pending) return
    onApply(pending)
    setPending(null)
    setReady(false)
    setNotice('Applied to your setup. You can check every field under “Fill in myself”, and keep chatting to change more.')
    if (thenResults) onSeeResults()
  }

  const restart = () => {
    abort.current?.abort()
    setMessages([INTRO])
    setPending(null)
    setReady(false)
    setError(null)
    setNotice(null)
    setBusy(false)
    setText('')
  }

  if (status === null) {
    return <section className="card assist"><h2>Ask the AI assistant</h2><p className="muted" role="status">Checking whether the assistant is available…</p></section>
  }
  if (!status.configured) {
    return (
      <section className="card assist">
        <h2>Ask the AI assistant <span className="beta">beta</span></h2>
        <p>The AI assistant is not switched on for this site right now. Everything works without it: fill in the setup by hand and compare the rotations.</p>
        <button type="button" onClick={onSetup}>Open the manual setup</button>
      </section>
    )
  }

  return (
    <section className="card assist" aria-label="AI assistant">
      <header className="assist-head">
        <div>
          <h2>Ask the AI assistant <span className="beta">beta</span></h2>
          <p className="muted">
            Describe your farm in your own words. It asks a few questions, then proposes a setup for you to check. It never changes
            your location and never calculates scores: the same NASA-data engine does that.
          </p>
        </div>
        <button type="button" className="ghost" onClick={restart}>Start over</button>
      </header>

      <div className="chat-log" ref={log} role="log" aria-live="polite" aria-label="Conversation">
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            <span className="visually-hidden">{m.role === 'user' ? 'You: ' : 'Assistant: '}</span>
            {m.content}
          </div>
        ))}
        {busy && <div className="bubble assistant typing" role="status"><span /><span /><span /><span className="visually-hidden">The assistant is typing</span></div>}
      </div>

      {error && <p className="banner" role="alert">{error}</p>}

      {proposal.length > 0 && (
        <div className={`proposal ${ready ? 'ready' : ''}`} aria-label="Proposed setup">
          <h3>{ready ? 'Ready: check and apply this setup' : 'Proposed so far'}</h3>
          <ul>{proposal.map((l) => <li key={l}>{l}</li>)}</ul>
          <div className="proposal-actions">
            <button type="button" onClick={() => apply(true)}>Apply and see results</button>
            <button type="button" className="ghost" onClick={() => apply(false)}>Apply and keep chatting</button>
            <button type="button" className="link" onClick={() => { setPending(null); setReady(false) }}>Discard</button>
          </div>
        </div>
      )}
      {notice && <p className="notice" role="status">{notice} <button type="button" className="link" onClick={onSeeResults}>See results →</button></p>}

      {messages.length === 1 && (
        <div className="starters" aria-label="Example messages">
          {STARTERS.map((s) => <button key={s} type="button" className="chip-btn" onClick={() => void send(s)} disabled={busy}>{s}</button>)}
        </div>
      )}

      <form className="chat-form" onSubmit={(e) => { e.preventDefault(); void send(text) }}>
        <label className="visually-hidden" htmlFor="assist-input">Your message</label>
        <textarea
          id="assist-input"
          rows={2}
          value={text}
          maxLength={MAX_MESSAGE_CHARS}
          placeholder={limitReached ? 'This conversation is full. Apply the setup or start over.' : 'Type here, for example: I grow maize and soybean, no irrigation…'}
          disabled={busy || limitReached}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(text) } }}
        />
        <button type="submit" disabled={busy || limitReached || text.trim() === ''}>Send</button>
      </form>

      <p className="muted assist-privacy">
        Powered by Groq{status.model ? ` (model ${status.model}, open-weight, Apache-2.0)` : ''}. Your messages and a short summary of the setup form are
        sent to Groq to write the replies. Do not type names, phone numbers or other personal details. AI can be wrong: check every value before
        applying it.
      </p>
    </section>
  )
}
