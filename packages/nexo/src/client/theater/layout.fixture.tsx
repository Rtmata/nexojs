/** A keyed omino list for the layout browser tests: `window.theater.list(…)`. */
import * as connector from '../../shared/connector/index'
import { For } from '../../shared/omino/index'
import { mount } from '../omino/index'

/**
 * Mounts `<ul>` with one `<li id="n">` per number, moved as `move` says;
 * returns how to set the numbers.
 */
export function list(
  host: Element,
  numbers: number[],
  move: boolean | ((rows: Element[], update: () => void) => unknown),
): (next: number[]) => void {
  const items = connector.signal(numbers)
  const tree = (
    <ul>
      <For each={items} key={(n: number) => n} move={move}>
        {(n) => <li id={`n${n.get()}`}>{n.get()}</li>}
      </For>
    </ul>
  )
  mount(tree, host, {
    signal: new AbortController().signal,
    reactivity: connector,
  })
  return (next) => {
    items.set(next)
    connector.flush()
  }
}
