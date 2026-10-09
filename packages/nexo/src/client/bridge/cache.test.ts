import { describe, expect, test } from 'bun:test'
import { ResponseCache } from './cache'

describe('ResponseCache', () => {
  test('gives an entry back until it expires', () => {
    let clock = 0
    const cache = new ResponseCache(1000, () => clock)
    cache.set('/a', { html: '<p>a</p>', url: '/a', status: 200 })
    clock = 999
    expect(cache.get('/a')?.html).toBe('<p>a</p>')
    clock = 1001
    expect(cache.get('/a')).toBeUndefined()
    expect(cache.has('/a')).toBe(false)
  })

  test('setting again restarts the clock', () => {
    let clock = 0
    const cache = new ResponseCache(100, () => clock)
    cache.set('/a', { html: '1', url: '/a', status: 200 })
    clock = 90
    cache.set('/a', { html: '2', url: '/a', status: 200 })
    clock = 150
    expect(cache.get('/a')?.html).toBe('2')
  })
})
