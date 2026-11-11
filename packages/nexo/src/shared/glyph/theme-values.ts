import { didYouMean } from './closest'
import { readColor } from './color/read'
import { cssValue, EXPECTED, isLightDark, type TokenGroup } from './token-group'
import type { TokenSet } from './token-set'
import type { TokenType } from './typed'

/** What is wrong with a written value, or `undefined` when nothing is. */
export type ValueCheck = (type: TokenType, value: unknown) => string | undefined

/** Characters that would end the declaration or the rule, or the `<style>` around it. */
const BREAKS_OUT = /[;{}<>\\\n\r]/

/**
 * A value written in code: only its kind, as `defineTokens` checks (any
 * CSS colour stays allowed, `color-mix()` included; TS checks it too).
 */
export function codeValue(type: TokenType, value: unknown): string | undefined {
  if (cssValue(type, value) !== undefined) return undefined
  return `${JSON.stringify(value)} is not ${EXPECTED[type]}`
}

/**
 * A value a person typed (C.4): its kind, then a colour must be one glyph
 * can read — so the contrast can be measured — and any other text must
 * stay inside its declaration.
 */
export function typedValue(
  type: TokenType,
  value: unknown,
): string | undefined {
  const kind = codeValue(type, value)
  if (kind) return kind
  return type === 'color' ? colorProblem(value) : textProblem(value)
}

/**
 * Every change that names no token or holds a wrong value, one line each,
 * saying where: `color.primry: no such token; did you mean color.primary?`.
 */
export function changeProblems(
  set: TokenSet,
  changes: Readonly<Record<string, unknown>>,
  check: ValueCheck,
): string[] {
  return Object.entries(changes).flatMap(([name, tokens]) => {
    const group = set.group(name)
    if (!group)
      return [
        `${name}: no such token group${didYouMean(name, set.groupNames())}`,
      ]
    if (!isRecord(tokens))
      return [`${name}: ${JSON.stringify(tokens)} is not an object of tokens`]
    return tokenProblems(group, tokens, check)
  })
}

function tokenProblems(
  group: TokenGroup,
  tokens: Readonly<Record<string, unknown>>,
  check: ValueCheck,
): string[] {
  return Object.entries(tokens).flatMap(([token, value]) => {
    const where = `${group.name}.${token}`
    if (!group.has(token))
      return [
        `${where}: no such token${didYouMean(token, group.tokenNames(), `${group.name}.`)}`,
      ]
    const problem = check(group.type, value)
    return problem ? [`${where}: ${problem}`] : []
  })
}

function colorProblem(value: unknown): string | undefined {
  const sides = isLightDark(value) ? [value.light, value.dark] : [value]
  return sides.map(unreadable).find((problem) => problem !== undefined)
}

function unreadable(side: unknown): string | undefined {
  if (typeof side !== 'string') return `${JSON.stringify(side)} is not a colour`
  try {
    readColor(side)
    return undefined
  } catch (error) {
    return (error as Error).message.replace(/^glyph: /, '')
  }
}

function textProblem(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const unclosed = ['"', "'"].some((q) => value.split(q).length % 2 === 0)
  if (!BREAKS_OUT.test(value) && !unclosed) return undefined
  return `${JSON.stringify(value)} can't be a CSS value here: ; { } < > \\, line breaks and unclosed quotes aren't allowed`
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
