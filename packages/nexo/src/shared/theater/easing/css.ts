import { cubicBezier } from './cubic-bezier'
import { linear, type Easing } from './easing'
import { linearPoints, type LinearStop } from './linear-points'
import { steps, type StepPosition } from './steps'

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
  steps: (args) => steps(Number(args[0]), (args[1] ?? 'end') as StepPosition),
  linear: (args) => linearPoints(args.flatMap(stopsOf)),
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
  const keyword = KEYWORDS[css]
  if (keyword) return keyword()
  throw unknown(text)
}

function callOf(name: string, inside: string, text: string): Easing {
  const read = FUNCTIONS[name]
  if (!read) throw unknown(text)
  return read(inside.split(',').map((arg) => arg.trim()))
}

function fourNumbers(args: string[]): [number, number, number, number] {
  const numbers = args.map(Number)
  if (numbers.length === 4 && numbers.every(Number.isFinite)) {
    return numbers as [number, number, number, number]
  }
  throw new SyntaxError(
    `theater: cubic-bezier() takes four numbers, got "${args.join(', ')}"`,
  )
}

/** `0.5`, `0.5 20%` or `0.5 20% 40%` (two stops with one value). */
function stopsOf(arg: string): LinearStop[] {
  const [value, ...inputs] = arg.split(/\s+/)
  const stop = (at?: string): LinearStop => ({
    value: Number(value),
    at: percent(at),
  })
  return inputs.length === 0 ? [stop()] : inputs.map(stop)
}

function percent(text?: string): number | undefined {
  if (text === undefined) return undefined
  if (text.endsWith('%')) return Number(text.slice(0, -1)) / 100
  throw new SyntaxError(
    `theater: a linear() input is a percentage, got "${text}"`,
  )
}

function unknown(text: string): SyntaxError {
  return new SyntaxError(
    `theater: "${text}" is not a CSS easing (a keyword like ease-out, cubic-bezier(), steps() or linear())`,
  )
}
