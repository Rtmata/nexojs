import { didYouMean } from './closest'
import { checkPair, REQUIRED_RATIO, TranslucentColor } from './color/contrast'
import { Resolver } from './resolver'
import type { ThemeError } from './theme-error'
import type { ColorScheme, ContrastCheck, TokenSet } from './token-set'

/** Both sides of a pair, resolved in a scheme; none when it is the same in both. */
interface Measured {
  readonly scheme: ColorScheme | undefined
  readonly foreground: string
  readonly background: string
}

/**
 * Whether each pair names colour tokens and a use glyph knows, one line
 * per mistake. Pairs are written by hand (C.5): no naming convention
 * guesses them, so a typo must not pass unchecked.
 */
export function checkProblems(
  set: TokenSet,
  checks: readonly ContrastCheck[],
): string[] {
  return checks.flatMap(([foreground, background, use]) => [
    ...[foreground, background].flatMap((name) => nameProblems(set, name)),
    ...(Object.hasOwn(REQUIRED_RATIO, use) ? [] : [unknownUse(use)]),
  ])
}

/**
 * Where a pair's name points: `text` is a token of `color`, `brand.ink` a
 * token of the colour group `brand`. A token name has no dot (CSS_NAME),
 * so the first one always splits group from token.
 */
function placeOf(name: string): { group: string; token: string } {
  const dot = name.indexOf('.')
  if (dot === -1) return { group: 'color', token: name }
  return { group: name.slice(0, dot), token: name.slice(dot + 1) }
}

/** The custom property a pair's name reads, without `--`: `brand.ink` → `brand-ink`. */
function propertyOf(name: string): string {
  const { group, token } = placeOf(name)
  return `${group}-${token}`
}

/** Nothing when `name` is a token of a colour group of these tokens, else why not. */
function nameProblems(set: TokenSet, name: string): string[] {
  const { group, token } = placeOf(name)
  const found = set.group(group)
  if (group !== 'color' && found?.type !== 'color')
    return [unknownGroup(group, colorGroups(set))]
  const tokens = found?.tokenNames() ?? []
  if (tokens.includes(token)) return []
  const prefix = group === 'color' ? '' : `${group}.`
  return [unknownColor(name, didYouMean(token, tokens, prefix))]
}

function colorGroups(set: TokenSet): string[] {
  return set.groups.filter((g) => g.type === 'color').map((g) => g.name)
}

/**
 * The pairs that fall short, one each, with the ratio and what the use
 * needs: `on-primary on primary: 3.9:1, needs 4.5:1`. A pair is measured in
 * each scheme where its colours differ. A colour that can't be measured for
 * another reason than being translucent (a reference that leads nowhere, a
 * `color-mix()`) comes from code, never from a person's JSON: it is a line
 * of text, for the error `defineTokens` and `defineTheme` throw.
 */
export function contrastShortfalls(set: TokenSet): (ThemeError | string)[] {
  return set.checks.flatMap((check) => new PairMeasure(set, check).errors())
}

/** A shortfall's line: its message, or the text it already is. */
export function lineOf(shortfall: ThemeError | string): string {
  return typeof shortfall === 'string' ? shortfall : shortfall.message
}

/** One pair of one set, in each scheme it can show. */
class PairMeasure {
  constructor(
    private readonly set: TokenSet,
    private readonly check: ContrastCheck,
  ) {}

  errors(): (ThemeError | string)[] {
    try {
      return this.measured().flatMap((m) => this.shortfall(m))
    } catch (error) {
      if (error instanceof TranslucentColor) return [this.translucent(error)]
      return [`${this.pair()}: ${unprefixed(error)}`]
    }
  }

  /** Both schemes, or one when the theme fixes it or the colours are the same in both. */
  private measured(): Measured[] {
    const fixed = this.set.fixedScheme()
    if (fixed) return [{ ...this.in(fixed), scheme: undefined }]
    const [light, dark] = [this.in('light'), this.in('dark')]
    const same =
      light.foreground === dark.foreground &&
      light.background === dark.background
    return same ? [{ ...light, scheme: undefined }] : [light, dark]
  }

  private in(scheme: ColorScheme): Measured {
    const resolver = new Resolver(this.set, scheme)
    const [foreground, background] = [this.check[0], this.check[1]].map(
      (name) => resolver.value(propertyOf(name)),
    )
    return { scheme, foreground: foreground!, background: background! }
  }

  private shortfall({
    scheme,
    foreground,
    background,
  }: Measured): ThemeError[] {
    const measure = checkPair(foreground, background, this.check[2])
    if (measure.passes) return []
    const ratio = Math.floor(measure.ratio * 100) / 100 // never shown higher than it is
    const { required } = measure
    const label = scheme ? ` (${scheme})` : ''
    const message = `${this.pair()}${label}: ${ratio}:1, needs ${required}:1`
    const data = {
      background: pathOf(this.check[1]),
      ratio,
      required,
      ...(scheme ? { scheme } : {}),
    }
    return [{ path: pathOf(this.check[0]), code: 'lowContrast', data, message }]
  }

  /** The translucent side is where to fix it. */
  private translucent(error: TranslucentColor): ThemeError {
    const { value } = error
    const message = `${this.pair()}: ${unprefixed(error)}`
    const side = this.sideShowing(value)
    return { path: pathOf(side), code: 'translucent', data: { value }, message }
  }

  /** Which of the pair's names resolves to `value`, in either scheme. */
  private sideShowing(value: string): string {
    const schemes: ColorScheme[] = ['light', 'dark']
    const shows = (name: string) =>
      schemes.some(
        (s) => new Resolver(this.set, s).value(propertyOf(name)) === value,
      )
    return shows(this.check[0]) ? this.check[0] : this.check[1]
  }

  private pair(): string {
    return `${this.check[0]} on ${this.check[1]}`
  }
}

/** A pair's name as a path: `text` → `color.text`; `brand.ink` stays. */
function pathOf(name: string): string {
  const { group, token } = placeOf(name)
  return `${group}.${token}`
}

function unprefixed(error: unknown): string {
  return (error as Error).message.replace(/^glyph: /, '')
}

function unknownColor(name: string, hint: string): string {
  return `contrastChecks: "${name}" is not a color token${hint}`
}

function unknownGroup(group: string, groups: readonly string[]): string {
  return `contrastChecks: "${group}" is not a color group of these tokens${didYouMean(group, groups)}`
}

function unknownUse(use: string): string {
  const uses = Object.keys(REQUIRED_RATIO).join(' or ')
  return `contrastChecks: "${use}" is not a use; write ${uses}`
}
