/**
 * The JSX runtime. TypeScript and Bun turn `<h1 class="x">Hi</h1>` into
 * `jsx('h1', { class: 'x', children: 'Hi' })` and import these functions from
 * here because the app's tsconfig says so:
 *
 *   "jsx": "react-jsx",
 *   "jsxImportSource": "@nexoamigos/nexo/omino"
 *
 * That is the whole transformation: `jsx()` only records what was written.
 * Turning it into HTML happens later, in `render()`.
 */
import type { ComponentClass } from './component'
import { Element as OminoElement, Fragment, type Child } from './element'
import type { ClassValue } from './html'

export { Fragment }

export function jsx(
  type: OminoElement['type'],
  props: Record<string, unknown>,
  key?: unknown,
): OminoElement {
  if (key !== undefined) {
    throw new Error(
      'omino: `key` does nothing here (nothing is diffed), so it is not accepted',
    )
  }
  return new OminoElement(type, props)
}

/** Same as `jsx`; the compiler uses it when there are several static children. */
export const jsxs = jsx

/** Attributes accepted by every HTML element. */
export interface HtmlAttributes {
  class?: ClassValue
  children?: Child
  /** Render the element only when this is truthy. */
  if?: unknown
  /** Which `<Slot name>` of the parent component this goes into. */
  slot?: string
  /** Not accepted: omino never diffs, so a key would do nothing. */
  key?: never
  [attribute: string]: unknown
}

export declare namespace JSX {
  type Element = OminoElement
  /** What can be used as a tag: an HTML tag name or a component class. */
  type ElementType = string | typeof Fragment | ComponentClass
  interface ElementClass {
    template(): Child | Promise<Child>
  }
  interface ElementAttributesProperty {
    props: {}
  }
  interface ElementChildrenAttribute {
    children: {}
  }
  /**
   * Accepted by every component, on top of its own props. There is no `key`:
   * omino renders once and never diffs, so it would do nothing.
   */
  interface IntrinsicAttributes {
    if?: unknown
    slot?: string
  }
  interface IntrinsicElements {
    [tag: string]: HtmlAttributes
  }
}
