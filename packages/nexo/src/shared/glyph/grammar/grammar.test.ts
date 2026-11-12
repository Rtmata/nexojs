import { describe, expect, test } from 'bun:test'
import { DEFINITION } from '../token-set'
import { defineTokens } from '../tokens'
import { typed } from '../typed'
import { Grammar } from './grammar'

const palette = defineTokens({ blue: typed('color', { 700: '#1d4ed8' }) })
const tokens = defineTokens(
  {
    color: { text: '#222', surface: '#fff' },
    space: { s: '0.5rem', m: '1rem' },
    z: { top: 10 },
    font: { body: 'serif' },
  },
  { refersTo: [palette] },
)
const grammar = new Grammar(tokens[DEFINITION])

/** Whether each text reads as `type`. */
function reads(
  type: Parameters<Grammar['issue']>[0],
  texts: string[],
): boolean[] {
  return texts.map((text) => grammar.issue(type, text) === undefined)
}

describe('Grammar: what a person may type, by type', () => {
  test('dimension: lengths, percentages, 0', () => {
    expect(
      reads('dimension', [
        '1rem',
        '0',
        '12px',
        '50%',
        '-2px',
        '1.5em',
        '100dvh',
        '2cqi',
        '1Q',
      ]),
    ).toEqual(Array(9).fill(true))
    expect(
      reads('dimension', ['1remx', '12', '1 rem', 'rem', '', '1px 2px']),
    ).toEqual(Array(6).fill(false))
  })

  test('dimension: calc, min, max, clamp, with references inside', () => {
    expect(
      reads('dimension', [
        'calc(1rem + 2px)',
        'clamp(1rem, 2vw, 2rem)',
        'calc(var(--space-m) * 2)',
        'min(10px, calc((1rem - 2px) / 2))',
        'max(1rem)',
        'calc(var(--z-top) * 1px)',
      ]),
    ).toEqual(Array(6).fill(true))
    expect(
      reads('dimension', [
        'calc(1rem+2px)', // + needs spaces
        'calc(1rem + 2)', // length + number
        'calc(1rem * 2px)', // length × length
        'calc(2 / 1rem)', // divide by a length
        'clamp(1rem, 2rem)', // clamp takes three
        'calc(1rem, 2rem)', // calc takes one
        'calc(2 * 3)', // a number, not a length
        'calc(1rem',
        'foo(1rem)',
      ]),
    ).toEqual(Array(9).fill(false))
  })

  test('a reference: of the type, the palette too; a missing one names the nearest', () => {
    expect(reads('color', ['var(--color-text)', 'var(--blue-700)'])).toEqual([
      true,
      true,
    ])
    expect(grammar.issue('color', 'var(--space-m)')).toEqual({
      kind: 'mistyped',
      name: 'space-m',
      type: 'dimension',
    })
    expect(grammar.issue('color', 'var(--colr-text)')).toEqual({
      kind: 'missing',
      name: 'colr-text',
      suggestion: 'color-text',
    })
    expect(grammar.issue('dimension', 'calc(var(--space-x) * 2)')).toEqual({
      kind: 'missing',
      name: 'space-x',
      suggestion: 'space-s',
    })
    expect(reads('color', ['var(--color-text, red)'])).toEqual([false]) // a fallback glyph can't follow
  })

  test('fontFamily: quoted names, words, generic(), by commas', () => {
    expect(
      reads('fontFamily', [
        '"Inter", system-ui, sans-serif',
        'Gill Sans Extrabold, sans-serif',
        "'Noto Sans JP'",
        'generic(fangsong), serif',
        'Ubuntu Möno',
      ]),
    ).toEqual(Array(5).fill(true))
    expect(
      reads('fontFamily', ['inherit', 'Inter,', '12px', 'Inter "x"', '']),
    ).toEqual(Array(5).fill(false))
  })

  test('fontWeight: 1 to 1000, or a keyword', () => {
    expect(
      reads('fontWeight', ['400', '1', '1000', '550.5', 'bold', 'Lighter']),
    ).toEqual(Array(6).fill(true))
    expect(reads('fontWeight', ['0', '1001', 'heavy', '400px'])).toEqual(
      Array(4).fill(false),
    )
  })

  test('shadow: layers of lengths, a colour, inset; references in their slots', () => {
    expect(
      reads('shadow', [
        '0 1px 2px #0003',
        'inset 0 0 0 1px var(--color-text)',
        '0 1px 2px rgb(0 0 0 / 20%), 0 0 1px red',
        'red 2px 2px',
        '0 var(--space-s) calc(var(--space-m) * 2) var(--blue-700) inset',
      ]),
    ).toEqual(Array(5).fill(true))
    expect(
      reads('shadow', [
        '0 1px red red', // two colours
        '1px', // one length
        '0 0 0 0 0', // five lengths
        '0 red 1px', // lengths apart
        '0 1px -2px red', // negative blur
        '0 1px var(--font-body)', // a font in a shadow
        '0 1px,',
      ]),
    ).toEqual(Array(7).fill(false))
  })

  test('easing: keywords, cubic-bezier, steps, linear', () => {
    expect(
      reads('easing', [
        'ease-out',
        'cubic-bezier(.2, 0, 0, 1)',
        'cubic-bezier(0, -2, 1, 3)',
        'steps(4)',
        'steps(2, jump-none)',
        'steps(3, end)',
        'linear(0, 0.25 50%, 1)',
        'linear(0, 0.5 25% 75%, 1)',
      ]),
    ).toEqual(Array(8).fill(true))
    expect(
      reads('easing', [
        'bounce',
        'cubic-bezier(1.2, 0, 0, 1)', // x out of 0–1
        'cubic-bezier(0, 0, 1)',
        'steps(0)',
        'steps(1.5)',
        'steps(1, jump-none)',
        'steps(2, middle)',
        'linear(1)', // one stop
        'linear(0, 50%, 1)', // a stop with no number
      ]),
    ).toEqual(Array(9).fill(false))
  })
})
