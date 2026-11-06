import { batch } from './batch'
import { signal, type Signal } from './signal'
import { untrack } from './source'

type ParamsInit = ConstructorParameters<typeof URLSearchParams>[0]

/**
 * A real `URLSearchParams` (`fetch` sends it as a form) whose reads are
 * tracked: one plain signal holds its text, every write sets it again.
 *
 *   const query = new SignalURLSearchParams('?page=1')
 *   effect(() => load(query.get('page')))
 *   query.set('page', '2')
 */
export class SignalURLSearchParams extends URLSearchParams {
  private readonly text: Signal<string>
  private written: (search: string) => void = () => {}

  constructor(init?: ParamsInit) {
    super(init)
    this.text = signal(super.toString())
  }

  override get size(): number {
    this.text.get()
    return super.size
  }

  override get(name: string): string | null {
    this.text.get()
    return super.get(name)
  }

  override getAll(name: string): string[] {
    this.text.get()
    return super.getAll(name)
  }

  override has(name: string, value?: string): boolean {
    this.text.get()
    return super.has(name, value)
  }

  override toString(): string {
    return this.text.get()
  }

  override forEach(
    fn: (value: string, key: string, parent: URLSearchParams) => void,
  ): void {
    this.text.get()
    super.forEach(fn)
  }

  override keys(): URLSearchParamsIterator<string> {
    this.text.get()
    return super.keys()
  }

  override values(): URLSearchParamsIterator<string> {
    this.text.get()
    return super.values()
  }

  override entries(): URLSearchParamsIterator<[string, string]> {
    this.text.get()
    return super.entries()
  }

  override [Symbol.iterator](): URLSearchParamsIterator<[string, string]> {
    return this.entries()
  }

  override append(name: string, value: string): void {
    super.append(name, value)
    this.wrote()
  }

  override delete(name: string, value?: string): void {
    super.delete(name, value)
    this.wrote()
  }

  override set(name: string, value: string): void {
    super.set(name, value)
    this.wrote()
  }

  override sort(): void {
    super.sort()
    this.wrote()
  }

  /** For `SignalURL`: tell it when these params change. */
  linkTo(written: (search: string) => void): void {
    this.written = written
  }

  /** For `SignalURL`: its search changed, so these become that search. */
  replaceWith(search: string): void {
    for (const name of [...super.keys()]) super.delete(name)
    for (const [name, value] of new URLSearchParams(search))
      super.append(name, value)
    this.text.set(super.toString())
  }

  private wrote(): void {
    const text = super.toString()
    batch(() => {
      this.text.set(text)
      this.written(text)
    })
  }
}

/** Every part of a URL: each read depends on its `href`, each write sets it. */
const PARTS = [
  'hash',
  'host',
  'hostname',
  'href',
  'origin',
  'password',
  'pathname',
  'port',
  'protocol',
  'search',
  'username',
] as const

/**
 * A real `URL` whose reads are tracked: one plain signal holds its `href`, and
 * its `searchParams` is a `SignalURLSearchParams` kept in step both ways.
 *
 *   const url = new SignalURL(location.href)
 *   effect(() => show(url.pathname))
 *   url.searchParams.set('page', '2')   // url.search follows
 */
export class SignalURL extends URL {
  private readonly current: Signal<string>
  private readonly params: SignalURLSearchParams

  constructor(url: string | URL, base?: string | URL) {
    super(url, base)
    this.current = signal(nativeGet(this, 'href'))
    this.params = new SignalURLSearchParams(nativeGet(this, 'search'))
    this.params.linkTo((search) => this.searchWritten(search))
  }

  override get searchParams(): SignalURLSearchParams {
    return this.params
  }

  override toString(): string {
    return this.current.get()
  }

  override toJSON(): string {
    return untrack(() => this.toString())
  }

  /** A part was written: `href` and the params follow. */
  partWritten(): void {
    batch(() => {
      this.current.set(nativeGet(this, 'href'))
      this.params.replaceWith(nativeGet(this, 'search'))
    })
  }

  private searchWritten(search: string): void {
    nativeSet(this, 'search', search)
    this.current.set(nativeGet(this, 'href'))
  }
}

const parts = Object.getOwnPropertyDescriptors(URL.prototype)

function nativeGet(url: URL, part: string): string {
  return parts[part]!.get!.call(url)
}

function nativeSet(url: URL, part: string, value: string): void {
  parts[part]!.set!.call(url, value)
}

for (const part of PARTS) {
  Object.defineProperty(SignalURL.prototype, part, {
    get(this: SignalURL) {
      this.toString()
      return nativeGet(this, part)
    },
    set: parts[part]!.set && writePart(part),
    configurable: true,
  })
}

function writePart(part: string) {
  return function (this: SignalURL, value: string) {
    nativeSet(this, part, value)
    this.partWritten()
  }
}
