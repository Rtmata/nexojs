/**
 * What reduced motion does to an animation (C.1): `false` leaves it alone
 * (it is essential), `'jump'` makes all of it jump to the end, and the
 * default follows WCAG — only what moves jumps.
 */
export type Reduce = false | 'jump'

/**
 * The properties whose change is "motion" by WCAG 2.3.3: they change an
 * element's perceived size, shape or position. Color and opacity are not
 * motion; blur is (the errata dropped it from the exceptions), so filters
 * count only when they blur.
 */
const MOVING = new Set([
  'transform',
  'translate',
  'scale',
  'rotate',
  'perspective',
  'offset-path',
  'offset-distance',
  'offset-position',
  'offset-rotate',
  'top',
  'right',
  'bottom',
  'left',
  'inset',
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'inline-size',
  'block-size',
  'flex-basis',
  'margin',
  'padding',
  'border-radius',
  'clip-path',
  'object-position',
  'background-position',
  'background-size',
  'mask-position',
])
/**
 * The longhands of the shorthands above: `margin-top`, `padding-inline-start`,
 * `inset-block-end` (and `inset-block` itself), `border-top-left-radius`,
 * `border-start-end-radius`… A camelCase name reaches here as kebab-case.
 */
const SIDES = /^(margin|padding|inset)-|^border-[a-z]+-[a-z]+-radius$/
const BLURRING = new Set(['filter', 'backdrop-filter'])

/**
 * Whether animating `property` through `values` is motion (WCAG 2.3.3),
 * for an element under reduced motion. Takes CSS or WAAPI (camelCase)
 * names.
 *
 *   movesThings('translate', ['0 24px', '0 0']) // true
 *   movesThings('opacity', [0, 1])              // false
 */
export function movesThings(property: string, values: unknown[]): boolean {
  const name = cssName(property)
  if (MOVING.has(name) || SIDES.test(name)) return true
  return BLURRING.has(name) && values.some((v) => String(v).includes('blur('))
}

/** A WAAPI (camelCase) property name as CSS writes it; a custom property as it is. */
export function cssName(property: string): string {
  if (property.startsWith('--')) return property
  return property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}
