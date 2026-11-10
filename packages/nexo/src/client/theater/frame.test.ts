import { describe, expect, test } from 'bun:test'
import { FrameLoop, type FrameSource, type FrameTime } from './frame'

/** Frames on demand: `tick(now)` runs what was requested. */
class ManualFrames implements FrameSource {
  private waiting: ((now: number) => void)[] = []

  request(callback: (now: number) => void): void {
    this.waiting.push(callback)
  }

  tick(now: number): void {
    const callbacks = this.waiting
    this.waiting = []
    for (const callback of callbacks) callback(now)
  }

  get pending(): number {
    return this.waiting.length
  }
}

describe('FrameLoop', () => {
  test('runs phases in order: read, update, render', () => {
    const frames = new ManualFrames()
    const loop = new FrameLoop(frames)
    const order: string[] = []
    const { signal } = new AbortController()
    loop.every('render', () => order.push('render'), { signal })
    loop.every('read', () => order.push('read'), { signal })
    loop.every('update', () => order.push('update'), { signal })
    frames.tick(0)
    expect(order).toEqual(['read', 'update', 'render'])
  })

  test('one request per frame however many jobs', () => {
    const frames = new ManualFrames()
    const loop = new FrameLoop(frames)
    const { signal } = new AbortController()
    for (let i = 0; i < 50; i++) loop.every('update', () => {}, { signal })
    expect(frames.pending).toBe(1)
  })

  test('sleeps once every signal has aborted', () => {
    const frames = new ManualFrames()
    const loop = new FrameLoop(frames)
    const stop = new AbortController()
    loop.every('update', () => {}, { signal: stop.signal })
    frames.tick(0)
    stop.abort()
    frames.tick(16)
    expect(frames.pending).toBe(0)
    expect(loop.size).toBe(0)
  })

  test('delta: one 60 Hz frame first, then the gap, at most 40 ms', () => {
    const frames = new ManualFrames()
    const loop = new FrameLoop(frames)
    const deltas: number[] = []
    const { signal } = new AbortController()
    loop.every('update', ({ delta }: FrameTime) => deltas.push(delta), {
      signal,
    })
    for (const now of [1000, 1016, 1116]) frames.tick(now)
    expect(deltas).toEqual([1000 / 60, 16, 40])
  })

  test('next runs once', () => {
    const frames = new ManualFrames()
    const loop = new FrameLoop(frames)
    let runs = 0
    loop.next('read', () => runs++)
    frames.tick(0)
    frames.tick(16)
    expect(runs).toBe(1)
  })

  test('a job that throws is reported; the others still run', () => {
    const frames = new ManualFrames()
    const loop = new FrameLoop(frames)
    const { signal } = new AbortController()
    const reported: unknown[] = []
    const original = globalThis.reportError
    globalThis.reportError = (error: unknown) => reported.push(error)
    let ran = false
    loop.every(
      'update',
      () => {
        throw new Error('boom')
      },
      { signal },
    )
    loop.every('update', () => (ran = true), { signal })
    frames.tick(0)
    globalThis.reportError = original
    expect(ran).toBe(true)
    expect(reported).toHaveLength(1)
  })

  test('an aborted signal adds nothing', () => {
    const loop = new FrameLoop(new ManualFrames())
    loop.every('update', () => {}, { signal: AbortSignal.abort() })
    expect(loop.size).toBe(0)
  })
})
