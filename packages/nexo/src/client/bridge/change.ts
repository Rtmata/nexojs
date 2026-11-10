import { ENTERING, settled } from '../settle/settle'
import { announce } from './events'

/** Which way the visitor went: ahead (a link), back, or replacing where they are. */
export type Direction = 'forward' | 'back' | 'replace'

/** What `data-bridge-transition` says (decision 35): snapshots or not, and the types. */
export interface TransitionSays {
  /** `true` on, `false` off, `null` when nothing says (the arriving page may). */
  snapshots: boolean | null
  types: string[]
}

/**
 * Reads `data-bridge-transition` (decision 35): absent says nothing,
 * `"false"` turns snapshots off, anything else turns them on and its words
 * are the types (a bare attribute: no types).
 */
export function transitionSays(value: string | null): TransitionSays {
  if (value === null) return { snapshots: null, types: [] }
  if (value.trim() === 'false') return { snapshots: false, types: [] }
  return { snapshots: true, types: value.split(/\s+/).filter(Boolean) }
}

/**
 * The trigger's word first; if it says nothing, the arriving page's
 * `<html>` (a route declares its own entrance, idea D). Types join.
 */
export function joined(
  trigger: TransitionSays,
  arriving: TransitionSays,
): TransitionSays {
  const snapshots = trigger.snapshots ?? arriving.snapshots ?? false
  const types = [...new Set([...trigger.types, ...arriving.types])]
  return { snapshots, types: snapshots ? types : [] }
}

/** What `bridge:transition` carries (E.4): a plain value, so bridge imports nobody. */
export interface ChangeDetail {
  /** The View Transition, with snapshots; `null` when the change is live. */
  transition: ViewTransition | null
  types: string[]
  direction: Direction
  from: URL
  to: URL
}

const DIRECTION = 'data-bridge-direction'
const TYPES = 'data-bridge-types'

/** The change under way: its marks on `<html>` belong to the latest one. */
let latest: object | null = null

/**
 * One change of view (E.4, the view manager): the current view leaves, the
 * next enters, and while it happens `<html>` says which way and which
 * types — for CSS, in every browser. Live by default (omino's marks on
 * the new elements, C.15c); snapshots when asked (a View Transition, its
 * types where the browser has them).
 */
export class ViewChange {
  private readonly token = {}

  constructor(
    private readonly trigger: Element,
    private readonly says: TransitionSays,
    private readonly detail: Omit<ChangeDetail, 'transition' | 'types'>,
  ) {}

  get snapshots(): boolean {
    return this.says.snapshots === true && 'startViewTransition' in document
  }

  /** The swap, shown the way this change says; the new elements as soon as they are in. */
  async run(swap: () => Element[] | null): Promise<Element[] | null> {
    this.mark()
    if (this.snapshots) return this.withSnapshots(swap)
    this.announce(null) // before the swap: the trigger may leave with the old content
    const elements = swap()
    this.mark() // a whole-page swap copies the new <html>'s attributes over
    void this.enter(elements ?? [])
    return elements
  }

  private async withSnapshots(
    swap: () => Element[] | null,
  ): Promise<Element[] | null> {
    let elements: Element[] | null = null
    const transition = this.start(() => {
      elements = swap()
      this.mark() // a whole-page swap copies the new <html>'s attributes over
    })
    this.announce(transition)
    const unmark = () => this.unmark()
    transition.finished.then(unmark, unmark)
    await transition.updateCallbackDone
    return elements
  }

  /** With its types where the browser takes them (else `<html>` carries them anyway). */
  private start(update: () => void): ViewTransition {
    const typed =
      typeof ViewTransition !== 'undefined' &&
      'types' in ViewTransition.prototype
    if (!typed) return document.startViewTransition(update)
    return document.startViewTransition({ update, types: this.allTypes() })
  }

  /** The new elements are marked until their entry animations end. */
  private async enter(elements: Element[]): Promise<void> {
    for (const el of elements) el.setAttribute(ENTERING, '')
    const animations = elements.flatMap((el) =>
      el.getAnimations({ subtree: true }),
    )
    await settled(animations)
    for (const el of elements) el.removeAttribute(ENTERING)
    this.unmark()
  }

  private announce(transition: ViewTransition | null): void {
    const detail = { ...this.detail, transition, types: this.says.types }
    announce(this.trigger, 'bridge:transition', detail)
  }

  /** The direction and the declared types, as View Transition types. */
  private allTypes(): string[] {
    return [this.detail.direction, ...this.says.types]
  }

  private mark(): void {
    latest = this.token
    const root = document.documentElement
    root.setAttribute(DIRECTION, this.detail.direction)
    root.setAttribute(TYPES, this.says.types.join(' '))
  }

  /** Only the latest change clears the marks: a newer one may be under way. */
  private unmark(): void {
    if (latest !== this.token) return
    document.documentElement.removeAttribute(DIRECTION)
    document.documentElement.removeAttribute(TYPES)
    latest = null
  }
}
