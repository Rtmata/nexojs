import type { TokenType } from '../typed'

/** A JSON object, as DTCG files are made of. */
export type Json = { [key: string]: unknown }

/** glyph's types and DTCG's `$type`s: the same words but one (B.3, step 1 item 4). */
export const DTCG_TYPE: Record<TokenType, string> = {
  color: 'color',
  dimension: 'dimension',
  fontFamily: 'fontFamily',
  fontWeight: 'fontWeight',
  shadow: 'shadow',
  duration: 'duration',
  easing: 'cubicBezier',
  number: 'number',
}

/** DTCG 2025.10 §8.4's weight words, by their number. */
export const WEIGHT_WORDS: Record<string, number> = {
  thin: 100,
  hairline: 100,
  'extra-light': 200,
  'ultra-light': 200,
  light: 300,
  normal: 400,
  regular: 400,
  book: 400,
  medium: 500,
  'semi-bold': 600,
  'demi-bold': 600,
  bold: 700,
  'extra-bold': 800,
  'ultra-bold': 800,
  black: 900,
  heavy: 900,
  'extra-black': 950,
  'ultra-black': 950,
}

/** CSS's easing keywords as the curves they are (CSS Easing 1 §2.2). */
export const EASING_CURVES: Record<string, readonly number[]> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
}

/** Collects every mistake, then throws them as one message (CONTRIBUTING: code throws). */
export class Mistakes {
  private readonly lines = new Set<string>() // a value met twice (light, then dark) is one mistake

  constructor(private readonly where: string) {}

  add(line: string): undefined {
    this.lines.add(line)
    return undefined
  }

  throwIfAny(): void {
    if (this.lines.size > 0)
      throw new Error(`glyph: ${this.where}: ${[...this.lines].join('; ')}`)
  }
}
