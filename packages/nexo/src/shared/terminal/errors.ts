/** Codes terminal itself answers with, besides each command's own (R.25, R.26). */
export const RESERVED = {
  invalidArgs: 400,
  forbidden: 403,
  unknownCommand: 404,
  methodNotAllowed: 405,
  internal: 500,
} as const

export type ReservedCode = keyof typeof RESERVED

/**
 * A command that failed as its contract says it may (R.25): a code, a
 * message, maybe data. What the client's promise rejects with, so a
 * `resource` (B.10) holds it in its `error`.
 */
export class CommandError<
  Code extends string = string,
  Data = unknown,
> extends Error {
  constructor(
    readonly code: Code,
    message: string,
    readonly data?: Data,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'CommandError'
  }
}

/**
 * Whether `error` is a command's failure, of one code when given:
 *
 *   catch (e) { if (isCommandError(e, 'notFound')) show('No such book') }
 */
export function isCommandError<C extends string>(
  error: unknown,
  code?: C,
): error is CommandError<C> {
  return (
    error instanceof CommandError && (code === undefined || error.code === code)
  )
}

/** What a handler throws through `fail()`: a declared error, on its way to the response. */
export class Failure {
  constructor(
    readonly code: string,
    readonly data?: unknown,
    readonly message = code,
  ) {}
}
