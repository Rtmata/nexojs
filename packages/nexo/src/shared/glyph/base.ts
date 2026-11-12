import { sheet, type Sheet } from './sheet'

/**
 * The tokens `base` reads (interface segregation: only what it uses). Any
 * object of this shape works — `defineTokens`' result, or one written by
 * hand — so the CSS shows `var(--color-text)` or whatever was given.
 */
export interface BaseTokens {
  readonly color: {
    readonly text: string
    readonly surface: string
    readonly primary: string
    readonly 'on-primary': string
    readonly border: string
  }
  readonly font: { readonly body: string; readonly mono: string }
}

/**
 * Classless styles from your tokens, Pico-like but small: the page's
 * text, headings, links, code, forms and tables, with no class to write.
 * Optional: it applies only where a `styles` list names it.
 *
 *   const tokens = defineTokens({ color: { text: '#222', … }, font: { … } })
 *   static styles = [reset, tokens, base(tokens)]
 */
export function base(tokens: BaseTokens): Sheet {
  const parts = [
    ...[page, headings, flow, links, code, preformatted],
    ...[fields, choices, buttons, disabled, tables],
  ]
  const rules = parts.map((part) => part(tokens)).join('')
  return sheet('glyph.base', 'glyph.base', rules)
}

function page({ color, font }: BaseTokens): string {
  return `
html {
  color: ${color.text};
  background-color: ${color.surface};
  font-family: ${font.body};
  line-height: 1.5;
}
`
}

function headings(): string {
  return `
h1, h2, h3, h4, h5, h6 {
  line-height: 1.2;
}
h1 { font-size: 2.25rem; }
h2 { font-size: 1.75rem; }
h3 { font-size: 1.375rem; }
h4 { font-size: 1.125rem; }
`
}

/** The reset removes every margin; text that flows gets space after it again. */
function flow(): string {
  return `
p, ul, ol, dl, blockquote, pre, table, figure, form, fieldset, h1, h2, h3, h4, h5, h6 {
  margin-block-end: 1rem;
}
`
}

function links({ color }: BaseTokens): string {
  return `
a {
  color: ${color.primary};
  text-underline-offset: 0.2em;
}
:focus-visible {
  outline: 2px solid ${color.primary};
  outline-offset: 2px;
}
`
}

function code({ font }: BaseTokens): string {
  return `
code, kbd, samp, pre {
  font-family: ${font.mono};
  font-size: 0.875em;
}
`
}

function preformatted({ color }: BaseTokens): string {
  return `
pre {
  overflow-x: auto;
  padding: 1rem;
  border: 1px solid ${color.border};
}
`
}

/** Text fields only: boxes and paddings would distort checkboxes and sliders. */
function fields({ color }: BaseTokens): string {
  return `
input:not([type="checkbox"], [type="radio"], [type="range"], [type="color"]), select, textarea {
  padding: 0.5rem 0.75rem;
  border: 1px solid ${color.border};
  border-radius: 0.375rem;
  color: ${color.text};
  background-color: ${color.surface};
}
`
}

/** Checkboxes, radios and sliders keep the platform's look, in your colour. */
function choices({ color }: BaseTokens): string {
  return `
input[type="checkbox"], input[type="radio"], input[type="range"], progress {
  accent-color: ${color.primary};
}
`
}

/** After the fields, so a submit input (also an input) looks like a button. */
function buttons({ color }: BaseTokens): string {
  return `
button, input[type="submit"], input[type="reset"], input[type="button"] {
  padding: 0.5rem 1rem;
  border: 1px solid ${color.primary};
  border-radius: 0.375rem;
  color: ${color['on-primary']};
  background-color: ${color.primary};
}
`
}

function disabled(): string {
  return `
:disabled {
  opacity: 0.5;
}
`
}

function tables({ color }: BaseTokens): string {
  return `
table {
  border-collapse: collapse;
}
th, td {
  padding: 0.5rem;
  border-block-end: 1px solid ${color.border};
  text-align: start;
}
`
}
