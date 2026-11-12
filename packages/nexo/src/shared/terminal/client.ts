import type { ArgsOf, CodeOf, ResultOf, Table } from './contract'
import { CommandError } from './errors'
import { check } from './schema'

/** What a transport is told: the command's name, its args, whether it only reads. */
export interface Call {
  name: string
  args: unknown
  read: boolean
}

/** How a call travels (pattern: strategy): `http()`, `tauri({ invoke })`, or yours. */
export interface Transport {
  send(call: Call, options?: { signal?: AbortSignal }): Promise<unknown>
}

/**
 * The client side: `commands.exec('book', { id }, { signal })`,
 * a plain promise; it rejects with a `CommandError`. Args are checked
 * before they leave, so a mistake fails here, not on the server.
 */
export class Client<T extends Table> {
  constructor(
    private readonly table: T,
    private readonly transport: Transport,
  ) {}

  async exec<K extends keyof T & string>(
    name: K,
    ...[args, options]: ArgsOf<T[K]> extends void
      ? [args?: undefined, options?: ExecOptions]
      : [args: ArgsOf<T[K]>, options?: ExecOptions]
  ): Promise<ResultOf<T[K]>> {
    const spec = this.table[name]
    if (!spec)
      throw new CommandError('unknownCommand', `terminal: no command "${name}"`)
    const sent = spec.args ? checked(spec.args, args, name) : undefined
    return (await this.transport.send(
      { name, args: sent, read: spec.read ?? false },
      { signal: options?.signal },
    )) as ResultOf<T[K]>
  }
}

export interface ExecOptions {
  /** Aborting it stops waiting (and, over HTTP, the request). */
  signal?: AbortSignal
}

function checked(
  schema: NonNullable<Table[string]['args']>,
  args: unknown,
  name: string,
): unknown {
  const result = check(schema, args)
  if (!result.issues) return result.value
  const message = `terminal: ${name}: ${result.issues.map(describe).join('; ')}`
  throw new CommandError('invalidArgs', message, result.issues, 400)
}

export function describe(issue: {
  message: string
  path?: readonly (PropertyKey | { readonly key: PropertyKey })[]
}): string {
  const keys = issue.path?.map((p) =>
    typeof p === 'object' && p !== null ? String(p.key) : String(p),
  )
  return keys?.length ? `${keys.join('.')}: ${issue.message}` : issue.message
}

export type { CodeOf }
