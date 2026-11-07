import { describe, expect, test } from 'bun:test'
import { renderToString } from '../../shared/omino/render'
import { boolean, json, number, oneOf, panel, registry } from './index'

const gallery = panel({
  params: {
    start: number(0),
    loop: boolean(),
    shots: json<string[]>([]),
    side: oneOf(['left', 'right'], 'left'),
  },
})
const tabs = panel({ params: { open: number(0) } })
const panels = registry({ gallery, tabs })

describe('typed server markup (R.23)', () => {
  test('one panel: data-panel and each param by its own parser', () => {
    expect(
      panels.markup('gallery', {
        start: 2,
        loop: true,
        shots: ['a'],
        side: 'right',
      }),
    ).toEqual({
      'data-panel': 'gallery',
      'data-gallery-start': '2',
      'data-gallery-loop': true,
      'data-gallery-shots': '["a"]',
      'data-gallery-side': 'right',
    })
  })

  test('a false boolean is left out; nothing given is just the name', () => {
    expect(panels.markup('gallery', { loop: false })).toEqual({
      'data-panel': 'gallery',
    })
    expect(panels.markup('tabs')).toEqual({ 'data-panel': 'tabs' })
  })

  test('several panels on one element', () => {
    expect(panels.markup({ gallery: { start: 1 }, tabs: { open: 2 } })).toEqual(
      {
        'data-panel': 'gallery tabs',
        'data-gallery-start': '1',
        'data-tabs-open': '2',
      },
    )
  })

  test('the server renders it', async () => {
    const html = await renderToString(
      <section {...panels.markup('gallery', { start: 2, loop: true })} />,
    )
    expect(html).toBe(
      '<section data-panel="gallery" data-gallery-start="2" data-gallery-loop></section>',
    )
  })

  test('types: a wrong name or a wrong value is a compile error (never run)', () => {
    const check = () => {
      // @ts-expect-error no panel named "galery"
      panels.markup('galery', {})
      // @ts-expect-error start is a number
      panels.markup('gallery', { start: 'two' })
      // @ts-expect-error tabs has no "start"
      panels.markup('tabs', { start: 1 })
    }
    expect(typeof check).toBe('function')
  })
})
