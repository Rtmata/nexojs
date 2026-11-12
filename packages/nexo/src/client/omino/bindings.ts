import type { Holes } from './holes'

/** Where an element lives: its signal, and how to wait until it's in the document. */
export interface Where {
  signal: AbortSignal
  inserted(fn: () => unknown): void
}

/** What `bind:` accepts: a signal, or any `{ get, set }` for a transform. */
export interface WritableLike {
  get(): unknown
  set(value: unknown): void
}

/**
 * One kind of binding: the events that carry the DOM's value to the signal,
 * how to read it, and how to write the signal's value back (absent for the
 * read-only ones). The table below is every control omino binds.
 */
interface Kind {
  events: readonly string[]
  read(el: Element): unknown
  write?(el: Element, value: unknown): void
  /** The first write waits for the element to be in the document (`showModal()` needs that). */
  afterInsertion?: boolean
  /** Options that arrive later (a For over a resource) get the signal's value applied again. */
  watchOptions?: boolean
}

type Picker = (el: Element) => Kind | undefined

const NUMBER_TYPES = new Set(['number', 'range'])
const DATE_TYPES = new Set(['date', 'time', 'month', 'week', 'datetime-local'])

/** `bind:value`: text (on `input`, or `bind-on`), numbers, dates, selects. */
function valueKind(el: Element): Kind | undefined {
  if (el instanceof HTMLSelectElement)
    return el.multiple ? MULTI_SELECT : SELECT
  if (el instanceof HTMLTextAreaElement) return TEXT
  if (!(el instanceof HTMLInputElement)) return undefined
  if (NUMBER_TYPES.has(el.type)) return NUMBER
  if (DATE_TYPES.has(el.type)) return DATE
  return el.type === 'checkbox' || el.type === 'radio' ? undefined : TEXT
}

const TEXT: Kind = {
  events: ['input'],
  read: (el) => (el as HTMLInputElement).value,
  write: (el, v) => setValue(el as HTMLInputElement, String(v ?? '')),
}

/** `valueAsNumber`, the platform's own; empty or invalid (`NaN`) is `null`. */
const NUMBER: Kind = {
  events: ['input'],
  read: (el) => nullIfNaN((el as HTMLInputElement).valueAsNumber),
  write: (el, v) => setNumber(el as HTMLInputElement, v),
}

/** Written only when the number differs: "1.0" stays as typed while it still means 1. */
function setNumber(el: HTMLInputElement, value: unknown): void {
  const wanted = numberOf(value)
  if (nullIfNaN(el.valueAsNumber) === wanted) return
  el.value = wanted === null ? '' : String(wanted)
}

/** A number, or a numeric string; anything else (empty, a boolean, a date) is "no value". */
function numberOf(value: unknown): number | null {
  if (typeof value === 'number') return nullIfNaN(value)
  if (typeof value === 'string' && value.trim()) return nullIfNaN(Number(value))
  return null
}

/** The platform's string as is ("2026-10-29"); empty is `null`. No `Date`: valueAsDate is UTC. */
const DATE: Kind = {
  events: ['input'],
  read: (el) => (el as HTMLInputElement).value || null,
  write: (el, v) => setValue(el as HTMLInputElement, String(v ?? '')),
}

const SELECT: Kind = {
  events: ['change'],
  read: (el) => (el as HTMLSelectElement).value,
  write: (el, v) => ((el as HTMLSelectElement).value = String(v ?? '')),
  watchOptions: true,
}

const MULTI_SELECT: Kind = {
  events: ['change'],
  read: (el) =>
    [...(el as HTMLSelectElement).selectedOptions].map((o) => o.value),
  write: (el, v) =>
    selectAll(el as HTMLSelectElement, (v as string[] | null) ?? []),
  watchOptions: true,
}

const CHECKED: Kind = {
  events: ['change'],
  read: (el) => (el as HTMLInputElement).checked,
  write: (el, v) => ((el as HTMLInputElement).checked = Boolean(v)),
}

const INDETERMINATE: Kind = {
  events: ['change'],
  read: (el) => (el as HTMLInputElement).indeterminate,
  write: (el, v) => ((el as HTMLInputElement).indeterminate = Boolean(v)),
}

const FILES: Kind = {
  events: ['change'],
  read: (el) => (el as HTMLInputElement).files,
}

const OPEN: Kind = {
  events: ['toggle', 'close'],
  read: (el) => (el as HTMLDetailsElement).open,
  write: (el, v) => setOpen(el, Boolean(v)),
  afterInsertion: true,
}

/** contenteditable: text only; no `innerHTML` (XSS). */
function editable(property: 'textContent' | 'innerText'): Kind {
  return {
    events: ['input'],
    read: (el) => (el as HTMLElement)[property],
    write: (el, v) => setText(el as HTMLElement, property, String(v ?? '')),
  }
}

/** Media: two-way where the platform lets you write, read-only elsewhere. */
function media(property: string, events: string[], writable: boolean): Kind {
  const read = (el: Element) => (el as any)[property]
  if (!writable) return { events, read }
  return {
    events,
    read,
    write: (el, v) => writeMedia(el as HTMLMediaElement, property, v),
  }
}

const MEDIA: Record<string, Kind> = {
  currentTime: media('currentTime', ['timeupdate', 'seeked'], true),
  playbackRate: media('playbackRate', ['ratechange'], true),
  paused: media('paused', ['play', 'pause'], true),
  volume: media('volume', ['volumechange'], true),
  muted: media('muted', ['volumechange'], true),
  duration: media('duration', ['durationchange'], false),
  buffered: media('buffered', ['progress'], false),
  seekable: media('seekable', ['progress', 'durationchange'], false),
  seeking: media('seeking', ['seeking', 'seeked'], false),
  ended: media('ended', ['ended', 'play'], false),
  readyState: media(
    'readyState',
    [
      'loadedmetadata',
      'loadeddata',
      'canplay',
      'canplaythrough',
      'emptied',
      'waiting',
    ],
    false,
  ),
  played: media('played', ['timeupdate'], false),
}

const VIDEO_SIZE: Record<string, Kind> = {
  videoWidth: media('videoWidth', ['resize', 'loadedmetadata'], false),
  videoHeight: media('videoHeight', ['resize', 'loadedmetadata'], false),
}

const NATURAL: Record<string, Kind> = {
  naturalWidth: {
    events: ['load'],
    read: (el) => (el as HTMLImageElement).naturalWidth,
  },
  naturalHeight: {
    events: ['load'],
    read: (el) => (el as HTMLImageElement).naturalHeight,
  },
}

/** `bind:group`: grouped by the shared signal, not by component. */
const GROUP_CHECKBOX: Kind = {
  events: ['change'],
  read: (el) => (el as HTMLInputElement).value,
  write: (el, v) =>
    ((el as HTMLInputElement).checked = ((v as unknown[] | null) ?? [])
      .map(String)
      .includes((el as HTMLInputElement).value)),
}

const GROUP_RADIO: Kind = {
  events: ['change'],
  read: (el) => (el as HTMLInputElement).value,
  write: (el, v) =>
    ((el as HTMLInputElement).checked =
      v != null && String(v) === (el as HTMLInputElement).value), // the server compared the JSX value (maybe a number) the same way
}

/** Which kind each `bind:<name>` is on this element; `undefined`: not there. */
const PICKERS: Record<string, Picker> = {
  value: valueKind,
  checked: (el) =>
    isInput(el, 'checkbox') || isInput(el, 'radio') ? CHECKED : undefined,
  indeterminate: (el) => (isInput(el, 'checkbox') ? INDETERMINATE : undefined),
  files: (el) => (isInput(el, 'file') ? FILES : undefined),
  open: (el) =>
    el instanceof HTMLDetailsElement || el instanceof HTMLDialogElement
      ? OPEN
      : undefined,
  textContent: (el) => (isEditable(el) ? editable('textContent') : undefined),
  innerText: (el) => (isEditable(el) ? editable('innerText') : undefined),
  ...pickFrom(MEDIA, (el) => el instanceof HTMLMediaElement),
  ...pickFrom(VIDEO_SIZE, (el) => el instanceof HTMLVideoElement),
  ...pickFrom(NATURAL, (el) => el instanceof HTMLImageElement),
  group: (el) =>
    isInput(el, 'checkbox')
      ? GROUP_CHECKBOX
      : isInput(el, 'radio')
        ? GROUP_RADIO
        : undefined,
}

/** Element sizes: read-only, from one shared `ResizeObserver` per box. */
const SIZES = new Set([
  'clientWidth',
  'clientHeight',
  'offsetWidth',
  'offsetHeight',
  'contentRect',
  'contentBoxSize',
  'borderBoxSize',
  'devicePixelContentBoxSize',
])

/**
 * Two-way binding: `bind:value={signal}`. The DOM's events write the
 * signal; the signal's changes write the DOM, compared with its live value
 * first (Lit's `live()`), so the caret only moves when the value really
 * differs. Typing with an IME writes once the composition ends.
 */
export class Bindings {
  constructor(private readonly holes: Holes) {}

  bind(
    el: Element,
    name: string,
    target: unknown,
    on: string | undefined,
    at: Where,
  ): void {
    const writable = ensureWritable(el, name, target)
    if (SIZES.has(name)) return this.size(el, name, writable, at)
    const kind = PICKERS[name]?.(el)
    if (!kind) throw notBindable(el, name)
    this.listen(el, kind, writable, eventsOf(el, kind, on), at.signal)
    if (kind.write) this.writeBack(el, kind, writable, at)
  }

  /** Signal → DOM: now, or once inserted; and again when a select's options change. */
  private writeBack(
    el: Element,
    kind: Kind,
    writable: WritableLike,
    at: Where,
  ): void {
    const write = () =>
      this.holes.write(writable, (v) => kind.write!(el, v), at.signal)
    if (kind.afterInsertion) at.inserted(write)
    else write()
    if (kind.watchOptions)
      watchOptions(el, () => kind.write!(el, writable.get()), at.signal)
  }

  /** Sizes are layout: observed once the element is in the document. */
  private size(el: Element, name: string, writable: WritableLike, at: Where) {
    at.inserted(() => sizes.observe(el, name, writable, at.signal))
  }

  private listen(
    el: Element,
    kind: Kind,
    writable: WritableLike,
    events: readonly string[],
    signal: AbortSignal,
  ) {
    const update = (event: Event) => {
      if ((event as InputEvent).isComposing) return
      writable.set(this.valueFor(el, kind, writable))
    }
    for (const type of events) el.addEventListener(type, update, { signal })
    if (events.includes('input'))
      el.addEventListener('compositionend', update, { signal })
  }

  /** `bind:group` reads through the signal: the checked one, or the list with this one in or out. */
  private valueFor(el: Element, kind: Kind, writable: WritableLike): unknown {
    return kind === GROUP_CHECKBOX
      ? toggled(writable.get(), el as HTMLInputElement)
      : kind.read(el)
  }
}

/** `bind-on="change"` waits for commit, only where text is typed. */
function eventsOf(
  el: Element,
  kind: Kind,
  on: string | undefined,
): readonly string[] {
  if (on === undefined) return kind.events
  if (kind === TEXT || kind === NUMBER || kind === DATE || isEditable(el))
    return [on]
  throw new Error(
    `omino: <${el.localName} bind-on> only changes when typed text is written; this control always writes on change`,
  )
}

/** Several observers would be one per element: one per box, shared. */
class Sizes {
  private readonly observers = new Map<string, ResizeObserver>()
  private readonly targets = new WeakMap<Element, Map<string, WritableLike>>()

  observe(
    el: Element,
    name: string,
    writable: WritableLike,
    signal: AbortSignal,
  ): void {
    const box = boxOf(name)
    const observer = this.observerFor(box)
    const targets = this.targets.get(el) ?? new Map()
    targets.set(name, writable)
    this.targets.set(el, targets)
    observer.observe(el, { box })
    signal.addEventListener('abort', () => observer.unobserve(el), {
      once: true,
    })
  }

  private observerFor(box: ResizeObserverBoxOptions): ResizeObserver {
    let observer = this.observers.get(box)
    if (!observer)
      this.observers.set(
        box,
        (observer = new ResizeObserver((entries) => this.report(entries))),
      )
    return observer
  }

  private report(entries: ResizeObserverEntry[]): void {
    for (const entry of entries)
      for (const [name, writable] of this.targets.get(entry.target) ?? [])
        writable.set(sizeOf(entry, name))
  }
}

/** One for the whole page, shared by every mount. */
const sizes = new Sizes()

function boxOf(name: string): ResizeObserverBoxOptions {
  if (name === 'borderBoxSize' || name.startsWith('offset')) return 'border-box'
  if (name === 'devicePixelContentBoxSize') return 'device-pixel-content-box'
  return 'content-box'
}

function sizeOf(entry: ResizeObserverEntry, name: string): unknown {
  const el = entry.target as HTMLElement
  if (name in entry) return (entry as any)[name]
  return (el as any)[name]
}

function setValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  text: string,
): void {
  if (el.value !== text) el.value = text
}

function setText(
  el: HTMLElement,
  property: 'textContent' | 'innerText',
  text: string,
): void {
  if (el[property] !== text) el[property] = text
}

function selectAll(el: HTMLSelectElement, values: string[]): void {
  for (const option of el.options)
    option.selected = values.includes(option.value)
}

function setOpen(el: Element, open: boolean): void {
  if (!(el instanceof HTMLDialogElement))
    return void ((el as HTMLDetailsElement).open = open)
  if (open) !el.open && el.showModal()
  else el.close()
}

function writeMedia(
  el: HTMLMediaElement,
  property: string,
  value: unknown,
): void {
  if (property === 'paused')
    return void (value ? el.pause() : el.play().catch(playFailed))
  if ((el as any)[property] !== value) (el as any)[property] = value
}

function toggled(list: unknown, el: HTMLInputElement): string[] {
  const values = ((list as string[] | null) ?? []).filter((v) => v !== el.value)
  return el.checked ? [...values, el.value] : values
}

function nullIfNaN(n: number): number | null {
  return Number.isNaN(n) ? null : n
}

function isInput(el: Element, type: string): boolean {
  return el instanceof HTMLInputElement && el.type === type
}

/** By its attribute: `isContentEditable` needs the element in the document. */
function isEditable(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false
  return (
    el.contentEditable === 'true' || el.contentEditable === 'plaintext-only'
  )
}

function pickFrom(
  kinds: Record<string, Kind>,
  fits: (el: Element) => boolean,
): Record<string, Picker> {
  return Object.fromEntries(
    Object.entries(kinds).map(([name, kind]) => [
      name,
      (el: Element) => (fits(el) ? kind : undefined),
    ]),
  )
}

function ensureWritable(
  el: Element,
  name: string,
  target: unknown,
): WritableLike {
  const t = target as WritableLike | null
  if (typeof t?.get === 'function' && typeof t.set === 'function') return t
  throw new Error(
    `omino: <${el.localName} bind:${name}> takes something with .get() and .set(): a signal, or { get, set }`,
  )
}

function notBindable(el: Element, name: string): Error {
  const what =
    el instanceof HTMLInputElement
      ? `<input type="${el.type}">`
      : `<${el.localName}>`
  return new Error(
    `omino: bind:${name} doesn't work on ${what}. See the control table`,
  )
}

/**
 * Expected rejections of `play()`: interrupted by a pause (AbortError), or
 * autoplay held back until the visitor interacts (NotAllowedError). A
 * source that can't play at all is reported.
 */
function playFailed(error: unknown): void {
  const name = (error as DOMException)?.name
  if (name !== 'AbortError' && name !== 'NotAllowedError') reportError(error)
}

/** A select whose options come and go: the chosen value is applied again when they do. */
function watchOptions(
  el: Element,
  apply: () => void,
  signal: AbortSignal,
): void {
  const observer = new MutationObserver((records) => {
    if (records.some(changesOptions)) apply()
  })
  observer.observe(el, { childList: true, subtree: true })
  signal.addEventListener('abort', () => observer.disconnect(), { once: true })
}

/** An option (or group) added or removed; a label's text changing is not that. */
function changesOptions(record: MutationRecord): boolean {
  const nodes = [...record.addedNodes, ...record.removedNodes]
  return nodes.some(
    (n) => n instanceof HTMLOptionElement || n instanceof HTMLOptGroupElement,
  )
}
