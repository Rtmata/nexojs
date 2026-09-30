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
import type { Child, Element as OminoElement } from './element'
import { Fragment } from './element'
import type { ClassValue } from './html'

export { Fragment }

export function jsx(
  type: OminoElement['type'],
  props: Record<string, unknown>,
): OminoElement {
  return { type, props }
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
  [attribute: string]: unknown
}

export declare namespace JSX {
  type Element = OminoElement
  interface ElementClass {
    template(): Child | Promise<Child>
  }
  interface ElementAttributesProperty {
    props: {}
  }
  interface ElementChildrenAttribute {
    children: {}
  }
  /** Accepted by every component, on top of its own props. */
  interface IntrinsicAttributes {
    if?: unknown
    slot?: string
    key?: string | number
  }
  interface IntrinsicElements {
    [tag: string]: HtmlAttributes
  }
}
