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
import { Component, For, raw, Slot, type Child } from '../../shared/omino/index'
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
