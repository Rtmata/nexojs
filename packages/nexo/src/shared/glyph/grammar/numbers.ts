/** CSS's number: `1`, `-0.5`, `.5`, `1e3`. */
const NUMBER = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?`

/** A number, then a unit or `%`, or nothing. */
const DIMENSION = new RegExp(`^(${NUMBER})(%|[A-Za-z]+)?$`)

/** CSS Values 4's lengths, the viewport and container ones included. */
const LENGTH_UNITS = new Set([
  ...['px', 'cm', 'mm', 'q', 'in', 'pt', 'pc'],
  ...['em', 'rem', 'ex', 'rex', 'cap', 'rcap', 'ch', 'rch', 'ic', 'ric'],
  ...['lh', 'rlh'],
  ...['vw', 'vh', 'vi', 'vb', 'vmin', 'vmax'].flatMap((u) => [
    u,
    `s${u}`,
    `l${u}`,
    `d${u}`,
  ]),
  ...['cqw', 'cqh', 'cqi', 'cqb', 'cqmin', 'cqmax'],
])

export interface Dimension {
  readonly value: number
  /** Lower-cased, as CSS reads units: `''` for a bare number, `%`, `rem`. */
  readonly unit: string
}

/** `text` as a number and its unit, or `undefined` when it is neither. */
export function dimensionOf(text: string): Dimension | undefined {
  const match = DIMENSION.exec(text)
  if (!match) return undefined
  return { value: Number(match[1]), unit: (match[2] ?? '').toLowerCase() }
}

/** A plain number, no unit: `400`, `0.5`. */
export function numberOf(text: string): number | undefined {
  const found = dimensionOf(text)
  return found?.unit === '' ? found.value : undefined
}

/** A length, a percentage, or `0`, the one number CSS reads as a length. */
export function isLength({ value, unit }: Dimension): boolean {
  return LENGTH_UNITS.has(unit) || unit === '%' || (unit === '' && value === 0)
}

/** Four decimals: what glyph writes where a ratio or a channel comes out of maths. */
export function round(n: number): number {
  return Math.round(n * 10000) / 10000
}
