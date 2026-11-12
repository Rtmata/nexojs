import { defined, insideOf, type Panel } from './panel'
import { attributeOf, type Param, type ParamsOf } from './params'
import { PANEL_ATTRIBUTE } from './vocabulary'

type AnyPanel = Panel<any, any>

/** A panel's params, from its schema. */
export type PanelParams<P> = P extends Panel<infer S, any> ? ParamsOf<S> : never

/** Attributes for an element, as JSX takes them. */
export type Markup = Record<string, string | true>

/**
 * The names markup uses, given once: `attach(root, panels, …)` reads
 * them and `markup` writes them, typed by the key.
 *
 *   const panels = registry({ gallery, tabs })
 *   <section {...panels.markup({ gallery: { start: 2 } })}>
 */
export class PanelRegistry<R extends Record<string, AnyPanel>> {
  constructor(readonly panels: R) {}

  /** The attributes for one panel or several: `markup({ gallery: { start: 2 }, tabs: {} })`. */
  markup(panels: { [K in keyof R]?: Partial<PanelParams<R[K]>> }): Markup {
    const entries = Object.entries(panels as Record<string, object | undefined>)
    const attributes: Markup = {
      [PANEL_ATTRIBUTE]: entries.map(([name]) => name).join(' '),
    }
    for (const [name, given] of entries)
      Object.assign(attributes, this.params(name, given ?? {}))
    return attributes
  }

  /** Each value given, written by its own parser as `data-<name>-<key>`. */
  private params(name: string, values: object): Markup {
    const schema = (insideOf(this.panels[name])?.params ?? {}) as Schema
    const attributes: Markup = {}
    for (const [key, value] of Object.entries(defined(values)))
      write(attributes, attributeOf(name, key), schema[key]?.write(value))
    return attributes
  }
}

type Schema = Record<string, Param<unknown>>

/** `null` (or no parser) leaves it out. */
function write(
  attributes: Markup,
  name: string,
  text: string | true | null | undefined,
) {
  if (text !== null && text !== undefined) attributes[name] = text
}

export function registry<R extends Record<string, AnyPanel>>(
  panels: R,
): PanelRegistry<R> {
  return new PanelRegistry(panels)
}
