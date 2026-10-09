import { SEGMENT_ATTRIBUTE } from '../bridge/vocabulary'
import { Component } from './component'
import type { Child } from './element'
import { jsx } from './jsx-runtime'

/**
 * A region of the page that bridge can replace on its own. It only writes
 * the attribute bridge looks for; without bridge it is a plain element:
 *
 *   <Segment name="shelf"><ul>…</ul></Segment>
 *   → <div data-bridge-segment="shelf"><ul>…</ul></div>
 *
 * `tag` picks the element (`div` by default); any other attribute goes on
 * it as written: `<Segment name="shelf" tag="section" class="wall" data-bridge-twin>`.
 */
export class Segment extends Component<SegmentProps> {
  static defaults: Partial<SegmentProps> = { tag: 'div' }

  template(): Child {
    const { name, tag, children, ...attributes } = this.props
    return jsx(tag as string, {
      ...attributes,
      [SEGMENT_ATTRIBUTE]: name,
      children,
    })
  }
}

export interface SegmentProps {
  name: string
  tag?: string
  [attribute: string]: unknown
}

/**
 * What `render(page, { only })` keeps: the HTML of the wanted segments, in
 * the order they were asked for. The renderer offers every component it
 * finishes; the picker takes the segments it wants and ignores the rest.
 */
export class SegmentPicker {
  private readonly found = new Map<string, string>()

  constructor(private readonly wanted: readonly string[]) {}

  offer(instance: Component<any>, html: string): void {
    if (!(instance instanceof Segment)) return
    const name = instance.props.name as string
    if (this.wanted.includes(name) && !this.found.has(name))
      this.found.set(name, html)
  }

  /** The wanted segments found, joined; a segment the page lacks adds nothing. */
  html(): string {
    return this.wanted.map((name) => this.found.get(name) ?? '').join('')
  }
}
