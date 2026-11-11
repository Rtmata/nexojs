import { didYouMean } from './closest'
import { checkPair, REQUIRED_RATIO } from './color/contrast'
import { Resolver } from './resolver'
import type { ColorScheme, ContrastCheck, TokenSet } from './token-set'

/** One side of a pair, resolved in a scheme; `label` names the scheme when it matters. */
interface Measured {
  readonly label: string
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
 * The pairs that fall short, one line each, with the ratio and what the
 * use needs: `on-primary on primary: 3.9:1, needs 4.5:1`. A pair is
 * measured in each scheme where its colours differ.
 */
export function contrastShortfalls(set: TokenSet): string[] {
  return set.checks.flatMap((check) => new PairMeasure(set, check).lines())
}

/** One pair of one set, in each scheme it can show. */
class PairMeasure {
  constructor(
    private readonly set: TokenSet,
    private readonly check: ContrastCheck,
  ) {}

  /** A line per shortfall; a colour that can't be measured is a line too. */
  lines(): string[] {
    try {
      return this.measured().flatMap((m) => this.shortfall(m))
    } catch (error) {
      return [
        `${this.pair()}: ${(error as Error).message.replace(/^glyph: /, '')}`,
      ]
    }
  }

  /** Both schemes, or one when the theme fixes it or the colours are the same in both. */
  private measured(): Measured[] {
    const fixed = this.set.colorScheme
    if (fixed) return [this.in(fixed, '')]
    const [light, dark] = [
      this.in('light', ' (light)'),
      this.in('dark', ' (dark)'),
    ]
    const same =
      light.foreground === dark.foreground &&
      light.background === dark.background
    return same ? [{ ...light, label: '' }] : [light, dark]
  }

  private in(scheme: ColorScheme, label: string): Measured {
    const resolver = new Resolver(this.set, scheme)
    const [foreground, background] = [this.check[0], this.check[1]].map(
      (name) => resolver.value(propertyOf(name)),
    )
    return { label, foreground: foreground!, background: background! }
  }

  private shortfall({ label, foreground, background }: Measured): string[] {
    const measure = checkPair(foreground, background, this.check[2])
    if (measure.passes) return []
    const ratio = Math.floor(measure.ratio * 100) / 100 // never shown higher than it is
    return [`${this.pair()}${label}: ${ratio}:1, needs ${measure.required}:1`]
  }

  private pair(): string {
    return `${this.check[0]} on ${this.check[1]}`
  }
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
