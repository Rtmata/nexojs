import { describe, expect, mock, spyOn, test } from 'bun:test'
import {
  batch,
  computed,
  effect,
  flush,
  idle,
  later,
  manual,
  microtask,
  signal,
  sources,
  sync,
  throttle,
  untrack,
  watch,
} from './index'

const quiet = () => spyOn(console, 'error').mockImplementation(() => {})

describe('signal', () => {
  test('reads what was written', () => {
    const s = signal(1)
    s.set(2)
    expect(s.get()).toBe(2)
  })

  test('update works from the previous value', () => {
    const s = signal(1)
    s.update((n) => n + 1)
    expect(s.get()).toBe(2)
  })

  test('does not notify when the value is the same', () => {
    const s = signal(1)
    const seen = mock(() => s.get())
    effect(seen, { scheduler: sync })
    s.set(1)
    expect(seen).toHaveBeenCalledTimes(1)
  })

  test('equals decides what counts as the same', () => {
    const s = signal({ id: 1 }, { equals: (a, b) => a.id === b.id })
    const seen = mock(() => s.get())
    effect(seen, { scheduler: sync })
    s.set({ id: 1 })
    expect(seen).toHaveBeenCalledTimes(1)
    s.set({ id: 2 })
    expect(seen).toHaveBeenCalledTimes(2)
  })

  test('asReadonly is the same node, made once, without set', () => {
    const s = signal(1)
    const view = s.asReadonly()
    expect(s.asReadonly()).toBe(view)
    expect('set' in view).toBe(false)
    s.set(2)
    expect(view.get()).toBe(2)
    const seen = mock(() => view.get())
    effect(seen, { scheduler: sync })
    s.set(3)
    expect(seen).toHaveBeenCalledTimes(2)
  })

  test('JSON sees through it, without tracking', () => {
    const s = signal({ a: 1 })
    const seen = mock(() => JSON.stringify({ s }))
    effect(seen, { scheduler: sync })
    expect(JSON.stringify({ s })).toBe('{"s":{"a":1}}')
    s.set({ a: 2 })
    expect(seen).toHaveBeenCalledTimes(1)
  })
})

describe('computed', () => {
  test('works out its value only when read', () => {
    const s = signal(1)
    const fn = mock(() => s.get() * 2)
    const c = computed(fn)
    expect(fn).not.toHaveBeenCalled()
    expect(c.get()).toBe(2)
    expect(c.get()).toBe(2)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test('is fresh after a write, observed or not', () => {
    const s = signal(1)
    const c = computed(() => s.get() * 2)
    expect(c.get()).toBe(2)
    s.set(2)
    expect(c.get()).toBe(4)
  })

  test('a diamond runs once and never sees a mix', () => {
    const s = signal(1)
    const left = computed(() => s.get() + 1)
    const right = computed(() => s.get() * 10)
    const fn = mock(() => `${left.get()} ${right.get()}`)
    const both = computed(fn)
    const seen: string[] = []
    effect(() => seen.push(both.get()), { scheduler: sync })
    s.set(2)
    expect(seen).toEqual(['2 10', '3 20'])
    expect(fn).toHaveBeenCalledTimes(2)
  })

  test('the same result stops the change from spreading', () => {
    const s = signal(1)
    const even = computed(() => s.get() % 2 === 0)
    const fn = mock(() => even.get())
    const after = computed(fn)
    const seen = mock(() => after.get())
    effect(seen, { scheduler: sync })
    s.set(3)
    expect(seen).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledTimes(1)
    s.set(4)
    expect(seen).toHaveBeenCalledTimes(2)
  })

  test('a branch no longer taken is not worked out or listened to', () => {
    const useB = signal(true)
    const b = signal(1)
    const fromB = mock(() => b.get())
    const middle = computed(fromB)
    const c = computed(() => (useB.get() ? middle.get() : 0))
    const stop = effect(() => c.get(), { scheduler: sync })
    useB.set(false)
    b.set(2)
    expect(fromB).toHaveBeenCalledTimes(1)
    expect(b.observers.size).toBe(0)
    stop()
  })

  test('sources do not hold a computed nobody observes', () => {
    const s = signal(1)
    const c = computed(() => s.get())
    c.get()
    expect(s.observers.size).toBe(0)
    const stop = effect(() => c.get(), { scheduler: sync })
    expect(s.observers.size).toBe(1)
    stop()
    expect(s.observers.size).toBe(0)
    s.set(2)
    expect(c.get()).toBe(2)
  })

  test('with equals', () => {
    const s = signal(1)
    const c = computed(() => ({ odd: s.get() % 2 }), {
      equals: (a, b) => a.odd === b.odd,
    })
    const seen = mock(() => c.get())
    effect(seen, { scheduler: sync })
    s.set(3)
    expect(seen).toHaveBeenCalledTimes(1)
  })
})

describe('computed that throws', () => {
  const failing = () => {
    const s = signal(0)
    const fn = mock(() => {
      if (s.get() === 0) throw new Error('boom')
      return s.get()
    })
    return { s, fn, c: computed(fn) }
  }
  const caught = (read: () => unknown) => {
    try {
      read()
    } catch (error) {
      return error
    }
  }

  test('keeps the error and gives the same one to every read', () => {
    const { c, fn } = failing()
    const first = caught(() => c.get())
    expect(first).toBeInstanceOf(Error)
    expect(caught(() => c.get())).toBe(first)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test('recovers when a source changes', () => {
    const { s, c } = failing()
    caught(() => c.get())
    s.set(1)
    expect(c.get()).toBe(1)
  })

  test('travels through a chain as the same error', () => {
    const { c } = failing()
    const next = computed(() => c.get())
    expect(caught(() => next.get())).toBe(caught(() => c.get()))
  })

  test('peek and JSON throw it too', () => {
    const { c } = failing()
    expect(() => c.peek()).toThrow('boom')
    expect(() => JSON.stringify(c)).toThrow('boom')
  })

  test('error to value always notifies', () => {
    const { s, c } = failing()
    const seen: unknown[] = []
    effect(() => seen.push(c.get()), {
      scheduler: sync,
      onError: (e) => seen.push((e as Error).message),
    })
    s.set(1)
    expect(seen).toEqual(['boom', 1])
  })
})

describe('cycles and writes', () => {
  test('a computed that reads itself throws, with its name', () => {
    const a = computed((): number => b.get(), { name: 'a' })
    const b = computed((): number => a.get())
    expect(() => a.get()).toThrow('"a" reads itself')
  })

  test('a cycle that only exists on one branch is not a cycle', () => {
    const flag = signal(false)
    const a = computed((): number => (flag.get() ? b.get() : 1))
    const b = computed((): number => (flag.get() ? 2 : a.get()))
    expect(b.get()).toBe(1)
    flag.set(true)
    expect(a.get()).toBe(2)
  })

  test('writing inside a computed throws, unless on purpose', () => {
    const s = signal(0)
    const c = computed(() => s.set(1))
    expect(() => c.get()).toThrow('written while a computed ran')
    const allowed = computed(() => untrack(() => s.set(2)))
    allowed.get()
    expect(s.get()).toBe(2)
  })
})

describe('effect', () => {
  test('every run goes through the scheduler, the first too', async () => {
    const s = signal(1)
    const seen: number[] = []
    const stop = effect(() => seen.push(s.get()))
    expect(seen).toEqual([])
    await Promise.resolve()
    expect(seen).toEqual([1])
    s.set(2)
    s.set(3)
    expect(seen).toEqual([1])
    await Promise.resolve()
    expect(seen).toEqual([1, 3])
    stop()
  })

  test('tracks what the last run read', () => {
    const useA = signal(true)
    const a = signal(1)
    const b = signal(2)
    const seen = mock(() => (useA.get() ? a.get() : b.get()))
    effect(seen, { scheduler: sync })
    useA.set(false)
    expect(seen).toHaveBeenCalledTimes(2)
    a.set(9)
    expect(seen).toHaveBeenCalledTimes(2)
    b.set(9)
    expect(seen).toHaveBeenCalledTimes(3)
  })

  test('dispose ends it', () => {
    const s = signal(1)
    const seen = mock(() => s.get())
    const stop = effect(seen, { scheduler: sync })
    stop()
    s.set(2)
    expect(seen).toHaveBeenCalledTimes(1)
    expect(s.observers.size).toBe(0)
  })

  test('a shared signal ends it', () => {
    const screen = new AbortController()
    const s = signal(1)
    const seen = mock(() => s.get())
    effect(seen, { scheduler: sync, signal: screen.signal })
    screen.abort()
    s.set(2)
    expect(seen).toHaveBeenCalledTimes(1)
  })

  test('an aborted signal means it never runs', () => {
    const seen = mock(() => {})
    effect(seen, { scheduler: sync, signal: AbortSignal.abort() })
    expect(seen).not.toHaveBeenCalled()
  })

  test('each run gets a signal, aborted before the next and at the end', () => {
    const s = signal(1)
    const runs: AbortSignal[] = []
    const stop = effect(
      ({ signal }) => {
        s.get()
        runs.push(signal)
      },
      { scheduler: sync },
    )
    s.set(2)
    expect(runs[0]!.aborted).toBe(true)
    expect(runs[1]!.aborted).toBe(false)
    stop()
    expect(runs[1]!.aborted).toBe(true)
  })

  test('a returned function cleans up', () => {
    const s = signal(1)
    const cleaned: number[] = []
    const stop = effect(
      () => {
        const value = s.get()
        return () => cleaned.push(value)
      },
      { scheduler: sync },
    )
    s.set(2)
    expect(cleaned).toEqual([1])
    stop()
    expect(cleaned).toEqual([1, 2])
  })

  test('reads through untrack and peek do not count', () => {
    const a = signal(1)
    const b = signal(1)
    const seen = mock(() => {
      untrack(() => a.get())
      b.peek()
    })
    effect(seen, { scheduler: sync })
    a.set(2)
    b.set(2)
    expect(seen).toHaveBeenCalledTimes(1)
  })
})

describe('effect that throws', () => {
  test('others still run, and it stays alive', () => {
    const s = signal(0)
    const errors: unknown[] = []
    const a = mock(() => {
      if (s.get() === 1) throw new Error('boom')
    })
    const b = mock(() => s.get())
    effect(a, { scheduler: sync, onError: (e) => errors.push(e) })
    effect(b, { scheduler: sync })
    s.set(1)
    expect(errors).toHaveLength(1)
    expect(b).toHaveBeenCalledTimes(2)
    s.set(2)
    expect(a).toHaveBeenCalledTimes(3)
    expect(b).toHaveBeenCalledTimes(3)
  })

  test('its run is cleaned up before onError', () => {
    const order: string[] = []
    effect(
      ({ signal }) => {
        signal.addEventListener('abort', () => order.push('aborted'))
        throw new Error('boom')
      },
      { scheduler: sync, onError: () => order.push('onError') },
    )
    expect(order).toEqual(['aborted', 'onError'])
  })

  test('by default it is reported, and the process stays up', () => {
    const spy = quiet()
    effect(
      () => {
        throw new Error('boom')
      },
      { scheduler: sync },
    )
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  test('an onError that throws goes to the report', () => {
    const spy = quiet()
    effect(
      () => {
        throw new Error('first')
      },
      {
        scheduler: sync,
        onError: () => {
          throw new Error('second')
        },
      },
    )
    expect((spy.mock.calls[0]![0] as Error).message).toBe('second')
    spy.mockRestore()
  })

  test('a promise that fails goes to onError', async () => {
    const errors: unknown[] = []
    effect(async () => Promise.reject(new Error('later')), {
      scheduler: sync,
      onError: (e) => errors.push(e),
    })
    await Bun.sleep(0)
    expect(errors).toHaveLength(1)
  })

  test('a cleanup that throws goes to onError', () => {
    const errors: unknown[] = []
    const stop = effect(
      () => () => {
        throw new Error('cleanup')
      },
      { scheduler: sync, onError: (e) => errors.push(e) },
    )
    stop()
    expect(errors).toHaveLength(1)
  })
})

describe('effects that never settle', () => {
  test('on sync: stopped with an error, and alive afterwards', () => {
    const n = signal(0)
    const errors: unknown[] = []
    const run = mock(() => n.set(n.get() + 1))
    effect(run, { scheduler: sync, onError: (e) => errors.push(e) })
    expect(errors).toHaveLength(1)
    expect((errors[0] as Error).message).toContain('keep waking each other')
    expect(run.mock.calls.length).toBeLessThan(110)
    const before = run.mock.calls.length
    n.set(1000)
    expect(run.mock.calls.length).toBeGreaterThan(before)
  })

  test('on microtask: two effects waking each other', async () => {
    const a = signal(0)
    const b = signal(0)
    const errors: unknown[] = []
    const onError = (e: unknown) => errors.push(e)
    const stop1 = effect(() => b.set(a.get() + 1), { onError })
    const stop2 = effect(() => a.set(b.get() + 1), { onError })
    await Bun.sleep(1)
    expect(errors.length).toBeGreaterThan(0)
    stop1()
    stop2()
  })

  test('the limit can be adjusted', () => {
    const n = signal(0)
    const run = mock(() => n.set(n.get() + 1))
    const errors: unknown[] = []
    sync.limit = 5
    effect(run, { scheduler: sync, onError: (e) => errors.push(e) })
    sync.limit = 100
    expect(run.mock.calls.length).toBeLessThan(10)
    expect(errors).toHaveLength(1)
  })

  test('a scheduler that lets time pass may loop: it is an animation', async () => {
    const n = signal(0)
    const errors: unknown[] = []
    const stop = effect(() => n.set(n.get() + 1), {
      scheduler: later(0),
      onError: (e) => errors.push(e),
    })
    await Bun.sleep(30)
    stop()
    expect(n.get()).toBeGreaterThan(1)
    expect(errors).toEqual([])
  })

  test('flush stops a loop too', () => {
    const n = signal(0)
    const errors: unknown[] = []
    effect(() => n.set(n.get() + 1), { onError: (e) => errors.push(e) })
    flush()
    expect(errors).toHaveLength(1)
  })
})

describe('batch and flush', () => {
  test('several writes count as one', () => {
    const a = signal(1)
    const b = signal(1)
    const seen = mock(() => a.get() + b.get())
    effect(seen, { scheduler: sync })
    batch(() => {
      a.set(2)
      b.set(2)
      expect(seen).toHaveBeenCalledTimes(1)
    })
    expect(seen).toHaveBeenCalledTimes(2)
  })

  test('reads inside see fresh values', () => {
    const a = signal(1)
    const c = computed(() => a.get() * 2)
    batch(() => {
      a.set(2)
      expect(c.get()).toBe(4)
    })
  })

  test('nests, returns, and lets go even after an error', () => {
    const a = signal(1)
    const seen = mock(() => a.get())
    effect(seen, { scheduler: sync })
    expect(batch(() => batch(() => 5))).toBe(5)
    expect(() =>
      batch(() => {
        a.set(2)
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(seen).toHaveBeenCalledTimes(2)
  })

  test('flush runs what is pending, now and in order', () => {
    const s = signal(1)
    const seen: string[] = []
    effect(() => seen.push(`a${s.get()}`))
    effect(() => seen.push(`b${s.get()}`))
    flush()
    expect(seen).toEqual(['a1', 'b1'])
    s.set(2)
    flush()
    expect(seen).toEqual(['a1', 'b1', 'a2', 'b2'])
  })

  test('flush runs what effects wake up', () => {
    const a = signal(1)
    const b = signal(0)
    const seen: number[] = []
    effect(() => b.set(a.get() * 2))
    effect(() => seen.push(b.get()))
    flush()
    expect(seen.at(-1)).toBe(2)
  })

  test('an effect that already ran is not run again by its scheduler', async () => {
    const seen = mock(() => {})
    effect(seen)
    flush()
    await Bun.sleep(0)
    expect(seen).toHaveBeenCalledTimes(1)
  })
})

describe('schedulers', () => {
  test('manual runs when told', () => {
    const m = manual()
    const s = signal(1)
    const seen: number[] = []
    effect(() => seen.push(s.get()), { scheduler: m })
    expect(seen).toEqual([])
    m.run()
    expect(seen).toEqual([1])
    s.set(2)
    s.set(3)
    m.run()
    expect(seen).toEqual([1, 3])
  })

  test('later waits', async () => {
    const seen = mock(() => {})
    effect(seen, { scheduler: later(5) })
    expect(seen).not.toHaveBeenCalled()
    await Bun.sleep(15)
    expect(seen).toHaveBeenCalledTimes(1)
  })

  test('disposing cancels what is waiting', async () => {
    const seen = mock(() => {})
    const stop = effect(seen, { scheduler: later(1) })
    stop()
    await Bun.sleep(10)
    expect(seen).not.toHaveBeenCalled()
  })

  test('idle says when it is not the real thing', () => {
    expect(idle.native).toBe(false) // Bun has no requestIdleCallback
  })

  test('throttle runs at once, then waits its turn', async () => {
    const s = signal(1)
    const seen: number[] = []
    effect(() => seen.push(s.get()), { scheduler: throttle(30) })
    await Bun.sleep(5)
    expect(seen).toEqual([1])
    s.set(2)
    await Bun.sleep(5)
    expect(seen).toEqual([1])
    await Bun.sleep(40)
    expect(seen).toEqual([1, 2])
  })

  test('microtask is the default', () => {
    expect(microtask.limit).toBe(100)
  })
})

describe('watch', () => {
  test('runs only when its sources change', () => {
    const s = signal(1)
    const other = signal(1)
    const seen: unknown[][] = []
    watch(
      s,
      (now, before) => {
        other.get()
        seen.push([now, before])
      },
      { scheduler: sync },
    )
    expect(seen).toEqual([])
    s.set(2)
    expect(seen).toEqual([[2, 1]])
    other.set(2)
    expect(seen).toEqual([[2, 1]])
  })

  test('a change right after it starts is not lost', async () => {
    const s = signal(1)
    const seen: number[] = []
    watch(s, (now) => seen.push(now))
    s.set(2)
    await Promise.resolve()
    expect(seen).toEqual([2])
  })

  test('takes a list, of readables and functions alike', () => {
    const a = signal(1)
    const b = signal(2)
    const seen: unknown[] = []
    watch([a, () => b.get() * 2], ([x, y]) => seen.push([x, y]), {
      scheduler: sync,
    })
    b.set(3)
    expect(seen).toEqual([[1, 6]])
  })

  test('a function that gives the same result does not wake it', () => {
    const s = signal(1)
    const seen = mock(() => {})
    watch(() => s.get() % 2, seen, { scheduler: sync })
    s.set(3)
    expect(seen).not.toHaveBeenCalled()
    s.set(4)
    expect(seen).toHaveBeenCalledTimes(1)
  })

  test('immediate also runs for the first values', async () => {
    const s = signal(1)
    const seen: unknown[][] = []
    watch(s, (now, before) => seen.push([now, before]), { immediate: true })
    flush()
    expect(seen).toEqual([[1, undefined]])
  })

  test('each run gets a signal, and ends with the watch', () => {
    const s = signal(1)
    const runs: AbortSignal[] = []
    const stop = watch(s, (_n, _b, { signal }) => runs.push(signal), {
      scheduler: sync,
    })
    s.set(2)
    s.set(3)
    expect(runs[0]!.aborted).toBe(true)
    stop()
    expect(runs[1]!.aborted).toBe(true)
  })

  test('errors go to onError', () => {
    const s = signal(1)
    const errors: unknown[] = []
    watch(
      s,
      () => {
        throw new Error('boom')
      },
      { scheduler: sync, onError: (e) => errors.push(e) },
    )
    s.set(2)
    expect(errors).toHaveLength(1)
  })
})

describe('sources', () => {
  test('lists what a computed or an effect read last', () => {
    const a = signal(1)
    const b = signal(2)
    const c = computed(() => a.get() + b.get())
    c.get()
    expect(sources(c)).toEqual([a, b])
    const stop = effect(() => a.get(), { scheduler: sync })
    expect(sources(stop)).toEqual([a])
  })
})
