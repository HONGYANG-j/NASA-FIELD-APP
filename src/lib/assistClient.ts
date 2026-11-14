import { cleanText, sanitizePatch } from './assistSchema'
import type { AssistMessage, AssistReply, AssistState } from './assistSchema'

export type AssistError = 'not_configured' | 'rate_limited' | 'busy' | 'timeout' | 'upstream' | 'network' | 'invalid'

export interface AssistStatus {
  configured: boolean
  model: string | null
}

/** Asks the Worker whether the assistant is switched on. Any failure counts as "not available". */
export async function fetchAssistStatus(signal?: AbortSignal): Promise<AssistStatus> {
  try {
    const res = await fetch('/api/assist', { signal })
    if (!res.ok) return { configured: false, model: null }
    const data: unknown = await res.json()
    if (typeof data !== 'object' || data === null) return { configured: false, model: null }
    const d = data as Record<string, unknown>
    return { configured: d.configured === true, model: typeof d.model === 'string' ? d.model : null }
  } catch {
    return { configured: false, model: null }
  }
}

const BY_CODE: Record<string, AssistError> = {
  not_configured: 'not_configured',
  rate_limited: 'rate_limited',
  busy: 'busy',
  upstream_timeout: 'timeout',
  upstream: 'upstream',
}

/** Sends the conversation and the current form summary. The reply is validated again here, whatever the server said. */
export async function askAssistant(
  messages: AssistMessage[],
  state: AssistState,
  signal?: AbortSignal,
): Promise<{ ok: true; data: AssistReply } | { ok: false; error: AssistError }> {
  let res: Response
  try {
    res = await fetch('/api/assist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages, state }),
      signal,
    })
  } catch {
    return { ok: false, error: 'network' }
  }
  let body: unknown
  try {
    body = await res.json()
  } catch {
    return { ok: false, error: res.ok ? 'invalid' : 'upstream' }
  }
  const b = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  if (!res.ok) return { ok: false, error: BY_CODE[String(b.error)] ?? 'upstream' }
  const reply = cleanText(b.reply, 700)
  if (!reply) return { ok: false, error: 'invalid' }
  return { ok: true, data: { reply, patch: sanitizePatch(b.patch), ready: b.ready === true } }
}

export const ERROR_TEXT: Record<AssistError, string> = {
  not_configured: 'The AI assistant is not switched on for this site right now. You can do everything by hand under “Fill in myself”.',
  rate_limited: 'You are sending messages very quickly. Please wait a minute and try again.',
  busy: 'The AI service is busy at the moment. Please try again in a minute, or use “Fill in myself”.',
  timeout: 'The AI service took too long to answer. Please try again, or use “Fill in myself”.',
  upstream: 'The AI service had a problem. Please try again, or use “Fill in myself”.',
  network: 'Could not reach the assistant. Check your connection, or use “Fill in myself”.',
  invalid: 'The assistant sent a reply that could not be used. Please try again.',
}
