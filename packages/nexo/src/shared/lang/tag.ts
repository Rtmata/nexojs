import { BoundedCache } from '../cache/bounded-cache'

/**
 * Internal, not a public module: the one way Nexo reads and compares
 * language tags, shared by boat (the request language), voices (messages
 * and versions) and quarry (the tag it's given).
 *
 * Tags are case-insensitive (BCP 47) and `_` is read as `-` (`es_MX`).
 * `Intl.Locale` does the parsing, so what a tag implies is known too:
 * `zh-TW` is written in Traditional Chinese (`Hant`), in Taiwan.
 */

/** The tag in one spelling: lowercase, with `-`. */
export function normalizeTag(tag: string): string {
  return tag.replaceAll('_', '-').toLowerCase()
}

/** The very same tag, however it's spelled: 'es_MX' is 'ES-mx'. */
export function sameTag(a: string, b: string): boolean {
  return (
    (canonicalTag(a) ?? normalizeTag(a)) ===
    (canonicalTag(b) ?? normalizeTag(b))
  )
}

/**
 * Two tags that mean the same once what they imply is spelled out:
 * 'zh-TW' and 'zh-Hant-TW', or 'es' and 'es-Latn-ES'.
 */
export function sameMeaning(a: string, b: string): boolean {
  const [x, y] = [Spoken.of(a), Spoken.of(b)]
  return x && y ? x.full === y.full : sameTag(a, b)
}

/** The tag as `Intl` writes it (`'ES_mx'` → `'es-MX'`), or `null` when it isn't one. */
export function canonicalTag(tag: string): string | null {
  return Spoken.of(tag)?.canonical ?? null
}

/** The language part of a tag: 'ES-mx' → 'es', 'nb-NO' → 'nb'. */
export function baseOf(tag: string): string {
  return Spoken.of(tag)?.language ?? normalizeTag(tag)
}

/** The candidate written as this very tag (any spelling), if any. */
export function findTag<T extends string>(
  candidates: readonly T[],
  tag: string,
): T | undefined {
  return candidates.find((candidate) => sameTag(candidate, tag))
}

/**
 * The candidate that best fits a tag: the same tag, else one of the same
 * language and script — the same region first, then the bare language.
 * Never across scripts, even implied ones: 'zh-TW' never gets 'zh-Hans'.
 * `undefined` when none fits.
 *
 *   matchTag(['en', 'es'], 'es-MX')            // 'es'
 *   matchTag(['zh-HK', 'zh-TW'], 'zh-Hant-TW') // 'zh-TW'
 */
export function matchTag<T extends string>(
  candidates: readonly T[],
  tag: string,
): T | undefined {
  const exact = findTag(candidates, tag)
  if (exact !== undefined) return exact
  const wanted = Spoken.of(tag)
  if (!wanted) return undefined
  const close = candidates.filter((c) => Spoken.of(c)?.sameScript(wanted))
  return bestOf(close, wanted)
}

/** Among close candidates: the same region, else the bare language, else the first. */
function bestOf<T extends string>(close: readonly T[], wanted: Spoken) {
  const region = close.find((c) => Spoken.of(c)!.region === wanted.region)
  return region ?? close.find((c) => Spoken.of(c)!.bare) ?? close[0]
}

/**
 * What a tag means for reading, parsed once per tag: its language, its
 * script and region (said or implied), and whether it's just a language.
 */
class Spoken {
  /** Bounded: tags come from visitors' headers, with no end to their variety. */
  private static readonly known = new BoundedCache<string, Spoken | null>(256)

  private constructor(
    readonly canonical: string,
    readonly language: string,
    readonly script: string | undefined,
    readonly region: string | undefined,
    readonly bare: boolean,
  ) {}

  static of(tag: string): Spoken | null {
    return Spoken.known.remember(normalizeTag(tag), () => Spoken.parse(tag))
  }

  private static parse(tag: string): Spoken | null {
    const locale = localeOf(tag)
    if (!locale) return null
    const { script, region } = locale.maximize()
    const bare = locale.baseName === locale.language
    return new Spoken(locale.toString(), locale.language, script, region, bare)
  }

  /** Language, script and region, all spelled out: 'zh-Hant-TW'. */
  get full(): string {
    return [this.language, this.script, this.region].join('-')
  }

  sameScript(other: Spoken): boolean {
    return this.language === other.language && this.script === other.script
  }
}

function localeOf(tag: string): Intl.Locale | null {
  try {
    return new Intl.Locale(normalizeTag(tag))
  } catch {
    return null // a private-use tag ('x-pirate') or not a tag at all
  }
}
