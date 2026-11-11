import { readColor } from './read'
import { linear, type Rgb } from './spaces'

/**
 * WCAG 2.2's minimums: text by 1.4.3 (normal size), user-interface parts
 * and graphics by 1.4.11.
 */
export const REQUIRED_RATIO = { text: 4.5, ui: 3 } as const

export type ContrastUse = keyof typeof REQUIRED_RATIO

/** One pair, measured: what themes' `contrastChecks` report from. */
export interface PairCheck {
  readonly ratio: number
  readonly required: number
  /** WCAG compares the exact ratio: 4.49:1 doesn't round up to pass 4.5:1. */
  readonly passes: boolean
}

/**
 * WCAG 2.2's contrast ratio of two opaque colours, 1 to 21. The order
 * doesn't matter: the lighter is always on top of the fraction.
 *
 *   contrastRatio('#777', '#fff') // 4.478…
 */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [opaque(a), opaque(b)].map(relativeLuminance) as [
    number,
    number,
  ]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/**
 * Whether `foreground` on `background` reaches the minimum for its use.
 *
 *   checkPair('#fff', '#3b82f6', 'text') // { ratio: 3.68…, required: 4.5, passes: false }
 */
export function checkPair(
  foreground: string,
  background: string,
  use: ContrastUse,
): PairCheck {
  const ratio = contrastRatio(foreground, background)
  const required = REQUIRED_RATIO[use]
  return { ratio, required, passes: ratio >= required }
}

/**
 * WCAG 2.2's relative luminance. A channel beyond 0–1 (an `oklch()` outside
 * sRGB) is clipped first: the screen can show no more than sRGB here.
 */
function relativeLuminance({ red, green, blue }: Rgb): number {
  const [r, g, b] = [red, green, blue].map((c) =>
    linear(Math.min(1, Math.max(0, c))),
  )
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

/** A translucent colour's contrast depends on what shows through: WCAG needs it opaque. */
function opaque(text: string): Rgb {
  const color = readColor(text)
  if (color.alpha === 1) return color
  throw new TranslucentColor(text)
}

/** What `contrastRatio` throws for a colour that isn't opaque, naming it. */
export class TranslucentColor extends Error {
  constructor(readonly value: string) {
    super(
      `glyph: "${value}" is translucent; contrast needs opaque colours, since what shows through changes it`,
    )
  }
}
