import { describe, expect, mock, spyOn, test } from 'bun:test'
import {
  changed,
  computed,
  debounce,
  debounced,
  event,
  flush,
  signal,
} from './index'

describe('debounce', () => {
  test('runs the last call once calls stop', async () => {
    const fn = mock((n: number) => n)
    const d = debounce(fn, 10)
    d(1)
    d(2)
    d(3)
    expect(fn).not.toHaveBeenCalled()
    await Bun.sleep(20)
    expect(fn.mock.calls).toEqual([[3]])
  })

  test('each call restarts the wait', async () => {
    const fn = mock(() => {})
    const d = debounce(fn, 15)
    d()
    await Bun.sleep(10)
    d()
    await Bun.sleep(10)
    expect(fn).not.toHaveBeenCalled()
    await Bun.sleep(15)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test('leading runs the first call too', async () => {
    const fn = mock((n: number) => n)
    const d = debounce(fn, 10, { leading: true })
    d(1)
    expect(fn.mock.calls).toEqual([[1]])
    d(2)
    await Bun.sleep(20)
    expect(fn.mock.calls).toEqual([[1], [2]])
  })

  test('maxWait runs it even while calls keep coming', async () => {
    const fn = mock(() => {})
    const d = debounce(fn, 20, { maxWait: 30 })
    for (let i = 0; i < 5; i++) {
      d()
      await Bun.sleep(10)
    }
    expect(fn.mock.calls.length).toBeGreaterThan(0)
    d.cancel()
  })

  test('cancel, flush and pending', async () => {
    const fn = mock((n: number) => n)
    const d = debounce(fn, 10)
    d(1)
    expect(d.pending.get()).toBe(true)
    d.cancel()
    expect(d.pending.get()).toBe(false)
    d(2)
    d.flush()
    expect(fn.mock.calls).toEqual([[2]])
    await Bun.sleep(20)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test('aborting its signal drops what waits and every later call', async () => {
    const fn = mock(() => {})
    const controller = new AbortController()
    const d = debounce(fn, 5, { signal: controller.signal })
    d()
    controller.abort()
    d()
    await Bun.sleep(15)
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('debounced', () => {
  test('follows its source once it stops changing, through computeds', async () => {
    const search = signal('a')
    const upper = computed(() => search.get().toUpperCase())
    const query = debounced(upper, 10)
    expect(query.get()).toBe('A')
    search.set('ab')
    search.set('abc')
    expect(query.get()).toBe('A')
    expect(query.pending.get()).toBe(true)
    await Bun.sleep(20)
    expect(query.get()).toBe('ABC')
    expect(query.pending.get()).toBe(false)
    query.dispose()
  })

  test('dispose stops it', async () => {
    const s = signal(1)
    const value = debounced(s, 5)
    value.dispose()
    s.set(2)
    await Bun.sleep(15)
    expect(value.get()).toBe(1)
  })
})

describe('event', () => {
  test('on, emit, off', () => {
    const saved = event<string>()
    const seen: string[] = []
    const off = saved.on((title) => seen.push(title))
    saved.emit('Dune')
    off()
    saved.emit('Emma')
    expect(seen).toEqual(['Dune'])
  })

  test('emit is a plain function', () => {
    const closed = event()
    let count = 0
    closed.on(() => count++)
    const onclose = closed.emit
    onclose()
    expect(count).toBe(1)
  })

  test('signal and once, as addEventListener', () => {
    const tick = event<number>()
    const controller = new AbortController()
    const a = mock(() => {})
    const b = mock(() => {})
    tick.on(a, { signal: controller.signal })
    tick.on(b, { once: true })
    tick.emit(1)
    controller.abort()
    tick.emit(2)
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    expect(tick.size).toBe(0)
  })

  test('a throwing listener is reported, and the rest run', () => {
    const errors: unknown[] = []
    const tick = event<number>({ onError: (e) => errors.push(e) })
    const after = mock(() => {})
    tick.on(() => {
      throw new Error('boom')
    })
    tick.on(after)
    tick.emit(1)
    expect(errors).toHaveLength(1)
    expect(after).toHaveBeenCalled()
  })

  test('the default reports with the event name', () => {
    const quiet = spyOn(console, 'error').mockImplementation(() => {})
    const tick = event<number>({ name: 'tick' })
    tick.on(() => {
      throw new Error('boom')
    })
    tick.emit(1)
    expect(quiet).toHaveBeenCalled()
    expect(tick.label).toBe('event "tick"')
    quiet.mockRestore()
  })

  test('next is a promise; aborting rejects it', async () => {
    const tick = event<number>()
    const next = tick.next()
    tick.emit(7)
    expect(await next).toBe(7)
    const controller = new AbortController()
    const waiting = tick.next({ signal: controller.signal })
    controller.abort()
    await expect(waiting).rejects.toBe(controller.signal.reason)
    expect(tick.size).toBe(0)
  })

  test('listeners pair with debounce', async () => {
    const typed = event<string>()
    const seen: string[] = []
    typed.on(debounce((v: string) => seen.push(v), 10))
    typed.emit('a')
    typed.emit('ab')
    await Bun.sleep(20)
    expect(seen).toEqual(['ab'])
  })
})

describe('changed', () => {
  test('emits the new value each time the source changes', () => {
    const theme = signal('light')
    const themeChanged = event<string>()
    const seen: string[] = []
    themeChanged.on((t) => seen.push(t))
    const stop = changed(theme, themeChanged)
    theme.set('dark')
    flush()
    theme.set('sepia')
    flush()
    expect(seen).toEqual(['dark', 'sepia'])
    stop()
  })
})

describe('abort listeners leave with the listener (review)', () => {
  test('next() and on(…, { once }) remove their abort listeners when they fire', async () => {
    const tick = event<number>()
    const controller = new AbortController()
    const { signal } = controller
    const added = spyOn(signal, 'addEventListener')
    const removed = spyOn(signal, 'removeEventListener')
    const waiting = tick.next({ signal })
    tick.on(() => {}, { once: true, signal })
    tick.emit(1)
    expect(await waiting).toBe(1)
    expect(removed).toHaveBeenCalledTimes(added.mock.calls.length)
    added.mockRestore()
    removed.mockRestore()
  })
})
