/**
 * What the client router needs from a signals library, as a value:
 * connector meets it as is. boat imports none. omino declares its own,
 * overlapping on purpose: each module asks only for what it uses, so the
 * two never change together and another library has less to meet.
 */
export interface Reactivity {
  signal<T>(value: T): ReactiveValue<T>
  effect(
    body: (run: { signal: AbortSignal }) => unknown,
    options?: { signal?: AbortSignal },
  ): () => void
  untrack<T>(fn: () => T): T
  batch<T>(fn: () => T): T
  resource<T>(
    source: ReadableLike<unknown>,
    loader: (now: unknown, run: { signal: AbortSignal }) => PromiseLike<T> | T,
    options?: { signal?: AbortSignal },
  ): ResourceLike<T>
}

export interface ReadableLike<T> {
  get(): T
}

export interface ReactiveValue<T> extends ReadableLike<T> {
  set(value: T): void
  peek(): T
  asReadonly(): ReadableLike<T>
}

/** connector's `resource`, as the router uses it. */
export interface ResourceLike<T> {
  readonly value: ReadableLike<T | undefined>
  readonly status: ReadableLike<string>
  readonly error: ReadableLike<unknown>
  readonly isLoading: ReadableLike<boolean>
  reload(): void
}
