/**
 * The scenarios of mount.browser.test.ts, bundled and run inside each
 * browser. Each one builds something, acts on it, and returns plain data.
 */
import * as connector from '../../shared/connector/index'
import {
  computed,
  flush,
  signal,
  SignalArray,
} from '../../shared/connector/index'
import {
  Component,
  css,
  For,
  raw,
  Slot,
  Swap,
  type Child,
} from '../../shared/omino/index'
import type { ComponentRun } from '../../shared/omino/component'
import { mount } from './index'

const reactivity = connector

function host(): HTMLElement {
  const el = document.createElement('div')
  document.body.append(el)
  return el
}

function run(tree: Child, el = host()) {
  const controller = new AbortController()
  mount(tree, el, { signal: controller.signal, reactivity })
  return { el, controller }
}

export function elementsAndText() {
  const { el } = run(
    <p class="note" data-n={3} hidden={false}>
      hi <b>there</b> {0}
    </p>,
  )
  return bare(el)
}

/** The HTML without the markers that mount and regions place. */
function bare(el: Element): string {
  return el.innerHTML.replace(/<!---->/g, '')
}

export function textHole() {
  const n = signal(1)
  const { el } = run(<p>{n}</p>)
  const text = el.querySelector('p')!.firstChild
  const first = el.textContent
  n.set(2)
  const before = el.textContent
  flush()
  return {
    first,
    before,
    after: el.textContent,
    sameNode: el.querySelector('p')!.firstChild === text,
  }
}

export function functionHole() {
  const n = signal(2)
  const { el } = run(<p>{() => n.get() * 10}</p>)
  n.set(3)
  flush()
  return el.textContent
}

export function attributeHoles() {
  const title = signal<string | null>('a')
  const on = signal(true)
  const size = signal('10px')
  const { el } = run(
    <div
      title={title}
      class={{ base: true, active: on }}
      style={{ 'font-size': size, '--accent': 'red' }}
    />,
  )
  const div = el.firstElementChild as HTMLElement
  const first = div.outerHTML
  title.set(null)
  on.set(false)
  size.set(null as any)
  flush()
  return { first, after: div.outerHTML }
}

export function liveValue() {
  const value = signal('start')
  const done = signal(false)
  const { el } = run(
    <>
      <input value={value} />
      <input type="checkbox" checked={done} />
    </>,
  )
  const [text, box] = el.querySelectorAll('input')
  text!.value = 'typed by a person'
  value.set('from the signal')
  done.set(true)
  flush()
  return {
    value: text!.value,
    checked: box!.checked,
    attribute: text!.getAttribute('value'),
  }
}

export function propPrefix() {
  const items = signal([1, 2])
  const { el } = run(<book-list prop:items={items} />)
  const list = el.firstElementChild as any
  const first = list.items
  items.set([3])
  flush()
  return { first, after: list.items, attribute: list.hasAttribute('items') }
}

export function regionSwap() {
  const bold = signal(true)
  const { el } = run(<p>{() => (bold.get() ? <b>B</b> : <i>I</i>)}</p>)
  const first = el.querySelector('p')!.innerHTML
  bold.set(false)
  flush()
  return { first, after: el.querySelector('p')!.innerHTML }
}

export function presence() {
  const open = signal<number>(1)
  const { el } = run(
    <div>
      <span if={open}>here</span>
    </div>,
  )
  const span = el.querySelector('span')
  open.set(2)
  flush()
  const kept = el.querySelector('span') === span
  open.set(0)
  flush()
  const gone = el.querySelector('span') === null
  open.set(1)
  flush()
  return {
    kept,
    gone,
    back:
      el.querySelector('span') !== null && el.querySelector('span') !== span,
  }
}

export function components() {
  const log: string[] = []
  const name = signal('Ada')
  class Badge extends Component<{ label: Child }> {
    template(_: object, { signal }: ComponentRun) {
      log.push('badge template')
      signal.addEventListener('abort', () => log.push('badge ended'))
      return <em>{this.props.label}</em>
    }
    mounted() {
      log.push(
        `badge mounted ${document.body.contains(document.querySelector('em'))}`,
      )
    }
  }
  class Card extends Component<{ title: Child }> {
    template() {
      log.push('card template')
      return (
        <section>
          <h2>{this.props.title}</h2>
          <Slot name="footer" />
          {this.props.children}
        </section>
      )
    }
    mounted() {
      log.push('card mounted')
    }
  }
  const show = signal(true)
  const { el } = run(
    <div>
      {() =>
        show.get() ? (
          <Card title={name}>
            <Badge label="new" />
            <small slot="footer">foot</small>
          </Card>
        ) : null
      }
    </div>,
  )
  const html = bare(el)
  name.set('Grace')
  flush()
  const title = el.querySelector('h2')!.textContent
  show.set(false)
  flush()
  return { html, title, log }
}

export function refs() {
  const seen: string[] = []
  const { controller } = run(
    <input
      ref={(el: HTMLInputElement, { signal }: { signal: AbortSignal }) => {
        seen.push(`${el.localName} ${el.isConnected}`)
        signal.addEventListener('abort', () => seen.push('ref ended'))
      }}
    />,
  )
  controller.abort()
  return seen
}

export function listeners() {
  let clicks = 0
  const { el, controller } = run(<button onclick={() => clicks++}>go</button>)
  const button = el.querySelector('button')!
  button.click()
  controller.abort()
  button.click()
  const wheel: boolean[] = []
  run(
    <div
      onwheel={{
        handleEvent: (e: Event) => wheel.push(e.defaultPrevented),
        passive: true,
      }}
    />,
  )
  return { clicks, removed: el.innerHTML === '' }
}

export function errors() {
  const caught: string[] = []
  const tryIt = (tree: () => Child) => {
    try {
      run(tree())
    } catch (e) {
      caught.push((e as Error).message)
    }
  }
  tryIt(() => <button onClick={() => {}} />)
  tryIt(() => <button onclick="alert(1)" />)
  tryIt(() => <a href="javascript:alert(1)" />)
  tryIt(() => <div style={{ fontSize: '1px' }} />)
  tryIt(() => <script>alert(1)</script>)
  class Waits extends Component {
    async template() {
      return <p />
    }
  }
  tryIt(() => <Waits />)
  return caught
}

export function svgAndRaw() {
  const width = signal(10)
  const { el } = run(
    <div>
      <svg viewBox="0 0 10 10">
        <rect width={width} height="5" />
        <foreignObject>
          <p>html again</p>
        </foreignObject>
      </svg>
      {raw('<i>trusted</i>')}
    </div>,
  )
  width.set(20)
  flush()
  const rect = el.querySelector('rect')!
  return {
    svg: el.querySelector('svg')!.namespaceURI,
    rect: rect.namespaceURI,
    width: rect.getAttribute('width'),
    p: el.querySelector('p')!.namespaceURI,
    raw: el.querySelector('i')!.textContent,
  }
}

export function context() {
  class Lang extends Component {
    template(ctx: { lang?: string }) {
      return <span>{ctx.lang}</span>
    }
  }
  const el = host()
  mount(<Lang />, el, {
    signal: new AbortController().signal,
    reactivity,
    context: { lang: 'es' } as object,
  })
  return el.textContent
}

export function abortEnds() {
  const log: string[] = []
  class Leaf extends Component {
    template(_: object, { signal }: ComponentRun) {
      signal.addEventListener('abort', () => log.push('ended'))
      return <p>leaf</p>
    }
  }
  const total = computed(() => 1)
  const { el, controller } = run(<Leaf />)
  controller.abort()
  return { log, empty: el.childNodes.length === 0, total: total.get() }
}

type Book = { id: number; title: string }

function bookList(books: ReturnType<typeof signal<Book[]>>, made: number[]) {
  return run(
    <ul>
      <For each={books} key={(book) => book.id}>
        {(book, index) => {
          made.push(book.get().id)
          return <li>{() => `${index.get()}:${book.get().title}`}</li>
        }}
      </For>
    </ul>,
  )
}

export function forRows() {
  const made: number[] = []
  const books = signal<Book[]>([
    { id: 1, title: 'Dune' },
    { id: 2, title: 'Emma' },
  ])
  const { el } = bookList(books, made)
  const first = el.querySelector('li')
  books.set([...books.peek(), { id: 3, title: 'Kim' }])
  flush()
  const kept = el.querySelector('li') === first
  books.set([{ id: 1, title: 'Dune II' }, ...books.peek().slice(1)])
  flush()
  return { text: texts(el), made, kept, same: el.querySelector('li') === first }
}

export function forReorder() {
  const made: number[] = []
  const books = signal<Book[]>(
    [1, 2, 3, 4].map((id) => ({ id, title: `b${id}` })),
  )
  const { el } = bookList(books, made)
  const [a, b, c, d] = el.querySelectorAll('li')
  const removed: Node[] = []
  const watcher = new MutationObserver((records) =>
    records.forEach((r) => removed.push(...r.removedNodes)),
  )
  watcher.observe(el.querySelector('ul')!, { childList: true })
  const [w, x, y, z] = books.peek()
  books.set([z!, w!, x!, y!])
  flush()
  watcher.takeRecords().forEach((r) => removed.push(...r.removedNodes))
  watcher.disconnect()
  const now = [...el.querySelectorAll('li')]
  return {
    text: texts(el),
    sameNodes: now[0] === d && now[1] === a && now[2] === b && now[3] === c,
    moved: removed.filter((n) => n.nodeName === 'LI').length,
    made,
  }
}

export function forLeave() {
  const ended: number[] = []
  const books = signal<Book[]>([
    { id: 1, title: 'a' },
    { id: 2, title: 'b' },
  ])
  class Row extends Component<{ id: number }> {
    template(_: object, { signal }: ComponentRun) {
      signal.addEventListener('abort', () => ended.push(this.props.id))
      return <li>{this.props.id}</li>
    }
  }
  const { el } = run(
    <ul>
      <For each={books} key={(book) => book.id}>
        {(book) => <Row id={book.get().id} />}
      </For>
    </ul>,
  )
  books.set([books.peek()[1]!])
  flush()
  return { ended, text: texts(el) }
}

export function forSignalArray() {
  const log = new SignalArray(['saved'])
  const { el } = run(
    <ol>
      <For each={log}>{(line) => <li>{line}</li>}</For>
    </ol>,
  )
  log.push('sent')
  flush()
  log.shift()
  flush()
  return texts(el)
}

export function forByPosition() {
  const made: string[] = []
  const words = signal(['a', 'b'])
  const { el } = run(
    <p>
      <For each={words} key={(_, i) => i}>
        {(word) => {
          made.push(word.get())
          return <b>{word}</b>
        }}
      </For>
    </p>,
  )
  words.set(['b', 'a'])
  flush()
  return { text: texts(el, 'b'), made }
}

export function forDuplicate() {
  const reported: string[] = []
  const listen = (e: ErrorEvent) => reported.push(e.error?.message)
  window.addEventListener('error', listen)
  run(
    <ul>
      <For each={[1, 1]}>{() => <li />}</For>
    </ul>,
  )
  window.removeEventListener('error', listen)
  return reported.join(' ')
}

function texts(el: Element, tag = 'li'): string[] {
  return [...el.querySelectorAll(tag)].map((n) => n.textContent ?? '')
}

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms))

/** One stylesheet for the motion scenarios: exits and entries of 80 ms. */
function motionStyles(): void {
  if (document.getElementById('motions')) return
  const style = document.createElement('style')
  style.id = 'motions'
  style.textContent = `
    @keyframes fade { from { opacity: 1 } to { opacity: 0 } }
    @keyframes spin { to { rotate: 1turn } }
    .anim[data-exiting], .anim[data-entering] { animation: fade 80ms linear }
    .forever[data-exiting] { animation: spin 1s linear infinite }
  `
  document.head.append(style)
}

export async function exitWithCss() {
  motionStyles()
  const open = signal(true)
  const { el } = run(
    <div>
      <p class="anim" if={open}>
        <input />
      </p>
    </div>,
  )
  el.querySelector('input')!.focus()
  open.set(false)
  flush()
  const p = el.querySelector('p') as HTMLElement | null
  const during = {
    present: p !== null,
    marked: p?.hasAttribute('data-exiting'),
    inert: p?.inert,
    focusOut: document.activeElement === document.body,
  }
  await wait(250)
  return { during, after: el.querySelector('p') === null }
}

function swapScenario(order?: 'out-in' | 'in-out' | 'together') {
  motionStyles()
  const view = signal<'a' | 'b' | 'c'>('a')
  const pick = () => <p class={`anim ${view.get()}`}>{view.get()}</p>
  const tree = order ? <Swap order={order}>{pick}</Swap> : pick
  const { el } = run(<div>{tree}</div>)
  const shown = () =>
    [...el.querySelectorAll('p')].map((p) => p.textContent).join('')
  return { view, shown }
}

export async function swapOutIn() {
  const { view, shown } = swapScenario()
  view.set('b')
  flush()
  const during = shown()
  await wait(60)
  view.set('c')
  flush()
  await wait(300)
  return { during, after: shown() }
}

export async function swapTogether() {
  const { view, shown } = swapScenario('together')
  view.set('b')
  flush()
  const during = shown()
  await wait(300)
  return { during, after: shown() }
}

export async function swapInOut() {
  const { view, shown } = swapScenario('in-out')
  view.set('b')
  flush()
  const during = shown()
  await wait(300)
  return { during, after: shown() }
}

export async function exitFunction() {
  const seen: unknown[] = []
  const open = signal(true)
  const { el } = run(
    <div>
      <p
        if={open}
        exit={(
          node: Element,
          {
            signal,
            reducedMotion,
          }: { signal: AbortSignal; reducedMotion: boolean },
        ) => {
          seen.push(node.localName, signal.aborted, typeof reducedMotion)
          return wait(60)
        }}
      />
    </div>,
  )
  open.set(false)
  flush()
  const during = el.querySelector('p') !== null
  await wait(150)
  return { seen, during, after: el.querySelector('p') === null }
}

export async function exitTimeout() {
  motionStyles()
  const open = signal(true)
  const { el } = run(
    <div>
      <p class="forever" if={open} exit-timeout={60} />
    </div>,
  )
  open.set(false)
  flush()
  await wait(30)
  const during = el.querySelector('p') !== null
  await wait(150)
  return { during, after: el.querySelector('p') === null }
}

export async function rowsComeAndGo() {
  motionStyles()
  const items = signal([1, 2])
  const { el } = run(
    <ul>
      <For each={items}>{(n) => <li class="anim">{n}</li>}</For>
    </ul>,
  )
  items.set([2, 3])
  flush()
  const lis = [...el.querySelectorAll('li')]
  const during = lis.map(
    (li) =>
      `${li.textContent}${li.hasAttribute('data-exiting') ? '-' : ''}${li.hasAttribute('data-entering') ? '+' : ''}`,
  )
  await wait(250)
  const after = [...el.querySelectorAll('li')].map(
    (li) => `${li.textContent}${li.hasAttribute('data-entering') ? '+' : ''}`,
  )
  return { during, after }
}

/** Rows that slide (E.2) and leave by a CSS transition, 300 ms each. */
function slidingRows(start: number[]) {
  if (!document.getElementById('slides')) {
    const style = document.createElement('style')
    style.id = 'slides'
    style.textContent = `
      .slide { transition: opacity 300ms linear }
      .slide[data-exiting] { opacity: 0 }
      .slide[data-moving] { transition: translate 300ms linear }
    `
    document.head.append(style)
  }
  const items = signal(start)
  const { el } = run(
    <ul>
      <For each={items} move>
        {(n) => <li class="slide">{n}</li>}
      </For>
    </ul>,
  )
  return { items, el }
}

/** Review: a second reorder during a slide; the first slide's cancelled end must not unmark the second. */
export async function moveDuringMove() {
  const { items, el } = slidingRows([1, 2, 3])
  items.set([3, 1, 2])
  flush()
  await wait(50)
  items.set([2, 3, 1])
  flush()
  await wait(50)
  return [...el.querySelectorAll('li')].map(
    (li) => li.hasAttribute('data-moving') && li.getAnimations().length > 0,
  )
}

/** Review: a row leaving while the others slide keeps its exit transition. */
export async function leaveDuringMove() {
  const { items, el } = slidingRows([1, 2, 3])
  items.set([3, 1])
  flush()
  await wait(50)
  return texts(el)
}

/** What a person typing does: change the value, then the browser's event. */
function type(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  init: InputEventInit = {},
) {
  el.value = value
  el.dispatchEvent(new InputEvent('input', { bubbles: true, ...init }))
}

function change(el: Element) {
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

export function bindText() {
  const name = signal('Ada')
  const { el } = run(<input bind:value={name} />)
  const input = el.querySelector('input')!
  const first = input.value
  type(input, 'Grace')
  const fromDom = name.get()
  input.setSelectionRange(2, 2)
  name.set('Grace')
  flush()
  const caretKept = input.selectionStart === 2
  name.set('Lin')
  flush()
  return { first, fromDom, caretKept, toDom: input.value }
}

export function bindOnChange() {
  const name = signal('')
  const { el } = run(<input bind:value={name} bind-on="change" />)
  const input = el.querySelector('input')!
  type(input, 'typing')
  const afterInput = name.get()
  change(input)
  return { afterInput, afterChange: name.get() }
}

export function bindIme() {
  const text = signal('')
  const { el } = run(<textarea bind:value={text} />)
  const area = el.querySelector('textarea')!
  type(area, 'ni', { isComposing: true })
  const composing = text.get()
  area.value = '你'
  area.dispatchEvent(new CompositionEvent('compositionend', { data: '你' }))
  return { composing, ended: text.get() }
}

export function bindNumberAndDate() {
  const n = signal<number | null>(3)
  const day = signal<string | null>(null)
  const { el } = run(
    <>
      <input type="number" bind:value={n} />
      <input type="date" bind:value={day} />
    </>,
  )
  const [number, date] = el.querySelectorAll('input')
  const first = number!.value
  type(number!, '')
  const empty = n.get()
  type(number!, '12.5')
  const typed = n.get()
  n.set(null)
  flush()
  type(date!, '2026-10-29')
  const dayTyped = day.get()
  type(date!, '')
  return {
    first,
    empty,
    typed,
    cleared: number!.value,
    dayTyped,
    dayEmpty: day.get(),
  }
}

export function bindControls() {
  const agree = signal(false)
  const size = signal('m')
  const tags = signal<string[]>(['a'])
  const pick = signal('2')
  const many = signal<string[]>(['y'])
  const { el } = run(
    <form>
      <input type="checkbox" class="agree" bind:checked={agree} />
      {['s', 'm', 'l'].map((v) => (
        <input type="radio" name="size" value={v} bind:group={size} />
      ))}
      {['a', 'b'].map((v) => (
        <input type="checkbox" class="tag" value={v} bind:group={tags} />
      ))}
      <select class="one" bind:value={pick}>
        <option value="1">1</option>
        <option value="2">2</option>
      </select>
      <select class="many" multiple bind:value={many}>
        <option value="x">x</option>
        <option value="y">y</option>
      </select>
    </form>,
  )
  const q = <T extends Element>(s: string) =>
    el.querySelector(s) as unknown as T
  const radios = [...el.querySelectorAll<HTMLInputElement>('[name=size]')]
  const firstRadio = radios.map((r) => r.checked)
  const firstSelect = q<HTMLSelectElement>('.one').value
  q<HTMLInputElement>('.agree').checked = true
  change(q('.agree'))
  radios[2]!.checked = true
  change(radios[2]!)
  const b = el.querySelectorAll<HTMLInputElement>('.tag')[1]!
  b.checked = true
  change(b)
  q<HTMLSelectElement>('.one').value = '1'
  change(q('.one'))
  q<HTMLSelectElement>('.many').options[0]!.selected = true
  change(q('.many'))
  return {
    firstRadio,
    firstSelect,
    agree: agree.get(),
    size: size.get(),
    tags: tags.get(),
    pick: pick.get(),
    many: many.get(),
  }
}

export function bindFilesAndEditable() {
  const files = signal<FileList | null>(null)
  const text = signal('hi')
  const { el } = run(
    <>
      <input type="file" bind:files={files} />
      <div contenteditable="true" bind:textContent={text} />
    </>,
  )
  const input = el.querySelector('input')!
  const dt = new DataTransfer()
  dt.items.add(new File(['x'], 'a.txt'))
  input.files = dt.files
  change(input)
  const div = el.querySelector('div')!
  const first = div.textContent
  div.textContent = 'typed'
  div.dispatchEvent(new InputEvent('input', { bubbles: true }))
  return { file: files.get()?.[0]?.name, first, text: text.get() }
}

export function bindTransform() {
  const name = signal('ada')
  const upper = {
    get: () => name.get().toUpperCase(),
    set: (v: unknown) => name.set(String(v).toLowerCase()),
  }
  const { el } = run(<input bind:value={upper} />)
  const input = el.querySelector('input')!
  const first = input.value
  type(input, 'GRACE')
  return { first, stored: name.get() }
}

export async function bindDetailsAndVolume() {
  const open = signal(false)
  const volume = signal(1)
  const { el } = run(
    <>
      <details bind:open={open}>
        <summary>s</summary>
      </details>
      <audio bind:volume={volume} />
    </>,
  )
  const details = el.querySelector('details')!
  details.open = true
  await wait(50)
  const audio = el.querySelector('audio')!
  volume.set(0.3)
  flush()
  const toDom = audio.volume
  audio.volume = 0.7
  await wait(50)
  return {
    open: open.get(),
    toDom: Math.round(toDom * 10) / 10,
    fromDom: Math.round(volume.get() * 10) / 10,
  }
}

/**
 * A page renders (and resize observers report) on animation frames. Headless
 * WebKit only renders when one is asked for, so the test asks.
 */
async function frames(n: number): Promise<void> {
  for (let i = 0; i < n; i++) await new Promise(requestAnimationFrame)
}

export async function bindSize() {
  const width = signal(0)
  const { el } = run(<div style="width: 120px" bind:clientWidth={width} />)
  await frames(5)
  const first = width.get()
  ;(el.firstElementChild as HTMLElement).style.width = '80px'
  await frames(5)
  return { first, after: width.get() }
}

export function bindErrors() {
  const caught: string[] = []
  const tryIt = (tree: () => Child) => {
    try {
      run(tree())
    } catch (e) {
      caught.push((e as Error).message)
    }
  }
  tryIt(() => <input bind:checked={signal(false)} />)
  tryIt(() => <input bind:value="plain" />)
  tryIt(() => (
    <input type="checkbox" bind:checked={signal(false)} bind-on="input" />
  ))
  return caught
}

class Tile extends Component {
  static styles = css`
    p {
      color: rgb(255, 0, 0);
    }
    :scope {
      padding: 3px;
    }
  `
  template(): Child {
    return (
      <article>
        <p class="tile">tile</p>
        {this.props.children}
      </article>
    )
  }
}

class Inner extends Component {
  static styles = 'em { font-style: normal }'
  template(): Child {
    return (
      <div>
        <p class="inner">inner</p>
      </div>
    )
  }
}

class Shadowed extends Component {
  static styles = 'p { color: rgb(0, 0, 255) }'
  static encapsulation = 'shadow' as const
  template(): Child {
    return (
      <x-shadowed>
        <p>in the shadow</p>
      </x-shadowed>
    )
  }
}

export function scopedStyles() {
  const { el } = run(
    <div>
      <p class="outside">outside</p>
      <Tile>
        <Inner />
      </Tile>
      <Tile />
    </div>,
  )
  const color = (s: string) => getComputedStyle(el.querySelector(s)!).color
  return {
    tile: color('.tile'),
    outside: color('.outside'),
    inner: color('.inner'),
    root: getComputedStyle(el.querySelector('article')!).paddingTop,
    sheets: document.querySelectorAll('style[data-scope-for="Tile"]').length,
    marked: el.querySelector('article')!.getAttribute('data-scope'),
  }
}

export function shadowStyles() {
  const { el } = run(
    <div>
      <Shadowed />
      <Shadowed />
      <p class="light">light</p>
    </div>,
  )
  const [a, b] = el.querySelectorAll('x-shadowed')
  const p = a!.shadowRoot!.querySelector('p')!
  return {
    inShadow: p.textContent,
    color: getComputedStyle(p).color,
    light: getComputedStyle(el.querySelector('.light')!).color,
    shared:
      a!.shadowRoot!.adoptedStyleSheets[0] ===
      b!.shadowRoot!.adoptedStyleSheets[0],
    headSheet:
      document.querySelector('style[data-scope-for="Shadowed"]') !== null,
  }
}

/** Review: `ONCLICK` is an event name too, so the lowercase rule refuses it (no inline JS written). */
export function uppercaseEvent() {
  const el = host()
  const controller = new AbortController()
  try {
    mount(<p {...{ ONCLICK: 'window.__x=1' }}>x</p>, el, {
      signal: controller.signal,
      reactivity,
    })
    return {
      threw: false,
      attribute: el.querySelector('p')!.getAttribute('onclick'),
    }
  } catch (error) {
    return { threw: true, message: (error as Error).message }
  } finally {
    controller.abort()
  }
}

/** Review: a number binding compares numbers, so "1.0" stays as typed. */
export async function numberSpelling() {
  const n = signal<number | null>(null)
  const el = host()
  const controller = new AbortController()
  mount(<input type="number" bind:value={n} />, el, {
    signal: controller.signal,
    reactivity,
  })
  const input = el.querySelector('input')!
  input.value = '1.0'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  flush()
  await new Promise((done) => setTimeout(done, 0))
  const typed = { signal: n.get(), shown: input.value }
  ;(n as unknown as { set(v: unknown): void }).set('')
  flush()
  await new Promise((done) => setTimeout(done, 0))
  const result = { ...typed, emptied: input.value }
  controller.abort()
  return result
}

/** Review: `bind:open` true at mount waits until the dialog is in the document. */
export async function dialogOpenAtMount() {
  const open = signal(true)
  const el = host()
  const controller = new AbortController()
  const errors: string[] = []
  const onError = (e: ErrorEvent) => (
    errors.push(e.message),
    e.preventDefault()
  )
  window.addEventListener('error', onError)
  mount(<dialog bind:open={open}>hi</dialog>, el, {
    signal: controller.signal,
    reactivity,
  })
  await new Promise((done) => setTimeout(done, 0))
  window.removeEventListener('error', onError)
  const dialog = el.querySelector('dialog')!
  const result = { open: dialog.open, modal: dialog.matches(':modal'), errors }
  controller.abort()
  return result
}

/** Review: `exit-timeout` that isn't a number is an error, not a zero wait. */
export function exitTimeoutText() {
  const el = host()
  const controller = new AbortController()
  try {
    mount(<p exit-timeout={'2s' as unknown as number} />, el, {
      signal: controller.signal,
      reactivity,
    })
    return 'no error'
  } catch (error) {
    return (error as Error).message
  } finally {
    controller.abort()
  }
}

/** Review round 2: an `exit-timeout` not given is fine; a dialog built and never inserted never hangs. */
export async function motionsAndDialogEdges() {
  const el = host()
  const controller = new AbortController()
  const open = signal(true)
  const cond = false
  mount(
    <section>
      <p exit-timeout={cond ? 300 : undefined} />
      <dialog bind:open={open}>never shown</dialog>
    </section>,
    el,
    { signal: controller.signal, reactivity },
  )
  controller.abort() // content removed at once; the deferred dialog write must not run or loop
  await new Promise((done) => setTimeout(done, 20))
  return { left: el.childNodes.length, stillHere: true }
}

/** Review: mounting with a signal already aborted leaves nothing behind. */
export function mountAlreadyAborted() {
  const el = host()
  const controller = new AbortController()
  controller.abort()
  mount(<p>gone</p>, el, { signal: controller.signal, reactivity })
  return el.childNodes.length
}

/** Round 4: a class array with an object inside stays live; a function inside counts. */
export async function classArrayLive() {
  const active = signal(false)
  const size = signal('s')
  const el = host()
  const controller = new AbortController()
  mount(
    <button class={['btn', { active }, () => `size-${size.get()}`]}>x</button>,
    el,
    {
      signal: controller.signal,
      reactivity,
    },
  )
  const before = el.querySelector('button')!.className
  active.set(true)
  size.set('l')
  flush()
  await new Promise((done) => setTimeout(done, 0))
  const after = el.querySelector('button')!.className
  controller.abort()
  return { before, after }
}

/** Round 4: radios bound to a number group; a select whose options arrive after its value. */
export async function groupAndSelect() {
  const choice = signal<number>(1)
  const platform = signal('md')
  const options = signal<string[]>([])
  const el = host()
  const controller = new AbortController()
  mount(
    <form>
      <input type="radio" name="n" value={1} bind:group={choice} />
      <input type="radio" name="n" value={2} bind:group={choice} />
      <select bind:value={platform}>
        <For each={options}>{(o) => <option value={o}>{o}</option>}</For>
      </select>
    </form>,
    el,
    { signal: controller.signal, reactivity },
  )
  const radios = [...el.querySelectorAll<HTMLInputElement>('input')].map(
    (r) => r.checked,
  )
  options.set(['snes', 'md', 'pce'])
  flush()
  await new Promise((done) => setTimeout(done, 20))
  const selected = el.querySelector('select')!.value
  controller.abort()
  return { radios, selected }
}

/** Round 4: a region whose next view throws keeps the old one; the second attempt works. */
export async function regionKeepsOld() {
  const view = signal<'a' | 'boom' | 'b'>('a')
  const el = host()
  const controller = new AbortController()
  const errors: string[] = []
  const page = () => {
    const v = view.get()
    if (v === 'boom') throw new Error('template boom')
    return <p>{v}</p>
  }
  mount(<section>{page}</section>, el, {
    signal: controller.signal,
    reactivity,
  })
  view.set('boom')
  try {
    flush()
  } catch (error) {
    errors.push((error as Error).message)
  }
  await new Promise((done) => setTimeout(done, 0))
  const during = el.textContent
  view.set('b')
  flush()
  await new Promise((done) => setTimeout(done, 0))
  const after = el.textContent
  controller.abort()
  return { during, after, threw: errors.length > 0 }
}
