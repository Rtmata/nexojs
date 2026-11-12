import { sheet } from './sheet'

/**
 * A small modern reset: boxes sized by their border, no default
 * margins, media that never overflows, controls that use the page's font.
 * Optional: it applies only where a `styles` list names it.
 *
 *   static styles = [reset]
 */
export const reset = sheet(
  'glyph.reset',
  'glyph.reset',
  `
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
`,
)
