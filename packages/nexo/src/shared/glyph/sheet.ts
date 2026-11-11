/**
 * What every piece of glyph that produces CSS gives (reset, base, tokens):
 * a plain value, so omino's `styles` list can take it without importing
 * glyph (A.3). `name` is the key a page emits each sheet once by; `css` is
 * complete and already inside its layer.
 */
export interface Sheet {
  readonly name: string
  readonly css: string
}

/** glyph's layers (E.1), lowest first: a later layer wins whatever the specificity. */
export type Layer =
  | 'glyph.reset'
  | 'glyph.base'
  | 'glyph.tokens'
  | 'glyph.themes'
  | 'glyph.recipes'

export const LAYER_ORDER =
  '@layer glyph.reset, glyph.base, glyph.tokens, glyph.themes, glyph.recipes;'

/**
 * A sheet whose `rules` sit in `layer`. Every sheet starts with the order
 * line: the first `@layer` a page meets fixes the order, so whichever sheets
 * are listed, and in whatever order, the order is glyph's. Meeting the line
 * again changes nothing: layers already known keep their place.
 *
 *   sheet('glyph.reset', 'glyph.reset', '* {\n  margin: 0;\n}')
 *   // @layer glyph.reset, glyph.base, …;
 *   // @layer glyph.reset {
 *   //   * {
 *   //     margin: 0;
 *   //   }
 *   // }
 */
export function sheet(name: string, layer: Layer, rules: string): Sheet {
  return {
    name,
    css: `${LAYER_ORDER}\n@layer ${layer} {\n${indented(rules)}}\n`,
  }
}

/** Rules written at the left margin, moved in one level, one per line. */
function indented(rules: string): string {
  const lines = rules.trim().split('\n')
  return lines.map((line) => (line ? `  ${line}\n` : '\n')).join('')
}
