import type { Call, Transport } from './client'
import { CommandError } from './errors'

export const BASE = '/_nexo/terminal'

export interface HttpOptions {
  /** Where the server's commands are (R.26). `/_nexo/terminal` by default. */
  base?: string
  /** Your `fetch`, for a test or another origin: called as `fetch(url, init)`. */
  fetch?: (url: string, init: RequestInit) => Promise<Response>
}

/**
 * Commands over HTTP (R.26): `POST <base>/<name>` with JSON args; a
 * command that only reads goes as `GET <base>/<name>?args=…`, cacheable.
 * A declared error comes back with its status and `{ code, message, data }`.
 */
export function http(options: HttpOptions = {}): Transport {
  const base = options.base ?? BASE
  const fetch_ = options.fetch ?? ((url, init) => fetch(url, init))
  return {
    async send(call, signal) {
      const response = await fetch_(...request(base, call, signal))
      return answer(response)
    },
  }
}

function request(
  base: string,
  call: Call,
  signal?: AbortSignal,
): [string, RequestInit] {
  const url = `${base}/${encodeURIComponent(call.name)}`
  const body = JSON.stringify(call.args ?? null)
  if (call.read) return [`${url}?args=${encodeURIComponent(body)}`, { signal }]
  const headers = { 'content-type': 'application/json' }
  return [url, { method: 'POST', headers, body, signal }]
}

async function answer(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => null)
  if (response.ok) return body
  const {
    code = 'internal',
    message = response.statusText,
    data,
  } = (body ?? {}) as Record<string, any>
  throw new CommandError(code, message, data, response.status)
}
