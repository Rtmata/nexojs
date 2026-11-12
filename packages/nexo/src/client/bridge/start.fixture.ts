/**
 * bridge's start on a test page, built by Bun as a classic script: the
 * module is imported, nothing runs until `start`. Each click's fate is
 * kept: taken by bridge (its fetch is cancelled, so the page stays) or left
 * to the browser.
 */
import { arrivals, start, STARTED, visit } from './bridge'

const taken: string[] = []
/** Off for the scenario that lets a fetch really go. */
let cancelFetches = true
document.addEventListener('bridge:fetch', (event) => {
  if (!cancelFetches) return
  event.preventDefault()
  taken.push((event.target as HTMLAnchorElement).getAttribute('href')!)
})

/** A navigation whose response is held by the test; bridge stops before it arrives. */
let hang: AbortController | undefined
const swapped: string[] = []
;(window as any).bridgeHang = {
  begin: () => {
    cancelFetches = false
    hang = new AbortController()
    start({ signal: hang.signal })
    document.addEventListener('bridge:swapped', () => swapped.push('swapped'))
    document.getElementById('hang')!.click()
  },
  stop: () => hang!.abort(),
  swapped: () => [...swapped],
}

/** A click on the link, as a person's: whether bridge took it. */
function click(): boolean {
  const link = document.querySelector('a')!
  const event = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    button: 0,
  })
  const before = taken.length
  link.dispatchEvent(event)
  if (!event.defaultPrevented) return false // left to the browser: nothing would navigate in a test
  return taken.length > before
}

function caught(fn: () => unknown): string {
  try {
    fn()
    return ''
  } catch (error) {
    return (error as Error).message
  }
}

;(window as any).bridgeTest = () => {
  const imported = {
    marked: document.documentElement.hasAttribute(STARTED),
    clicked: click(),
  }
  const early = caught(() => visit('/elsewhere'))
  const earlyArrivals = caught(() => arrivals(() => {}))
  const controller = new AbortController()
  start({ signal: controller.signal })
  const startedState = {
    marked: document.documentElement.hasAttribute(STARTED),
    clicked: click(),
  }
  const twice = caught(() => start({ signal: new AbortController().signal }))
  controller.abort()
  const stopped = {
    marked: document.documentElement.hasAttribute(STARTED),
    clicked: click(),
  }
  const late = caught(() => visit('/elsewhere'))
  return {
    imported,
    early,
    earlyArrivals,
    started: startedState,
    twice,
    stopped,
    late,
  }
}
