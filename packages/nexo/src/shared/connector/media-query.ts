import { signal, type Readable, type Signal } from './signal'

export interface MediaQueryOptions {
  /** The answer where there's no `matchMedia` (the server, Bun). `false` by default. */
  fallback?: boolean
  /** Stops listening. Without it, it listens as long as it lives. */
  signal?: AbortSignal
}

/**
 * A media query as a `Readable<boolean>`: one plain signal holds `matches`,
 * written by the query's own `change` event (Svelte's `MediaQuery`).
 *
 *   const wide = new MediaQuery('(min-width: 60em)', { signal })
 *   effect(() => layout(wide.get() ? 'two' : 'one'))
 */
export class MediaQuery implements Readable<boolean> {
  private readonly state: Signal<boolean>

  constructor(
    readonly media: string,
    options: MediaQueryOptions = {},
  ) {
    const list = typeof matchMedia === 'function' ? matchMedia(media) : null
    this.state = signal(list?.matches ?? options.fallback ?? false)
    list?.addEventListener('change', (e) => this.state.set(e.matches), {
      signal: options.signal,
    })
  }

  /** As `MediaQueryList#matches`, tracked. */
  get matches(): boolean {
    return this.state.get()
  }

  get(): boolean {
    return this.state.get()
  }

  peek(): boolean {
    return this.state.peek()
  }

  toJSON(): boolean {
    return this.state.peek()
  }
}
