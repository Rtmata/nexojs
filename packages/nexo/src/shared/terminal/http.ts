import type { Call, Transport } from './client'
import { CommandError } from './errors'

export const BASE = '/_nexo/terminal'

export interface HttpOptions {
  /** Where the server's commands are. `/_nexo/terminal` by default. */
  base?: string
  /** Your `fetch`, for a test or another origin: called as `fetch(url, init)`. */
  fetch?: (url: string, init: RequestInit) => Promise<Response>
}

/**
 * Commands over HTTP: `POST <base>/<name>` with JSON args; a
 * command that only reads goes as `GET <base>/<name>?args=…`, cacheable.
 * A declared error comes back with its status and `{ code, message, data }`.
 */
export function http(options: HttpOptions = {}): Transport {
  const base = options.base ?? BASE
  const fetch_ = options.fetch ?? ((url, init) => fetch(url, init))
  return {
    async send(call, { signal } = {}) {
      const response = await fetch_(...request(base, call, signal)).catch(
        unreachable,
      )
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
  const text = await response.text()
  const body = parsed(text)
  if (response.ok && body === NOT_JSON) throw notJson(response, text)
  if (response.ok) return body
  throw failure(response, text, body)
}

/** The server's structured error, or what it did send (a proxy's text) with the status. */
function failure(
  response: Response,
  text: string,
  body: unknown,
): CommandError {
  const given = body === NOT_JSON ? {} : ((body ?? {}) as Record<string, any>)
  const {
    code = 'internal',
    message = text || response.statusText,
    data,
  } = given
  return new CommandError(code, message, data, response.status)
}

/** A 2xx that isn't JSON (a captive portal, a proxy's HTML page) is no result. */
function notJson(response: Response, text: string): CommandError {
  const message = `not a JSON reply (${response.status})`
  return new CommandError(
    'internal',
    message,
    text.slice(0, 200),
    response.status,
  )
}

const NOT_JSON = Symbol('not JSON')

function parsed(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return NOT_JSON
  }
}

/** No reply at all (offline, DNS, CORS): still a `CommandError`, so `isCommandError` holds everywhere. An abort keeps its reason. */
function unreachable(error: unknown): never {
  if ((error as DOMException)?.name === 'AbortError') throw error
  const message = error instanceof Error ? error.message : String(error)
  throw new CommandError('unreachable', `no reply: ${message}`, error)
}
