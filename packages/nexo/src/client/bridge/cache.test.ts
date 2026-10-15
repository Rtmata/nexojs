import { describe, expect, test } from 'bun:test'
import { ResponseCache, type Cached } from './cache'

const page = (html: string): Cached => ({
  html,
  url: '/a',
  status: 200,
  etag: null,
  cacheControl: null,
})

describe('ResponseCache', () => {
  test('an entry is fresh until its time, then only stale', () => {
    let clock = 0
    const cache = new ResponseCache(1000, () => clock)
    cache.set('/a', page('<p>a</p>'))
    clock = 1000
    expect(cache.get('/a')?.html).toBe('<p>a</p>')
    clock = 1001
    expect(cache.get('/a')).toBeUndefined()
    expect(cache.has('/a')).toBe(false)
    expect(cache.getStale('/a')?.html).toBe('<p>a</p>')
  })

  test('a response may say how long it is fresh', () => {
    let clock = 0
    const cache = new ResponseCache(1000, () => clock)
    cache.set('/a', page('1'), 5000)
    cache.set('/b', page('2'), 0)
    clock = 4000
    expect(cache.get('/a')?.html).toBe('1')
    expect(cache.get('/b')).toBeUndefined()
    expect(cache.getStale('/b')?.html).toBe('2')
  })

  test('setting again restarts the clock; clear forgets everything', () => {
    let clock = 0
    const cache = new ResponseCache(100, () => clock)
    cache.set('/a', page('1'))
    clock = 90
    cache.set('/a', page('2'))
    clock = 150
    expect(cache.get('/a')?.html).toBe('2')
    cache.clear()
    expect(cache.getStale('/a')).toBeUndefined()
  })
})
