import { expect, test } from 'bun:test'
import { Visits } from './in-view'

/** What Visits reads of an observer entry. */
const entry = (inside: boolean) =>
  ({
    isIntersecting: inside,
    intersectionRatio: inside ? 1 : 0,
  }) as IntersectionObserverEntry

test('once: leave and enter in one batch start no second visit', () => {
  let visits = 0
  const once = new Visits(
    () => void visits++,
    0,
    () => {},
    true,
  )
  for (const seen of [true, false, true]) once.seen(entry(seen))
  expect(visits).toBe(1)
})

test('without once, each entering is a visit', () => {
  let visits = 0
  const every = new Visits(() => void visits++, 0)
  for (const seen of [true, false, true]) every.seen(entry(seen))
  expect(visits).toBe(2)
})
