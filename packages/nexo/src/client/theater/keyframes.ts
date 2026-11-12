import { cssName, movesThings, type Reduce } from '../../shared/theater/reduce'

/** WAAPI's two keyframe formats: by property, or a list of frames. */
export type Keyframes = PropertyIndexedKeyframes | Keyframe[]

/** Keys of a frame that are not properties. */
const NOT_PROPERTIES = new Set(['offset', 'easing', 'composite'])

/** What runs, and what jumps straight to its end. */
export interface Split {
  keyframes: Keyframes
  jumps: Map<string, string>
}

/**
 * Under reduced motion, takes out what jumps: with the default rule,
 * the properties that move (WCAG 2.3.3); with `'jump'`, all of them.
 * `reduced` is the visitor's preference, read by the caller.
 *
 *   splitForReduce({ opacity: [0, 1], translate: ['0 24px', '0 0'] }, undefined, true)
 *   // runs { opacity: [0, 1] }; jumps translate to '0 0'
 */
export function splitForReduce(
  keyframes: Keyframes,
  reduce: Reduce | undefined,
  reduced: boolean,
): Split {
  if (!reduced || reduce === false) return { keyframes, jumps: new Map() }
  const jumping = (property: string) =>
    reduce === 'jump' || movesThings(property, valuesOf(keyframes, property))
  return {
    keyframes: without(keyframes, jumping),
    jumps: finalsOf(keyframes, jumping),
  }
}

/** Every property the keyframes animate. */
export function propertiesOf(keyframes: Keyframes): string[] {
  const frames = Array.isArray(keyframes) ? keyframes : [keyframes]
  const names = frames.flatMap((frame) => Object.keys(frame))
  return [...new Set(names)].filter((name) => !NOT_PROPERTIES.has(name))
}

function valuesOf(keyframes: Keyframes, property: string): unknown[] {
  if (!Array.isArray(keyframes)) return [keyframes[property]].flat()
  return keyframes.map((frame) => frame[property]).filter((v) => v != null)
}

/** The value each property ends at: the last one it is given. */
function finalsOf(
  keyframes: Keyframes,
  picked: (p: string) => boolean,
): Map<string, string> {
  const finals = propertiesOf(keyframes)
    .filter(picked)
    .map((property) => {
      const values = valuesOf(keyframes, property)
      return [property, String(values.at(-1))] as const
    })
  return new Map(finals)
}

function without(
  keyframes: Keyframes,
  dropped: (p: string) => boolean,
): Keyframes {
  const keep = (frame: object) =>
    Object.fromEntries(Object.entries(frame).filter(([key]) => !dropped(key)))
  return Array.isArray(keyframes) ? keyframes.map(keep) : keep(keyframes)
}

/** Writes `jumps` inline, in CSS names (WAAPI names are camelCase). */
export function applyJumps(el: Element, jumps: Map<string, string>): void {
  const style = (el as HTMLElement).style
  for (const [property, value] of jumps)
    style.setProperty(cssName(property), value)
}
