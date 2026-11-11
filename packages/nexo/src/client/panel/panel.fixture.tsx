/** The scenarios of panel.browser.test.ts, run inside each browser. */
import * as connector from '../../shared/connector/index'
import { mount } from '../omino/index'
import { attach, observe, panel, registry } from './index'
import * as param from './pieces/params'

const log: string[] = []

const gallery = panel({
  params: {
    start: param.number(0),
    loop: param.boolean(),
    shots: param.json<string[]>([]),
  },
  connect: (el, params, { signal }) => {
    log.push(`connect ${params.start} ${params.loop} ${params.shots.length}`)
    el.setAttribute('data-connected', '')
    signal.addEventListener('abort', () => log.push('ended'))
    return { index: params.start, el }
  },
  events: {
    'click .next': (_e, ctx, matched) =>
      log.push(`next ${++ctx.index} ${matched.className}`),
    click: (_e, ctx) => log.push(`click on el ${ctx.index}`),
    'focus input': () => log.push('focus input'),
    'mouseenter .tile': () => log.push('enter tile'),
  },
})

function html(markup: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = markup
  document.body.replaceChildren(host)
  return host
}

export function fromMarkup() {
  log.length = 0
  const host = html(`
    <section data-panel="gallery" data-gallery-start="2" data-gallery-loop data-gallery-shots='["a","b"]'>
      <button class="next"><span>›</span></button>
      <input>
      <div class="tile"></div>
    </section>`)
  const controller = new AbortController()
  attach(host, { gallery }, { signal: controller.signal })
  attach(host, { gallery }, { signal: controller.signal }) // idempotent
  host
    .querySelector('span')!
    .dispatchEvent(new MouseEvent('click', { bubbles: true }))
  host.querySelector('input')!.focus()
  host.querySelector('.tile')!.dispatchEvent(new MouseEvent('mouseenter'))
  controller.abort()
  host
    .querySelector('span')!
    .dispatchEvent(new MouseEvent('click', { bubbles: true }))
  return [...log]
}

export function laterChildren() {
  log.length = 0
  const host = html('<section data-panel="gallery"></section>')
  attach(host, { gallery }, { signal: new AbortController().signal })
  const button = document.createElement('button')
  button.className = 'next'
  host.firstElementChild!.append(button)
  button.click()
  return [...log]
}

/** `attach` reports a panel's error as an uncaught error (naming it) and goes on with the rest. */
export function errors() {
  const caught: string[] = []
  const onError = (e: ErrorEvent) => {
    caught.push(e.error?.message ?? e.message)
    e.preventDefault()
  }
  window.addEventListener('error', onError)
  const root = html(
    '<div data-panel="nope"></div><div data-panel="gallery" data-gallery-start="two"></div><div data-panel="gallery" data-gallery-start="4"></div>',
  )
  attach(root, { gallery }, { signal: new AbortController().signal })
  window.removeEventListener('error', onError)
  return [
    ...caught,
    `connected ${root.querySelectorAll('[data-connected]').length}`,
  ]
}

export function asRef() {
  log.length = 0
  const host = document.createElement('div')
  document.body.replaceChildren(host)
  const controller = new AbortController()
  mount(
    <section ref={gallery.with({ start: 5, shots: ['x'] })}>
      <button class="next" />
    </section>,
    host,
    { signal: controller.signal, reactivity: connector },
  )
  host.querySelector('button')!.click()
  controller.abort()
  return [...log]
}

export async function observing() {
  log.length = 0
  const host = html('<main></main>')
  const controller = new AbortController()
  observe(host, { gallery }, { signal: controller.signal })
  const added = document.createElement('section')
  added.setAttribute('data-panel', 'gallery')
  host.firstElementChild!.append(added)
  await new Promise((done) => setTimeout(done, 20))
  added.remove()
  await new Promise((done) => setTimeout(done, 20))
  controller.abort()
  return [...log]
}

/** What the server writes with markup(), attach reads back the same. */
export function roundTrip() {
  log.length = 0
  const panels = registry({ gallery })
  const attributes = panels.markup('gallery', {
    start: 4,
    loop: true,
    shots: ['a', 'b', 'c'],
  })
  const section = document.createElement('section')
  for (const [name, value] of Object.entries(attributes))
    section.setAttribute(name, value === true ? '' : value)
  document.body.replaceChildren(section)
  attach(document.body, panels, { signal: new AbortController().signal })
  return [...log]
}
