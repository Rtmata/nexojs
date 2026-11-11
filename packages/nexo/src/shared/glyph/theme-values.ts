import { closest, didYouMean } from './closest'
import { readColor } from './color/read'
import { at, type ThemeError, type ValueFault } from './theme-error'
import { cssValue, EXPECTED, isLightDark, type TokenGroup } from './token-group'
import type { TokenSet } from './token-set'
import type { TokenType } from './typed'

/** What is wrong with a written value, or `undefined` when nothing is. */
export type ValueCheck = (
  type: TokenType,
  value: unknown,
) => ValueFault | undefined

/** Characters that would end the declaration or the rule, or the `<style>` around it. */
const BREAKS_OUT = /[;{}<>\\\n\r]/

/**
 * A value written in code: only its kind, as `defineTokens` checks (any
 * CSS colour stays allowed, `color-mix()` included; TS checks it too).
 */
export function codeValue(
  type: TokenType,
  value: unknown,
): ValueFault | undefined {
  if (cssValue(type, value) !== undefined) return undefined
  const text = `${JSON.stringify(value)} is not ${EXPECTED[type]}`
  return { code: 'wrongKind', data: { value, expected: type }, text }
}

/**
 * A value a person typed (C.4): its kind, then a colour must be one glyph
 * can read — so the contrast can be measured — and any other text must
 * stay inside its declaration.
 */
export function typedValue(
  type: TokenType,
  value: unknown,
): ValueFault | undefined {
  const kind = codeValue(type, value)
  if (kind) return kind
  return type === 'color' ? colorProblem(value) : textProblem(value)
}

/**
 * Every change that names no token or holds a wrong value, one each,
 * saying where: `color.primry: no such token; did you mean color.primary?`.
 */
export function changeProblems(
  set: TokenSet,
  changes: Readonly<Record<string, unknown>>,
  check: ValueCheck,
): ThemeError[] {
  return Object.entries(changes).flatMap(([name, tokens]) => {
    const group = set.group(name)
    if (!group) return [unknownGroup(name, set.groupNames())]
    if (!isRecord(tokens)) return [notTokens(name, tokens)]
    return tokenProblems(group, tokens, check)
  })
}

function tokenProblems(
  group: TokenGroup,
  tokens: Readonly<Record<string, unknown>>,
  check: ValueCheck,
): ThemeError[] {
  return Object.entries(tokens).flatMap(([token, value]) => {
    const where = `${group.name}.${token}`
    if (!group.has(token)) return [unknownToken(group, token)]
    const fault = check(group.type, value)
    return fault ? [at(where, fault)] : []
  })
}

function unknownGroup(name: string, names: readonly string[]): ThemeError {
  const suggestion = closest(name, names)
  const message = `${name}: no such token group${didYouMean(name, names)}`
  return {
    path: name,
    code: 'unknownGroup',
    data: { name, suggestion },
    message,
  }
}

function notTokens(name: string, value: unknown): ThemeError {
  const message = `${name}: ${JSON.stringify(value)} is not an object of tokens`
  return { path: name, code: 'notAnObject', data: { value }, message }
}

function unknownToken(group: TokenGroup, name: string): ThemeError {
  const path = `${group.name}.${name}`
  const names = group.tokenNames()
  const suggestion = closest(name, names)
  const message = `${path}: no such token${didYouMean(name, names, `${group.name}.`)}`
  return { path, code: 'unknownToken', data: { name, suggestion }, message }
}

function colorProblem(value: unknown): ValueFault | undefined {
  const sides = isLightDark(value) ? [value.light, value.dark] : [value]
  return sides.map(unreadable).find((fault) => fault !== undefined)
}

function unreadable(side: unknown): ValueFault | undefined {
  if (typeof side !== 'string')
    return {
      code: 'notAColor',
      data: { value: side },
      text: `${JSON.stringify(side)} is not a colour`,
    }
  try {
    readColor(side)
    return undefined
  } catch (error) {
    const text = (error as Error).message.replace(/^glyph: /, '')
    const code = /^\s*var\(/i.test(side) ? 'isAReference' : 'notAColor'
    return { code, data: { value: side }, text }
  }
}

function textProblem(value: unknown): ValueFault | undefined {
  if (typeof value !== 'string') return undefined
  const unclosed = ['"', "'"].some((q) => value.split(q).length % 2 === 0)
  if (!BREAKS_OUT.test(value) && !unclosed) return undefined
  const text = `${JSON.stringify(value)} can't be a CSS value here: ; { } < > \\, line breaks and unclosed quotes aren't allowed`
  return { code: 'unsafeText', data: { value }, text }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
