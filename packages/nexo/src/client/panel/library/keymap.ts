import { panel } from '../panel'
import { json } from '../params'
import { emit } from './hold'

/**
 * A key map (Archive): keys → action names, declared, emitted as
 * `keymap:action` with `{ action, key }`. Keys are written as
 * `ctrl+k`, `shift+arrowdown`, `?`, `space` (modifiers `ctrl`, `alt`,
 * `shift`, `meta`; a single printed character carries its own shift, so
 * `?` matches Shift+/ and `ctrl+shift+k` still beats `ctrl+k`).
 * While typing in a field, only combinations with Ctrl, Alt or Meta count.
 * On `<html>` it hears the whole page.
 *
 *   <html data-panel="keymap" data-keymap-keys='{"ctrl+k":"search","j":"next"}'>
 */
export const keymap = panel({
  params: { keys: json<Record<string, string>>({}, 'object') },
  connect: (_el, { keys }) => normalize(keys),
  events: { keydown: (e, keys, el) => press(e as KeyboardEvent, keys, el) },
})

function press(
  event: KeyboardEvent,
  keys: Map<string, string>,
  el: Element,
): void {
  if (typeof event.key !== 'string') return // autofill keydowns have none
  const key = keysOf(event).find((k) => keys.has(k))
  const action = key && keys.get(key)
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

/**
 * The names this press may go by, most specific first: with every
 * modifier (`ctrl+shift+k`), then, for a printed character, without
 * `shift`, which the character already carries (`?`).
 */
function keysOf(event: KeyboardEvent): string[] {
  const main = event.key === ' ' ? 'space' : event.key.toLowerCase()
  const mods = (['alt', 'ctrl', 'meta', 'shift'] as const).filter(
    (m) => event[`${m}Key`],
  )
  const full = [...mods, main].join('+')
  if (main.length !== 1 || !event.shiftKey) return [full]
  return [full, [...mods.filter((m) => m !== 'shift'), main].join('+')]
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
