import type { ComponentClass } from './component'

/** The type of `<>...</>`: renders only its children. */
export const Fragment = Symbol.for('omino.fragment')

/**
 * What JSX produces: a plain description of an element, not HTML yet.
 * `<h1 class="title">NES</h1>` → { type: 'h1', props: { class: 'title', children: 'NES' } }
 */
export interface Element {
  type: string | typeof Fragment | ComponentClass
  props: Record<string, unknown>
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

export function isElement(value: unknown): value is Element {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    'props' in value
  )
}
