import type { Transport } from './client'
import { CommandError } from './errors'

/** Tauri's `invoke`, given as a value: terminal imports no Tauri package. */
export type Invoke = (
  command: string,
  args?: Record<string, unknown>,
) => Promise<unknown>

/**
 * Commands through Tauri's `invoke` (A.2). Rust already checks the types, so
 * a table of `custom<T>()` is enough here. A rejected command's
 * `{ kind, message }` becomes a `CommandError` with `code = kind` (R.25).
 * `invoke` can't be cancelled (tauri#8351): aborting stops waiting, the Rust
 * command keeps running.
 */
export function tauri(options: { invoke: Invoke }): Transport {
  return {
    send(call, { signal } = {}) {
      const args = (call.args ?? undefined) as
        Record<string, unknown> | undefined
      return untilAborted(
        invoked(options.invoke, call.name, args).catch(toCommandError),
        signal,
      )
    },
  }
}

/** Archive's `{ kind, message }` keeps its kind as the code; anything else is internal. */
function toCommandError(error: unknown): never {
  const { kind, message } = (
    typeof error === 'object' && error !== null ? error : {}
  ) as { kind?: string; message?: string }
  if (typeof kind === 'string')
    throw new CommandError(kind, message ?? kind, error)
  const text = typeof error === 'string' ? error : 'internal error'
  throw new CommandError('internal', text, error)
}

/** The promise, unless the signal aborts first: then its reason. */
function untilAborted<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    const done = () => signal.removeEventListener('abort', abort)
    promise.then(resolve, reject).finally(done)
  })
}

/** `invoke` as a promise even when it throws synchronously (no Tauri runtime, a bad arg type). */
function invoked(
  invoke: Invoke,
  name: string,
  args: Record<string, unknown> | undefined,
): Promise<unknown> {
  try {
    return Promise.resolve(invoke(name, args))
  } catch (error) {
    return Promise.reject(error)
  }
}
