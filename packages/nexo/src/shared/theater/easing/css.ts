import { cubicBezier } from './cubic-bezier'
import { linear, type Easing } from './easing'
import { linearPoints, type LinearStop } from './linear-points'
import { isStepPosition, steps, STEP_POSITIONS } from './steps'

/** The CSS easing keywords, as the functions they stand for. */
const KEYWORDS: Record<string, () => Easing> = {
  linear: () => linear,
  ease: () => cubicBezier(0.25, 0.1, 0.25, 1),
  'ease-in': () => cubicBezier(0.42, 0, 1, 1),
  'ease-out': () => cubicBezier(0, 0, 0.58, 1),
  'ease-in-out': () => cubicBezier(0.42, 0, 0.58, 1),
  'step-start': () => steps(1, 'jump-start'),
  'step-end': () => steps(1, 'jump-end'),
}

/** The CSS easing functions, read from their arguments. */
const FUNCTIONS: Record<string, (args: string[]) => Easing> = {
  'cubic-bezier': (args) => cubicBezier(...fourNumbers(args)),
  steps: stepsOf,
  linear: (args) => linearPoints(args.flatMap(stopsOf)),
}

/** A CSS `<number>`. `Number()` alone reads `''` as 0 and a word as NaN. */
const NUMBER = /^[+-]?(\d+(\.\d+)?|\.\d+)(e[+-]?\d+)?$/

function isNumber(text: string): boolean {
  return NUMBER.test(text)
}

/**
 * Reads a CSS easing — a keyword, `cubic-bezier()`, `steps()` or
 * `linear()` — into an easing function, for animations theater runs
 * itself (values, A.2). Elements get the string as it is: the browser
 * reads it there, exactly.
 *
 *   fromCss('cubic-bezier(.2, .8, .2, 1)')(0.5) // ≈ 0.94
 */
export function fromCss(text: string): Easing {
  const css = text.trim().toLowerCase()
  const call = /^([a-z-]+)\((.*)\)$/s.exec(css)
  if (call) return callOf(call[1]!, call[2]!, text)
  // Own keys only: `constructor` is on every object's prototype.
  if (Object.hasOwn(KEYWORDS, css)) return KEYWORDS[css]!()
  throw unknown(text)
}

function callOf(name: string, inside: string, text: string): Easing {
  if (!Object.hasOwn(FUNCTIONS, name)) throw unknown(text)
  return FUNCTIONS[name]!(inside.split(',').map((arg) => arg.trim()))
}

function fourNumbers(args: string[]): [number, number, number, number] {
  if (args.length === 4 && args.every(isNumber)) {
    return args.map(Number) as [number, number, number, number]
  }
  throw new SyntaxError(
    `theater: cubic-bezier() takes four numbers, got "${args.join(', ')}"`,
  )
}

/** `steps(4)` or `steps(4, jump-none)`; a count that isn't whole is `steps`' own RangeError. */
function stepsOf(args: string[]): Easing {
  const [count = '', position = 'end'] = args
  if (args.length <= 2 && isNumber(count) && isStepPosition(position))
    return steps(Number(count), position)
  throw new SyntaxError(
    `theater: steps() takes a count and one of ${STEP_POSITIONS.join(', ')}, got "${args.join(', ')}"`,
  )
}

/** `0.5`, `0.5 20%` or `0.5 20% 40%` (two stops with one value). */
function stopsOf(arg: string): LinearStop[] {
  const [value = '', ...inputs] = arg.split(/\s+/)
  checkStop(arg, value, inputs)
  const stop = (at?: string): LinearStop => ({
    value: Number(value),
    at: percent(at),
  })
  return inputs.length === 0 ? [stop()] : inputs.map(stop)
}

function checkStop(arg: string, value: string, inputs: string[]): void {
  if (isNumber(value) && inputs.length <= 2) return
  throw new SyntaxError(
    `theater: a linear() stop is a number and up to two percentages, got "${arg}"`,
  )
}

function percent(text?: string): number | undefined {
  if (text === undefined) return undefined
  const number = text.slice(0, -1)
  if (text.endsWith('%') && isNumber(number)) return Number(number) / 100
  throw new SyntaxError(
    `theater: a linear() input is a percentage, got "${text}"`,
  )
}

function unknown(text: string): SyntaxError {
  return new SyntaxError(
    `theater: "${text}" is not a CSS easing (a keyword like ease-out, cubic-bezier(), steps() or linear())`,
  )
}
