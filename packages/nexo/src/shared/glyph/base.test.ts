import { expect, test } from 'bun:test'
import { base } from './base'
import { defineTokens } from './tokens'

const tokens = defineTokens({
  color: {
    text: '#222',
    surface: '#fff',
    primary: '#2563eb',
    'on-primary': '#fff',
    border: '#ccc',
  },
  font: { body: 'system-ui', mono: 'ui-monospace' },
})

test('base: classless styles that read your tokens, in glyph.base', () => {
  expect(base(tokens).name).toBe('glyph.base')
  expect(base(tokens).css)
    .toBe(`@layer glyph.reset, glyph.base, glyph.tokens, glyph.themes, glyph.recipes;
@layer glyph.base {
  html {
    color: var(--color-text);
    background-color: var(--color-surface);
    font-family: var(--font-body);
    line-height: 1.5;
  }

  h1, h2, h3, h4, h5, h6 {
    line-height: 1.2;
  }
  h1 { font-size: 2.25rem; }
  h2 { font-size: 1.75rem; }
  h3 { font-size: 1.375rem; }
  h4 { font-size: 1.125rem; }

  p, ul, ol, dl, blockquote, pre, table, figure, form, fieldset, h1, h2, h3, h4, h5, h6 {
    margin-block-end: 1rem;
  }

  a {
    color: var(--color-primary);
    text-underline-offset: 0.2em;
  }
  :focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  code, kbd, samp, pre {
    font-family: var(--font-mono);
    font-size: 0.875em;
  }

  pre {
    overflow-x: auto;
    padding: 1rem;
    border: 1px solid var(--color-border);
  }

  input:not([type="checkbox"], [type="radio"], [type="range"], [type="color"]), select, textarea {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    color: var(--color-text);
    background-color: var(--color-surface);
  }

  input[type="checkbox"], input[type="radio"], input[type="range"], progress {
    accent-color: var(--color-primary);
  }

  button, input[type="submit"], input[type="reset"], input[type="button"] {
    padding: 0.5rem 1rem;
    border: 1px solid var(--color-primary);
    border-radius: 0.375rem;
    color: var(--color-on-primary);
    background-color: var(--color-primary);
  }

  :disabled {
    opacity: 0.5;
  }

  table {
    border-collapse: collapse;
  }
  th, td {
    padding: 0.5rem;
    border-block-end: 1px solid var(--color-border);
    text-align: start;
  }
}
`)
})

test('base takes any object of the shape, and writes what it was given', () => {
  const css = base({
    color: {
      text: 'black',
      surface: 'white',
      primary: 'blue',
      'on-primary': 'white',
      border: 'gray',
    },
    font: { body: 'serif', mono: 'monospace' },
  }).css
  expect(css).toContain(
    '  html {\n    color: black;\n    background-color: white;\n    font-family: serif;',
  )
  expect(css).toContain('    color: white;\n    background-color: blue;')
})
