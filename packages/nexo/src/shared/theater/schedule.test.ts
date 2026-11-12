import { describe, expect, test } from 'bun:test'
import { schedule } from './schedule'
import { stagger } from './stagger'

describe('schedule', () => {
  test('with no position, each segment goes after the previous one', () => {
    const table = schedule([
      { length: 300, position: {} },
      { length: 400, position: {} },
    ])
    expect(table).toEqual({ starts: [0, 300], end: 700 })
  })

  test('the room: shelves 200 ms after the title starts, the counter 100 ms before they end', () => {
    const table = schedule([
      { length: 300, position: {} },
      { length: 400, position: { with: 'previous', delay: 200 } },
      { length: 800, position: { delay: -100 } },
    ])
    expect(table).toEqual({ starts: [0, 200, 500], end: 1300 })
  })

  test('a label marks where the previous segment ended', () => {
    const table = schedule([
      { length: 300, position: {} },
      { label: 'lights' },
      { length: 100, position: { at: 1000 } },
      { length: 200, position: { with: 'lights' } },
    ])
    expect(table.starts).toEqual([0, 1000, 300])
    expect(table.end).toBe(1100)
  })

  test('nothing starts before 0', () => {
    expect(
      schedule([{ length: 100, position: { delay: -50 } }]).starts,
    ).toEqual([0])
  })

  test('an unknown label names the ones there are', () => {
    expect(() =>
      schedule([{ label: 'a' }, { length: 1, position: { with: 'b' } }]),
    ).toThrow('no label "b" before this segment (labels: a)')
  })
})

describe('stagger', () => {
  test('from the first, the last, the center and the edges', () => {
    const of = (s: ReturnType<typeof stagger>) =>
      [0, 1, 2, 3, 4].map((i) => s(i, 5))
    expect(of(stagger(50))).toEqual([0, 50, 100, 150, 200])
    expect(of(stagger(50, { from: 'last' }))).toEqual([200, 150, 100, 50, 0])
    expect(of(stagger(50, { from: 'center' }))).toEqual([100, 50, 0, 50, 100])
    expect(of(stagger(50, { from: 'edges', start: 10 }))).toEqual([
      10, 60, 110, 60, 10,
    ])
  })
})
