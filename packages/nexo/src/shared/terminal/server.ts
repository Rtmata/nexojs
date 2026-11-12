import { describe } from './client'
import {
  failFor,
  type ArgsOf,
  type CommandSpec,
  type Fail,
  type ResultOf,
  type Table,
} from './contract'
import { Failure, RESERVED, type ReservedCode } from './errors'
import { BASE } from './http'
import { check } from './schema'

/** What each command's handler gets besides its args: its way out, the request's signal, the request. */
export interface Run<C extends CommandSpec> {
  fail: Fail<C>
  /** `request.signal`: aborts when the caller gives up. */
  signal: AbortSignal
  request: Request
}

export type Handlers<T extends Table> = {
  [K in keyof T]: (
    args: ArgsOf<T[K]>,
    run: Run<T[K]>,
  ) => ResultOf<T[K]> | Promise<ResultOf<T[K]>>
}

/** keep's hooks shape, met structurally: terminal imports no server. */
export interface ServeHooks {
  onRequest(ctx: { request: Request }): Promise<Response | undefined>
}

/**
 * The server side: answers `<base>/<name>`, validates the
 * args ALWAYS (an invalid one never reaches the handler), sends declared
 * errors with their status, masks anything else as `internal`.
 *
 *   keep({ router }).use(commands.serve({ book: ({ id }, { fail }) => find(id) ?? fail('notFound') }))
 */
export class CommandServer<T extends Table> implements ServeHooks {
  constructor(
    private readonly table: T,
    private readonly handlers: Handlers<T>,
    private readonly base = BASE,
  ) {}

  /** A property, not a method: keep calls its hooks on their own. */
  readonly onRequest = async ({
    request,
  }: {
    request: Request
  }): Promise<Response | undefined> => {
    const url = new URL(request.url)
    if (!url.pathname.startsWith(`${this.base}/`)) return undefined
    const name = nameIn(url.pathname.slice(this.base.length + 1))
    return this.answer(name, request, url).catch((error) =>
      this.unexpected(error),
    )
  }

  private async answer(
    name: string,
    request: Request,
    url: URL,
  ): Promise<Response> {
    const spec = this.table[name]
    if (!spec || !Object.hasOwn(this.handlers, name))
      return reply('unknownCommand', `no command "${name}"`)
    const refusal = refused(spec, request)
    if (refusal) return refusal
    const args = await argsOf(spec, request, url)
    if (args instanceof Response) return args
    return this.run(name, spec, args, request)
  }

  private async run(
    name: string,
    spec: CommandSpec,
    args: unknown,
    request: Request,
  ): Promise<Response> {
    try {
      return json(200, (await this.call(name, args, request)) ?? null)
    } catch (error) {
      if (error instanceof Failure) return declared(spec, error)
      throw error
    }
  }

  private call(name: string, args: unknown, request: Request): unknown {
    const handler = this.handlers[name] as (
      args: unknown,
      run: Run<CommandSpec>,
    ) => unknown
    return handler(args, { fail: failFor(), signal: request.signal, request })
  }

  /** A bug: reported here, masked there. */
  private unexpected(error: unknown): Response {
    console.error('terminal: a command failed unexpectedly\n', error)
    return reply('internal', 'internal error')
  }
}

/** The command's name from the path; one that isn't valid percent-encoding names nothing. */
function nameIn(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/**
 * POST always, as JSON: a `content-type` another site's form or `no-cors`
 * fetch can't send without a preflight, which nothing here answers
 * (CSRF). GET only for `read` commands, never from another site's
 * navigation.
 */
function refused(spec: CommandSpec, request: Request): Response | undefined {
  if (request.method === 'POST') return notJson(request)
  if (request.method !== 'GET' || !spec.read) return notAllowed(spec, request)
  if (isCrossSiteNavigation(request))
    return reply('forbidden', 'a read from another site is refused')
  return undefined
}

function notJson(request: Request): Response | undefined {
  const type = request.headers.get('content-type') ?? ''
  if (/^application\/json\b/i.test(type)) return undefined
  return reply(
    'unsupportedMediaType',
    'a command is posted as application/json',
  )
}

function notAllowed(spec: CommandSpec, request: Request): Response {
  const allow = spec.read ? 'GET, POST' : 'POST'
  return reply(
    'methodNotAllowed',
    `${request.method} is not allowed here`,
    undefined,
    { allow },
  )
}

/** The one case `SameSite=Lax` cookies ride along (oRPC's GET guard). */
function isCrossSiteNavigation(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site')
  return (
    site === 'cross-site' &&
    request.headers.get('sec-fetch-mode') === 'navigate'
  )
}

/** The args, valid, or the response that says why not. A command with no `args` takes none. */
async function argsOf(
  spec: CommandSpec,
  request: Request,
  url: URL,
): Promise<unknown> {
  const raw = await rawArgs(request, url)
  if (raw instanceof Response) return raw
  if (!spec.args) return noArgs(raw)
  const result = check(spec.args, raw)
  if (!result.issues) return result.value
  return reply(
    'invalidArgs',
    result.issues.map(describe).join('; '),
    result.issues.map(bare), // message and path only: a third-party schema's issue may carry the rejected input (a password)
  )
}

function bare(issue: { message: string; path?: readonly unknown[] }) {
  const path = issue.path?.map((p) =>
    typeof p === 'object' && p !== null
      ? String((p as { key: unknown }).key)
      : String(p),
  )
  return path ? { message: issue.message, path } : { message: issue.message }
}

function noArgs(raw: unknown): unknown {
  if (raw === null || raw === undefined) return undefined
  return reply('invalidArgs', 'this command takes no args')
}

async function rawArgs(request: Request, url: URL): Promise<unknown> {
  try {
    if (request.method === 'GET')
      return JSON.parse(url.searchParams.get('args') ?? 'null')
    return await request.json()
  } catch {
    return reply('invalidArgs', 'the args are not JSON')
  }
}

function declared(spec: CommandSpec, failure: Failure): Response {
  const error = declaredError(spec, failure.code)
  return json(error.status, {
    code: failure.code,
    message: failure.message,
    data: failure.data,
  })
}

/** The command's own declaration of `code` (not an inherited key: `fail('toString')`), or an error. */
function declaredError(spec: CommandSpec, code: string) {
  const errors = spec.errors ?? {}
  if (Object.hasOwn(errors, code)) return errors[code]!
  throw new Error(`terminal: "${code}" is not one of this command's errors`)
}

function reply(
  code: ReservedCode,
  message: string,
  data?: unknown,
  headers?: Record<string, string>,
): Response {
  return json(RESERVED[code], { code, message, data }, headers)
}

function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  })
}
