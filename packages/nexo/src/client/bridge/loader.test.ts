import { describe, expect, test } from 'bun:test'
import { cachedFrom } from './loader'

describe('cachedFrom', () => {
  test('a response without a URL (one a service worker built) is kept under the request', async () => {
    const response = new Response('<p>x</p>')
    const cached = await cachedFrom(response, 'http://m.test/a?_segment=shelf')
    expect(cached.url).toBe('http://m.test/a')
    expect(cached.html).toBe('<p>x</p>')
  })
})
