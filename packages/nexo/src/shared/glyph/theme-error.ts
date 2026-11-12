import type { ColorScheme, ThemeScheme } from './token-set'
import type { TokenType } from './typed'

/**
 * One mistake of one kind: where, which kind, the facts its message is
 * made from, and the message in English.
 */
interface Mistake<C extends string, D> {
  /** Where: `color.surface`, `name`, or `''` for the whole JSON. */
  readonly path: string
  readonly code: C
  /** The facts, to say the mistake in another language (voices). */
  readonly data: D
  /** The mistake in English, with where: `color.txt: no such token; …`. */
  readonly message: string
}

/**
 * A mistake in a theme a person wrote, told by `themeFrom`. One type
 * per `code`, so `switch (error.code)` knows its `data`:
 *
 *   es: { notAColor: ({ value }) => `«${value}» no es un color`, … }
 *   t(lang).theme[error.code](error.data)
 */
export type ThemeError =
  | Mistake<'notAnObject', { readonly value: unknown }>
  | Mistake<'badName', { readonly value: unknown }>
  | Mistake<
      'badColorScheme',
      { readonly value: unknown; readonly allowed: readonly ThemeScheme[] }
    >
  | Mistake<'unknownGroup', Unknown>
  | Mistake<'unknownToken', Unknown>
  | Mistake<
      'wrongKind',
      { readonly value: unknown; readonly expected: TokenType }
    >
  | Mistake<'notAColor', { readonly value: unknown }>
  | Mistake<'missingReference', MissingReference>
  | Mistake<'referenceCycle', { readonly chain: readonly string[] }>
  | Mistake<'unsafeText', { readonly value: string }>
  | Mistake<'lowContrast', LowContrast>
  | Mistake<'translucent', { readonly value: string }>

/** A name that isn't there, and the nearest one that is, if any is near. */
interface Unknown {
  readonly name: string
  readonly suggestion?: string
}

/** `var(--name)` where no token is called `name`, and the nearest that is. */
interface MissingReference {
  readonly value: string
  readonly name: string
  readonly suggestion?: string
}

/** A pair that falls short; `path` is its foreground. */
interface LowContrast {
  /** The background's path: `color.surface`. */
  readonly background: string
  /** Only when the pair was measured in both schemes and differs. */
  readonly scheme?: ColorScheme
  /** Rounded down to two decimals, as the message shows it. */
  readonly ratio: number
  readonly required: number
}

/** A mistake found in a value, before it is known where: `at` places it. */
export type ValueFault = FactsOf<
  Extract<
    ThemeError,
    { code: 'wrongKind' | 'notAColor' | 'missingReference' | 'unsafeText' }
  >
> & { readonly text: string }

type FactsOf<E> = E extends ThemeError
  ? { readonly code: E['code']; readonly data: E['data'] }
  : never

/** The fault at `path`, its message starting with where. */
export function at(path: string, { code, data, text }: ValueFault): ThemeError {
  return { path, code, data, message: `${path}: ${text}` } as ThemeError
}
