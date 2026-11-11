import { expect, test } from 'bun:test'
import { reset } from './reset'

test('reset: a small modern reset in glyph.reset, after the layer order', () => {
  expect(reset).toEqual({
    name: 'glyph.reset',
    css: `@layer glyph.reset, glyph.base, glyph.tokens, glyph.themes, glyph.recipes;
@layer glyph.reset {
  *, *::before, *::after {
    box-sizing: border-box;
  }
  * {
    margin: 0;
  }
  body {
    min-block-size: 100dvh;
    line-height: 1.5;
  }
  img, picture, video, canvas, svg {
    display: block;
    max-inline-size: 100%;
  }
  input, button, textarea, select {
    font: inherit;
  }
  p, h1, h2, h3, h4, h5, h6 {
    overflow-wrap: break-word;
  }
  h1, h2, h3, h4, h5, h6 {
    text-wrap: balance;
  }
}
`,
  })
})
