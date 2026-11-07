import { panel } from '../panel'
import { json } from '../params'
import { emit } from './hold'

/**
 * A key map (Archive): keys → action names, declared, emitted as
 * `keymap:action` with `{ action, key }`. Keys are written as
 * `ctrl+k`, `shift+arrowdown`, `?`, `space` (modifiers `ctrl`, `alt`,
 * `shift`, `meta`; a single printed character carries its own shift).
 * While typing in a field, only combinations with Ctrl, Alt or Meta count.
 * On `<html>` it hears the whole page.
 *
 *   <html data-panel="keymap" data-keymap-keys='{"ctrl+k":"search","j":"next"}'>
 */
export const keymap = panel({
  params: { keys: json<Record<string, string>>({}) },
  connect: (_el, { keys }) => normalize(keys),
  events: { keydown: (e, keys, el) => press(e as KeyboardEvent, keys, el) },
})

function press(
  event: KeyboardEvent,
  keys: Map<string, string>,
  el: Element,
): void {
  const key = keyOf(event)
  const action = keys.get(key)
  if (!action || (typing(event) && !hasCommandModifier(event))) return
  event.preventDefault()
  emit(el, 'keymap:action', { action, key })
}

function normalize(keys: Record<string, string>): Map<string, string> {
  return new Map(
    Object.entries(keys).map(([key, action]) => [canonical(key), action]),
  )
}

/** `Shift+Ctrl+K` and `ctrl+shift+k` are the same key: modifiers sorted, all lower case. */
function canonical(key: string): string {
  const parts = key.toLowerCase().split('+')
  const main = parts.pop()!
  return [...parts.sort(), main].join('+')
}

function keyOf(event: KeyboardEvent): string {
  const main = event.key === ' ' ? 'space' : event.key.toLowerCase()
  const printed = main.length === 1
  const mods = (['alt', 'ctrl', 'meta', 'shift'] as const).filter(
    (m) => event[`${m}Key`] && !(printed && m === 'shift'),
  )
  return [...mods, main].join('+')
}

function hasCommandModifier(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.altKey || event.metaKey
}

/** Input types that take typing; the rest (checkbox, range…) don't. */
const NOT_TYPED = new Set([
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'range',
  'color',
  'file',
])

function typing(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null
  if (!target) return false
  if (target.isContentEditable) return true
  if (
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
    return true
  return target instanceof HTMLInputElement && !NOT_TYPED.has(target.type)
}
