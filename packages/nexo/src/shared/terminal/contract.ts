import { CommandError, Failure } from './errors'
import { type Output, type StandardSchemaV1 } from './schema'

/** One declared error: its HTTP status and, maybe, the shape of its data. */
export interface ErrorSpec {
  status: number
  data?: StandardSchemaV1<any>
}

/** One command: what it takes, what it gives, how it may fail, whether it only reads. */
export interface CommandSpec {
  args?: StandardSchemaV1<any>
  result?: StandardSchemaV1<any>
  errors?: Record<string, ErrorSpec>
  /** Side-effect free: it also answers GET, cacheable. */
  read?: boolean
}

export type Table = Record<string, CommandSpec>

export type ArgsOf<C extends CommandSpec> =
  C['args'] extends StandardSchemaV1<any> ? Output<C['args']> : void
export type ResultOf<C extends CommandSpec> =
  C['result'] extends StandardSchemaV1<any> ? Output<C['result']> : unknown
export type CodeOf<C extends CommandSpec> = keyof NonNullable<C['errors']> &
  string

/** The handler's way out: a declared code, typed. */
export type Fail<C extends CommandSpec> = <K extends CodeOf<C>>(
  code: K,
  data?: NonNullable<C['errors']>[K]['data'] extends StandardSchemaV1<any>
    ? Output<NonNullable<C['errors']>[K]['data']>
    : unknown,
  message?: string,
) => never

export function failFor<C extends CommandSpec>(): Fail<C> {
  return ((code: string, data?: unknown, message?: string) => {
    throw new Failure(code, data, message)
  }) as Fail<C>
}

export { CommandError }
