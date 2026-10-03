import type { ComponentClass } from './component'

/** The type of `<>...</>`: renders only its children. */
export const Fragment = Symbol.for('omino.fragment')

/**
 * What JSX produces: a description of an element, not HTML yet.
 * `<h1 class="title">NES</h1>` → Element('h1', { class: 'title', children: 'NES' })
 *
 * A class rather than a plain shape, so a data record that happens to have
 * `type` and `props` fields is never mistaken for markup.
 */
export class Element {
  constructor(
    readonly type: string | typeof Fragment | ComponentClass,
    readonly props: Record<string, unknown>,
  ) {}
}

/** Anything that can appear between tags or be returned from `template()`. */
export type Child =
  | Element
  | RawHtml
  | Scoped
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | readonly Child[]

/** HTML inserted as is, without escaping. Create it with `raw()`. */
export class RawHtml {
  constructor(readonly html: string) {}
}

/**
 * Insert trusted HTML without escaping: your own Markdown output, JSON-LD,
 * inline SVG files. Never use it with anything a visitor typed.
 *
 *   <article>{raw(markdownToHtml(notes))}</article>
 */
export function raw(html: string): RawHtml {
  return new RawHtml(html)
}

/**
 * Children remember where they were written. When a component renders
 * `this.props.children` (or a `<Slot>`), any `<Slot>` inside those children
 * still refers to the component that wrote them, not the one showing them.
 */
export class Scoped {
  constructor(
    readonly children: Child,
    readonly scope: Scope,
  ) {}
}

/** The children of the component whose template is being rendered. */
export interface Scope {
  children: Scoped | undefined
}
