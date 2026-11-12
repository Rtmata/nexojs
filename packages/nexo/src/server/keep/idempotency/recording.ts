import { hex } from '../random'
import type { RecordedResponse } from './store'
import { BODY_CAP, REPLAYED_HEADER } from './vocabulary'

/** The request as a short string: the same key with another request is a client's mistake. */
export async function fingerprintOf(request: Request): Promise<string> {
  const body = await request.clone().arrayBuffer()
  const head = new TextEncoder().encode(`${request.method} ${request.url}\n`)
  const bytes = new Uint8Array(head.length + body.byteLength)
  bytes.set(head)
  bytes.set(new Uint8Array(body), head.length)
  return hex(await crypto.subtle.digest('SHA-256', bytes))
}

/**
 * The response read whole and given back as a fresh one carrying the same
 * bytes (a stream is buffered: an answer to a form is short), with what
 * is kept of it — nothing when too big to keep.
 */
export async function recordingOf(
  response: Response,
): Promise<{ sent: Response; kept: RecordedResponse | null }> {
  const bytes = response.body
    ? new Uint8Array(await response.arrayBuffer())
    : null
  const sent = new Response(bytes, response)
  if (bytes && bytes.byteLength > BODY_CAP) return { sent, kept: null }
  const headers = [...response.headers]
  return { sent, kept: { status: response.status, headers, body: bytes } }
}

/** The recorded response, played again, and saying so. */
export function replay(recorded: RecordedResponse): Response {
  const headers = new Headers(recorded.headers)
  headers.set(REPLAYED_HEADER, 'true')
  const body = recorded.body ? new Uint8Array(recorded.body) : null
  return new Response(body, { status: recorded.status, headers })
}
