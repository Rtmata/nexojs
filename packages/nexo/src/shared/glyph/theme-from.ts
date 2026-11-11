import { ThemeDraft, type Theme } from './theme'
import type { ThemeError } from './theme-error'
import { isRecord, typedValue } from './theme-values'
import { DEFINITION, type Defined } from './token-set'

/** What `themeFrom` gives: the theme, or every mistake found. */
export type ThemeFromResult<D> =
  | { readonly ok: true; readonly theme: Theme<D> }
  | { readonly ok: false; readonly errors: readonly ThemeError[] }

/**
 * A theme from a JSON value a person wrote (C.4: Archive's own themes),
 * checked against the tokens: the same kind of theme `defineTheme` makes,
 * or every mistake as a `ThemeError` — where (`color.primry`), which kind
 * (`unknownToken`), its facts, and an English message (`color.primry: no
 * such token; did you mean color.primary?`); the contrast pairs that fall
 * short too. Nothing throws for a wrong JSON: it is data, not code. The JSON holds `name`, an optional
 * `colorScheme` and the groups it changes over the tokens' own values.
 *
 *   const result = themeFrom(tokens, JSON.parse(text))
 *   if (result.ok) adoptTheme(result.theme, { signal })
 *   else show(result.errors.map((error) => error.message))
 */
export function themeFrom<D>(
  tokens: Defined<D>,
  json: unknown,
): ThemeFromResult<D> {
  if (!isRecord(json)) return { ok: false, errors: [notAnObject(json)] }
  const draft = draftOf(tokens, json)
  const errors = draft.errors()
  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, theme: draft.theme() }
}

/** The JSON as a theme over the tokens' own values: no `from`, no pairs of its own. */
function draftOf<D>(
  tokens: Defined<D>,
  json: Record<string, unknown>,
): ThemeDraft<D> {
  const { name, colorScheme, ...changes } = json
  const parts = { name, colorScheme, checks: [], changes }
  const set = tokens[DEFINITION]
  return new ThemeDraft<D>({ tokens: set, base: set }, parts, typedValue)
}

function notAnObject(value: unknown): ThemeError {
  const message = `theme: ${JSON.stringify(value)} is not an object`
  return { path: '', code: 'notAnObject', data: { value }, message }
}
