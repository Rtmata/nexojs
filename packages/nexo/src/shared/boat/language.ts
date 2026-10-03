import { findTag, matchTag } from '../lang/tag'
import { quoted } from './quoted'
import { decodedSegments } from '../url/decode'

/**
 * Where a request's language comes from. One option, several forms:
 *
 *   'prefix'            /es/consola/nes  → 'es'
 *   'subdomain'         es.example.com   → 'es'
 *   'header'            Accept-Language: es-MX,es;q=0.9 → 'es'
 *   { cookie: 'lang' }  Cookie: lang=es  → 'es'
 *   { query: 'lang' }   ?lang=es         → 'es'
 *   [ ... ]             try each in order; the first that answers wins
 *   (request) => …      your own rule
 *
 * Only languages declared in `boat({ languages })` count; anything else is
 * "no language".
 */
export type LangFrom =
  | 'prefix'
  | 'subdomain'
  | 'header'
  | { cookie: string }
  | { query: string }
  | ((request: Request) => string | undefined)
  | readonly LangFrom[]

/**
 * One way of reading the language (pattern: strategy). It answers with a
 * declared language or nothing, by its own rule: a part of the URL must be
 * the very tag (`/es-tienda` is not Spanish), while what the visitor asks
 * for (a header, a cookie) may be close (`es-MX` gets `es`). `place` exists
 * for readers whose language lives in the URL, so a link can point at
 * another language; `readsPath` says whether it's part of the path.
 */
interface LanguageReader {
  readonly readsPath: boolean
  read(
    request: Request,
    url: URL,
    languages: readonly string[],
  ): string | undefined
  place?(
    url: URL,
    lang: string,
    path: string,
    languages: readonly string[],
  ): string | undefined
}

/**
 * The site's languages and how a request says which one it wants. The
 * first language is the default.
 */
export class Languages<L extends string> {
  private readonly reader: LanguageReader | undefined

  constructor(
    readonly list: readonly L[],
    from?: LangFrom,
  ) {
    if (from !== undefined && list.length === 0) {
      throw new Error(
        'boat: langFrom needs the languages to look for. Use boat({ languages: [...], langFrom })',
      )
    }
    this.reader = from === undefined ? undefined : readerFor(from)
  }

  get default(): L | undefined {
    return this.list[0]
  }

  /** The declared language a request asks for, if any, by the `langFrom` rule. */
  of(request: Request): L | undefined {
    const url = new URL(request.url) // parsed once for every rule
    return this.reader?.read(request, url, this.list) as L | undefined
  }

  /**
   * A declared language, as declared: `'es-mx'` finds `'es-MX'`. Throws
   * for any other, so a link never silently points at the wrong one.
   */
  known(lang: string): L {
    const found = findTag(this.list, lang)
    if (found !== undefined) return found
    const list = this.list.length > 0 ? quoted(this.list) : 'none declared'
    throw new Error(
      `boat: "${lang}" is not one of the languages (${list}). Link in a declared one, or add it to boat({ languages })`,
    )
  }

  /** Whether two languages may share one path: only if the language isn't read from it. */
  get canSharePaths(): boolean {
    return this.reader !== undefined && !this.reader.readsPath
  }

  /** A URL for `path` in `lang`, for languages that share a path (subdomain, query). */
  place(url: URL, lang: string, path: string): string | undefined {
    return this.reader?.place?.(url, lang, path, this.list)
  }
}

/** The readers named by a word. */
const NAMED: Record<string, () => LanguageReader> = {
  prefix: () => new PrefixReader(),
  subdomain: () => new SubdomainReader(),
  header: () => new HeaderReader(),
}

function readerFor(from: LangFrom): LanguageReader {
  if (Array.isArray(from)) return new ChainReader(from.map(readerFor))
  if (typeof from === 'function') return new CustomReader(from)
  if (typeof from === 'string' && Object.hasOwn(NAMED, from))
    return NAMED[from]!()
  if (typeof from === 'object' && from !== null && 'cookie' in from)
    return new CookieReader(from.cookie)
  if (typeof from === 'object' && from !== null && 'query' in from)
    return new QueryReader(from.query)
  throw unknownLangFrom(from)
}

function unknownLangFrom(from: unknown): Error {
  return new Error(
    `boat: unknown langFrom ${JSON.stringify(from)}. Use 'prefix', 'subdomain', 'header', { cookie }, { query }, a function, or a list of them`,
  )
}

/** `/es/consola/nes` → 'es'. */
class PrefixReader implements LanguageReader {
  readonly readsPath = true
  read(request: Request, url: URL, languages: readonly string[]) {
    // Decoded, as routes read the path: '/%65s/…' is '/es/…'.
    return findTag(languages, decodedSegments(url.pathname)?.[0] ?? '')
  }
}

/** `es.example.com` → 'es'. Links to other languages swap that first label. */
class SubdomainReader implements LanguageReader {
  readonly readsPath = false
  read(request: Request, url: URL, languages: readonly string[]) {
    return findTag(languages, url.hostname.split('.')[0]!)
  }

  place(url: URL, lang: string, path: string, languages: readonly string[]) {
    const target = new URL(path, url)
    const labels = target.hostname.split('.')
    if (findTag(languages, labels[0]!)) labels[0] = lang
    // A bare domain (example.com) gets one; www., localhost or an IP can't
    // say which language host to use, so there's no link.
    else if (labels.length === 2 && !/^\d+$/.test(labels[1]!))
      labels.unshift(lang)
    else return undefined
    target.hostname = labels.join('.')
    return target.href
  }
}

/** `Accept-Language: fr,es-MX;q=0.9` → ['fr', 'es-MX'], the browser's choices in order. */
class HeaderReader implements LanguageReader {
  readonly readsPath = false
  read(request: Request, url: URL, languages: readonly string[]) {
    const accepted = acceptedLanguages(request.headers.get('accept-language'))
    return closest(languages, accepted)
  }
}

/** `Cookie: lang=es` → 'es' (quoted values too). */
class CookieReader implements LanguageReader {
  readonly readsPath = false
  constructor(private readonly name: string) {}

  read(request: Request, url: URL, languages: readonly string[]) {
    return closest(languages, present(this.valueIn(request)))
  }

  private valueIn(request: Request): string | undefined {
    for (const pair of request.headers.get('cookie')?.split(';') ?? []) {
      const [key, ...value] = pair.trim().split('=')
      if (key === this.name) return cookieValue(value.join('='))
    }
    return undefined
  }
}

/** `?lang=es` → 'es'. Links to other languages set the same parameter. */
class QueryReader implements LanguageReader {
  readonly readsPath = false
  constructor(private readonly name: string) {}

  read(request: Request, url: URL, languages: readonly string[]) {
    const value = url.searchParams.get(this.name)
    return closest(languages, present(value))
  }

  place(url: URL, lang: string, path: string) {
    const target = new URL(path, url)
    target.searchParams.set(this.name, lang)
    return target.pathname + target.search
  }
}

/** The site's own rule. */
class CustomReader implements LanguageReader {
  readonly readsPath = false
  constructor(
    private readonly rule: (request: Request) => string | undefined,
  ) {}

  read(request: Request, url: URL, languages: readonly string[]) {
    return closest(languages, present(this.rule(request)))
  }
}

/** Several rules in order: the first that finds a declared language answers. */
class ChainReader implements LanguageReader {
  constructor(private readonly readers: readonly LanguageReader[]) {}

  /** It reads the path only when every rule does. */
  get readsPath(): boolean {
    return this.readers.every((r) => r.readsPath)
  }

  read(request: Request, url: URL, languages: readonly string[]) {
    for (const reader of this.readers) {
      const found = reader.read(request, url, languages)
      if (found !== undefined) return found
    }
    return undefined
  }

  /** The first rule that can place the link does; the others are asked in turn. */
  place(url: URL, lang: string, path: string, languages: readonly string[]) {
    for (const reader of this.readers) {
      const placed = reader.place?.(url, lang, path, languages)
      if (placed) return placed
    }
    return undefined
  }
}

/** `es-MX,es;q=0.9,en;q=0.5` → ['es-MX', 'es', 'en'], best first. */
function acceptedLanguages(header: string | null): string[] {
  return (header ?? '')
    .split(',')
    .map(qualityOf)
    .filter(({ tag, q }) => tag && tag !== '*' && q > 0)
    .sort((a, b) => b.q - a.q)
    .map(({ tag }) => tag)
}

function qualityOf(part: string): { tag: string; q: number } {
  const [tag, ...options] = part.trim().split(';')
  const q = options.find((o) => o.trim().startsWith('q='))
  return { tag: tag!.trim(), q: q ? Number(q.trim().slice(2)) : 1 }
}

/** A cookie's value: unquoted, and percent-decoded when it was encoded. */
function cookieValue(raw: string): string {
  const value = raw.replace(/^"(.*)"$/, '$1')
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** The first candidate close to a declared language, as declared. */
function closest(
  languages: readonly string[],
  candidates: readonly string[],
): string | undefined {
  return candidates.map((tag) => matchTag(languages, tag)).find(Boolean)
}

/** A value as a list of candidates: none when it's missing. */
function present(value: string | null | undefined): string[] {
  return value === undefined || value === null || value === '' ? [] : [value]
}
