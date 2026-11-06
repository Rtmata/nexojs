import { describe, expect, test } from 'bun:test'
import {
  computed,
  effect,
  MediaQuery,
  signal,
  SignalArray,
  SignalDate,
  SignalMap,
  SignalSet,
  SignalURL,
  SignalURLSearchParams,
  snapshot,
  sync,
} from './index'

/** Counts the runs of an effect that reads `fn`, right away (sync). */
function runs(fn: () => unknown) {
  let count = 0
  const stop = effect(() => (fn(), count++), { scheduler: sync })
  return {
    get count() {
      return count
    },
    stop,
  }
}

describe('SignalSet', () => {
  test('has depends on that value only', () => {
    const set = new SignalSet(['a', 'b'])
    const a = runs(() => set.has('a'))
    set.delete('b')
    expect(a.count).toBe(1)
    set.delete('a')
    expect(a.count).toBe(2)
    set.add('a')
    expect(a.count).toBe(3)
    a.stop()
  })

  test('size and iterating follow what it holds', () => {
    const set = new SignalSet<number>()
    const size = computed(() => set.size)
    const all = computed(() => [...set])
    set.add(1).add(2)
    expect(size.get()).toBe(2)
    expect(all.get()).toEqual([1, 2])
    set.clear()
    expect(size.get()).toBe(0)
  })

  test('adding what is there notifies nothing', () => {
    const set = new SignalSet([1])
    const size = runs(() => set.size)
    set.add(1)
    expect(size.count).toBe(1)
    size.stop()
  })

  test('set methods and JSON', () => {
    const set = new SignalSet([1, 2])
    expect([...set.union(new Set([3]))]).toEqual([1, 2, 3])
    expect(set.isSubsetOf(new Set([1, 2, 3]))).toBe(true)
    expect(JSON.stringify(set)).toBe('[1,2]')
  })
})

describe('SignalMap', () => {
  test('get depends on that key only', () => {
    const map = new SignalMap([
      ['ada', 1],
      ['bob', 2],
    ])
    const ada = runs(() => map.get('ada'))
    map.set('bob', 3)
    expect(ada.count).toBe(1)
    map.set('ada', 5)
    expect(ada.count).toBe(2)
    map.set('ada', 5)
    expect(ada.count).toBe(2)
    ada.stop()
  })

  test('a missing key wakes when it arrives', () => {
    const map = new SignalMap<string, number>()
    const value = computed(() => map.get('x'))
    const has = computed(() => map.has('x'))
    expect(value.get()).toBeUndefined()
    map.set('x', 1)
    expect(value.get()).toBe(1)
    expect(has.get()).toBe(true)
    map.delete('x')
    expect(has.get()).toBe(false)
  })

  test('has does not wake when only the value changes', () => {
    const map = new SignalMap([['a', 1]])
    const has = runs(() => map.has('a'))
    map.set('a', 2)
    expect(has.count).toBe(1)
    has.stop()
  })

  test('values follow every value; keys only which keys', () => {
    const map = new SignalMap([['a', 1]])
    const values = runs(() => [...map.values()])
    const keys = runs(() => [...map.keys()])
    map.set('a', 2)
    expect(values.count).toBe(2)
    expect(keys.count).toBe(1)
    values.stop()
    keys.stop()
  })

  test('JSON is the entries', () => {
    expect(JSON.stringify(new SignalMap([['a', 1]]))).toBe('[["a",1]]')
  })
})

describe('SignalArray', () => {
  test('at depends on that index; length on the length', () => {
    const list = new SignalArray(['a', 'b'])
    const first = runs(() => list.at(0))
    const length = runs(() => list.length)
    list.set(1, 'B')
    expect(first.count).toBe(1)
    expect(length.count).toBe(1)
    list.unshift('z')
    expect(first.count).toBe(2)
    expect(length.count).toBe(2)
    first.stop()
    length.stop()
  })

  test('at(-1) follows the end', () => {
    const log = new SignalArray<string>()
    const last = computed(() => log.at(-1))
    expect(last.get()).toBeUndefined()
    log.push('saved')
    expect(last.get()).toBe('saved')
    log.push('sent')
    expect(last.get()).toBe('sent')
  })

  test('reading methods are the native ones, tracked', () => {
    const list = new SignalArray([3, 1, 2])
    const sum = computed(() => list.reduce((a, b) => a + b, 0))
    const big = computed(() => list.filter((n) => n > 1))
    expect(sum.get()).toBe(6)
    list.set(0, 10)
    expect(sum.get()).toBe(13)
    expect(big.get()).toEqual([10, 2])
    expect(list.toSorted((a, b) => a - b)).toEqual([1, 2, 10])
  })

  test('sort and reverse move items, and their readers hear it', () => {
    const list = new SignalArray([3, 1, 2])
    const first = computed(() => list.at(0))
    list.sort()
    expect(first.get()).toBe(1)
    list.reverse()
    expect(first.get()).toBe(3)
  })

  test('splice as the native one', () => {
    const list = new SignalArray([1, 2, 3, 4])
    expect(list.splice(-2)).toEqual([3, 4])
    expect(list.splice(0, 1, 9)).toEqual([1])
    expect([...list]).toEqual([9, 2])
  })

  test('JSON is a plain array', () => {
    expect(JSON.stringify({ log: new SignalArray([1]) })).toBe('{"log":[1]}')
  })
})

describe('SignalDate', () => {
  test('a real Date, tracked', () => {
    const date = new SignalDate(2026, 0, 1)
    expect(date).toBeInstanceOf(Date)
    const year = computed(() => date.getFullYear())
    expect(year.get()).toBe(2026)
    date.setFullYear(2030)
    expect(year.get()).toBe(2030)
  })

  test('setting the same time notifies nothing', () => {
    const date = new SignalDate(0)
    const time = runs(() => date.getTime())
    date.setTime(0)
    expect(time.count).toBe(1)
    date.setTime(5)
    expect(time.count).toBe(2)
    time.stop()
  })

  test('arithmetic and JSON', () => {
    const date = new SignalDate(1000)
    expect(+date - 1000).toBe(0)
    expect(JSON.stringify(date)).toBe('"1970-01-01T00:00:01.000Z"')
  })
})

describe('SignalURL', () => {
  test('a real URL, its parts tracked', () => {
    const url = new SignalURL('https://museum.test/games?page=1')
    expect(url).toBeInstanceOf(URL)
    const path = computed(() => url.pathname)
    url.pathname = '/consoles'
    expect(path.get()).toBe('/consoles')
    expect(url.href).toBe('https://museum.test/consoles?page=1')
  })

  test('its params and its search follow each other', () => {
    const url = new SignalURL('https://museum.test/?page=1')
    const page = computed(() => url.searchParams.get('page'))
    const search = computed(() => url.search)
    url.searchParams.set('page', '2')
    expect(search.get()).toBe('?page=2')
    url.search = '?page=3'
    expect(page.get()).toBe('3')
    expect(url.searchParams).toBeInstanceOf(URLSearchParams)
  })

  test('JSON is the href', () => {
    expect(JSON.stringify(new SignalURL('https://a.test/'))).toBe(
      '"https://a.test/"',
    )
  })
})

describe('SignalURLSearchParams', () => {
  test('a real URLSearchParams, tracked', () => {
    const query = new SignalURLSearchParams('a=1')
    const a = computed(() => query.get('a'))
    const size = computed(() => query.size)
    query.set('a', '2')
    query.append('b', '3')
    expect(a.get()).toBe('2')
    expect(size.get()).toBe(2)
    expect(String(query)).toBe('a=2&b=3')
  })
})

describe('MediaQuery', () => {
  test('without matchMedia it gives the fallback', () => {
    expect(new MediaQuery('(min-width: 60em)').get()).toBe(false)
    expect(
      new MediaQuery('(min-width: 60em)', { fallback: true }).matches,
    ).toBe(true)
  })
})

describe('snapshot', () => {
  test('exactly what JSON keeps', () => {
    const settings = { theme: signal('dark'), tags: new SignalSet(['a']) }
    expect(snapshot(settings)).toEqual({ theme: 'dark', tags: ['a'] })
    expect(snapshot(undefined)).toBeUndefined()
    expect(snapshot({ when: new Date(0) })).toEqual({
      when: '1970-01-01T00:00:00.000Z',
    })
  })
})
