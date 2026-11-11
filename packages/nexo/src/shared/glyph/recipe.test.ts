import { describe, expect, test } from 'bun:test'
import { recipe } from './recipe'
import { LAYER_ORDER } from './sheet'

const button = recipe('button', {
  vars: { bg: 'var(--color-surface)', pad: '0.5rem' },
  base: (v) => ({
    background: v.bg,
    padding: v.pad,
    '&:hover': { filter: 'brightness(1.1)' },
  }),
  variants: {
    intent: {
      primary: { bg: 'var(--color-primary)' },
      ghost: { bg: 'transparent' },
    },
    size: { small: { pad: '0.25rem' }, medium: {} },
  },
  defaultVariants: { intent: 'primary', size: 'medium' },
  when: [{ intent: 'ghost', size: 'small', set: { pad: '0' } }],
})

describe('recipe (D)', () => {
  test('a call gives every group with its value, defaults included (D.2)', () => {
    expect(button()).toBe('button button--intent-primary button--size-medium')
    expect(button({ size: 'small', intent: 'ghost' })).toBe(
      'button button--intent-ghost button--size-small',
    )
  })

  test('the sheet: vars with defaults and the base below, variants and when above (A.1, D.1, D.4)', () => {
    expect(button.name).toBe('glyph.recipes(button)')
    expect(button.css).toBe(`${LAYER_ORDER}
@layer glyph.recipes {
  @layer base, variants;
  @layer base {
    .button {
      --button-bg: var(--color-surface);
      --button-pad: 0.5rem;
      background: var(--button-bg);
      padding: var(--button-pad);
      &:hover {
        filter: brightness(1.1);
      }
    }
  }
  @layer variants {
    .button--intent-primary {
      --button-bg: var(--color-primary);
    }
    .button--intent-ghost {
      --button-bg: transparent;
    }
    .button--size-small {
      --button-pad: 0.25rem;
    }
    .button--intent-ghost.button--size-small {
      --button-pad: 0;
    }
  }
}
`)
  })

  test('parts: a class each, reading the root vars through inheritance (D.5)', () => {
    const card = recipe('card', {
      vars: { gap: '1rem' },
      base: (v) => ({ display: 'grid', gap: v.gap }),
      variants: { tone: { quiet: { gap: '0.5rem' } } },
      parts: { header: (v) => ({ 'margin-bottom': v.gap }) },
    })
    expect(card({ tone: 'quiet' })).toEqual({
      root: 'card card--tone-quiet',
      header: 'card__header',
    })
    expect(card.css).toContain(
      '    .card__header {\n      margin-bottom: var(--card-gap);\n    }',
    )
  })

  test('variants nest selectors too, and set vars there (D.3)', () => {
    const link = recipe('link', {
      vars: { fg: 'blue' },
      base: (v) => ({ color: v.fg }),
      variants: {
        tone: {
          muted: {
            fg: 'gray',
            '&:hover': { fg: 'black' },
            '@media (width > 60rem)': { fg: 'navy' },
          },
        },
      },
    })
    expect(link.css).toContain(`    .link--tone-muted {
      --link-fg: gray;
      &:hover {
        --link-fg: black;
      }
      @media (width > 60rem) {
        --link-fg: navy;
      }
    }`)
  })

  test('the types: vars, groups and values are checked, typos are errors', () => {
    expect(() =>
      recipe('t', {
        vars: { bg: 'red' },
        // @ts-expect-error — no var bgg
        base: (v) => ({ background: v.bgg }),
      }),
    ).toThrow("undefined can't be a CSS value here")
    expect(() =>
      recipe('t', {
        vars: { bg: 'red' },
        base: () => ({}),
        variants: { tone: { dark: { bg: 'black' } } },
        // @ts-expect-error — when sets vars only, and there is no var color
        when: [{ tone: 'dark', set: { color: 'black' } }],
      }),
    ).toThrow('"color" is not a var of this recipe')
    expect(() =>
      recipe('t', {
        vars: { bg: 'red' },
        base: () => ({}),
        // @ts-expect-error — a variant changes vars only, and there is no var color
        variants: { tone: { dark: { color: 'black' } } },
      }),
    ).toThrow(
      '"color" is not a var of this recipe; a variant changes vars only',
    )
    expect(() =>
      recipe('t', {
        vars: { bg: 'red' },
        base: () => ({}),
        variants: { tone: { dark: { bg: 'black' } } },
        // @ts-expect-error — no value light
        defaultVariants: { tone: 'light' },
      }),
    ).toThrow('tone has no value "light"; it has dark')
    // @ts-expect-error — no value huge
    expect(() => button({ size: 'huge' })).toThrow(
      'size has no value "huge"; it has small, medium',
    )
    const plain = recipe('plain', {
      vars: {},
      base: () => ({ display: 'block' }),
    })
    const classes: string = plain()
    expect(classes).toBe('plain')
  })

  test('mistakes in code throw and say how to fix them', () => {
    const base = () => ({})
    expect(() => recipe('my button', { vars: {}, base })).toThrow(
      `"my button" can't be part of a class`,
    )
    expect(() =>
      recipe('x', { vars: {}, base: () => ({ fontSize: '1rem' }) }),
    ).toThrow(
      '"fontSize" is not a CSS property; write CSS\'s own name in kebab-case',
    )
    expect(() => recipe('x', { vars: { bg: 'red; } body {' }, base })).toThrow(
      "can't be a CSS value here",
    )
    expect(() =>
      recipe('x', {
        vars: {},
        base,
        variants: { 'a-b': { c: {} }, a: { 'b-c': {} } },
      }),
    ).toThrow('a-b.c and a.b-c both make the class x--a-b-c; rename one')
    expect(() =>
      recipe('x', { vars: {}, base, parts: { root: base } }),
    ).toThrow("a part can't be called root")
  })
})
