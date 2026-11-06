import { describe, expect, test } from 'bun:test'
import { flush, resource, signal } from './index'

/** A promise you settle by hand, to see each status. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => ((resolve = yes), (reject = no)))
  return { promise, resolve, reject }
}

const tick = () => Bun.sleep(0)

describe('resource', () => {
  test('loads, then is ready', async () => {
    const id = signal(1)
    const book = resource(id, async (id) => `book ${id}`)
    flush()
    expect(book.status.get()).toBe('loading')
    expect(book.isLoading.get()).toBe(true)
    await tick()
    expect(book.value.get()).toBe('book 1')
    expect(book.status.get()).toBe('ready')
    expect(book.hasValue.get()).toBe(true)
    book.dispose()
  })

  test('new sources drop the old value: it would be false data', async () => {
    const id = signal(1)
    const book = resource(id, async (id) => `book ${id}`)
    flush()
    await tick()
    id.set(2)
    flush()
    expect(book.status.get()).toBe('loading')
    expect(book.value.get()).toBeUndefined()
    await tick()
    expect(book.value.get()).toBe('book 2')
    book.dispose()
  })

  test('reload keeps the value while it loads again', async () => {
    let n = 0
    const book = resource(signal(1), async () => ++n)
    flush()
    await tick()
    book.reload()
    flush()
    expect(book.status.get()).toBe('reloading')
    expect(book.value.get()).toBe(1)
    await tick()
    expect(book.value.get()).toBe(2)
    book.dispose()
  })

  test('an undefined source is idle: the loader does not run', () => {
    const id = signal<number | undefined>(undefined)
    let calls = 0
    const book = resource(id, async () => ++calls)
    flush()
    expect(book.status.get()).toBe('idle')
    expect(calls).toBe(0)
    book.dispose()
  })

  test('the latest load wins, and the stale one is aborted', async () => {
    const id = signal(1)
    const loads = [deferred<string>(), deferred<string>()]
    const signals: AbortSignal[] = []
    const book = resource(id, (id, { signal }) => {
      signals.push(signal)
      return loads[id - 1]!.promise
    })
    flush()
    id.set(2)
    flush()
    expect(signals[0]!.aborted).toBe(true)
    loads[1]!.resolve('two')
    loads[0]!.resolve('one')
    await tick()
    expect(book.value.get()).toBe('two')
    book.dispose()
  })

  test('a failure is in error and goes to onError; value never throws', async () => {
    const errors: unknown[] = []
    const boom = new Error('boom')
    const book = resource(
      signal(1),
      async () => {
        throw boom
      },
      { onError: (e) => errors.push(e) },
    )
    flush()
    await tick()
    expect(book.status.get()).toBe('error')
    expect(book.error.get()).toBe(boom)
    expect(book.value.get()).toBeUndefined()
    expect(errors).toEqual([boom])
    book.dispose()
  })

  test('a failed reload keeps the last good value', async () => {
    let fail = false
    const book = resource(
      signal(1),
      async () => {
        if (fail) throw new Error('down')
        return 'ok'
      },
      { onError: () => {} },
    )
    flush()
    await tick()
    fail = true
    book.reload()
    flush()
    await tick()
    expect(book.status.get()).toBe('error')
    expect(book.value.get()).toBe('ok')
    book.dispose()
  })

  test('set is a local value and drops the load in flight', async () => {
    const load = deferred<string>()
    const book = resource(signal(1), () => load.promise)
    flush()
    book.set('mine')
    expect(book.status.get()).toBe('local')
    load.resolve('server')
    await tick()
    expect(book.value.get()).toBe('mine')
    book.update((v) => `${v}!`)
    expect(book.value.get()).toBe('mine!')
    book.dispose()
  })

  test('its own cancellation is silent', async () => {
    const id = signal(1)
    const errors: unknown[] = []
    const book = resource(
      id,
      (_, { signal }) =>
        new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason)),
        ),
      { onError: (e) => errors.push(e) },
    )
    flush()
    id.set(2)
    flush()
    book.dispose()
    await tick()
    expect(errors).toHaveLength(0)
  })

  test('several sources, typed by position', async () => {
    const a = signal(1)
    const b = signal('x')
    const both = resource([a, b], async ([n, s]) => `${s}${n * 2}`)
    flush()
    await tick()
    expect(both.value.get()).toBe('x2')
    both.dispose()
  })

  test('aborting its signal ends it', async () => {
    const controller = new AbortController()
    const id = signal(1)
    let calls = 0
    resource(id, async () => ++calls, { signal: controller.signal })
    flush()
    controller.abort()
    id.set(2)
    flush()
    expect(calls).toBe(1)
  })

  test('JSON sees the value', async () => {
    const book = resource(signal(1), async () => ({ title: 'Dune' }))
    flush()
    await tick()
    expect(JSON.stringify({ book })).toBe('{"book":{"title":"Dune"}}')
    book.dispose()
  })
})
