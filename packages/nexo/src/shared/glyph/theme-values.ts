import { closest, didYouMean } from './closest'
import { readColor } from './color/read'
import { Grammar } from './grammar/grammar'
import type { Issue } from './grammar/issue'
import { at, type ThemeError, type ValueFault } from './theme-error'
import { cssValue, EXPECTED, isLightDark, type TokenGroup } from './token-group'
import type { TokenSet } from './token-set'
import type { TokenType } from './typed'

/** What is wrong with a written value, or `undefined` when nothing is. */
export type ValueCheck = (
  type: TokenType,
  value: unknown,
  set: TokenSet,
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
 * A value a person typed: its kind, then its type's grammar — a
 * colour glyph can read, so the contrast can be measured; a length, a
 * family list, a shadow… — each slot taking `var(--token)` of its type.
 * Text that could leave its declaration is refused before it is read.
 */
export function typedValue(
  type: TokenType,
  value: unknown,
  set: TokenSet,
): ValueFault | undefined {
  const kind = codeValue(type, value)
  if (kind) return kind
  const grammar = new Grammar(set)
  if (type === 'color') return colorFault(value, grammar)
  return typeof value === 'string'
    ? textFault(type, value, grammar)
    : numberFault(type, value, grammar)
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
    return tokenProblems(set, group, tokens, check)
  })
}

function tokenProblems(
  set: TokenSet,
  group: TokenGroup,
  tokens: Readonly<Record<string, unknown>>,
  check: ValueCheck,
): ThemeError[] {
  return Object.entries(tokens).flatMap(([token, value]) => {
    const where = `${group.name}.${token}`
    if (!group.has(token)) return [unknownToken(group, token)]
    const fault = check(group.type, value, set)
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

function colorFault(value: unknown, grammar: Grammar): ValueFault | undefined {
  const sides = isLightDark(value) ? [value.light, value.dark] : [value]
  return sides.map((side) => sideFault(side, grammar)).find(Boolean)
}

function sideFault(side: unknown, grammar: Grammar): ValueFault | undefined {
  if (typeof side !== 'string') {
    const text = `${JSON.stringify(side)} is not a colour`
    return { code: 'notAColor', data: { value: side }, text }
  }
  const issue = grammar.issue('color', side)
  return issue && faultOf(issue, 'color', side)
}

function textFault(
  type: TokenType,
  value: string,
  grammar: Grammar,
): ValueFault | undefined {
  // an open quote is each grammar's to refuse: a family may hold an apostrophe
  if (BREAKS_OUT.test(value)) {
    const text = `${JSON.stringify(value)} can't be a CSS value here: ; { } < > \\ and line breaks aren't allowed`
    return { code: 'unsafeText', data: { value }, text }
  }
  const issue = grammar.issue(type, value)
  return issue && faultOf(issue, type, value)
}

/** A number passed its kind; only a weight has a range: 1 to 1000. */
function numberFault(
  type: TokenType,
  value: unknown,
  grammar: Grammar,
): ValueFault | undefined {
  if (type !== 'fontWeight') return undefined
  const issue = grammar.issue(type, String(value))
  return issue && faultOf(issue, type, value)
}

/** The issue as a fault with its English text. */
function faultOf(issue: Issue, type: TokenType, value: unknown): ValueFault {
  const shown = JSON.stringify(value)
  if (issue.kind === 'missing') return missing(issue, value as string)
  if (issue.kind === 'mistyped') {
    const text = `${shown} is a ${issue.type} token, not ${EXPECTED[type]}`
    return { code: 'wrongKind', data: { value, expected: type }, text }
  }
  if (type === 'color') return unreadable(value as string)
  const text = `${shown} is not ${EXPECTED[type]}`
  return { code: 'wrongKind', data: { value, expected: type }, text }
}

function missing(
  { name, suggestion }: { name: string; suggestion?: string },
  value: string,
): ValueFault {
  const near = suggestion === undefined ? '' : `; did you mean --${suggestion}?`
  const text = `${JSON.stringify(value)} points to --${name}, which these tokens don't define${near}`
  return { code: 'missingReference', data: { value, name, suggestion }, text }
}

/** Why glyph can't read the colour, in readColor's own words. */
function unreadable(value: string): ValueFault {
  let text = `${JSON.stringify(value)} is not a colour`
  try {
    readColor(value)
  } catch (error) {
    text = (error as Error).message.replace(/^glyph: /, '')
  }
  return { code: 'notAColor', data: { value }, text }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
