import { signal, type Signal } from './signal'
import { untrack } from './source'

/** Every method that reads the date: each one depends on its time. */
const READS = [
  'getDate',
  'getDay',
  'getFullYear',
  'getHours',
  'getMilliseconds',
  'getMinutes',
  'getMonth',
  'getSeconds',
  'getTime',
  'getTimezoneOffset',
  'getUTCDate',
  'getUTCDay',
  'getUTCFullYear',
  'getUTCHours',
  'getUTCMilliseconds',
  'getUTCMinutes',
  'getUTCMonth',
  'getUTCSeconds',
  'toDateString',
  'toISOString',
  'toLocaleDateString',
  'toLocaleString',
  'toLocaleTimeString',
  'toString',
  'toTimeString',
  'toUTCString',
  'valueOf',
] as const

/** Every method that changes it: each one writes its time. */
const WRITES = [
  'setDate',
  'setFullYear',
  'setHours',
  'setMilliseconds',
  'setMinutes',
  'setMonth',
  'setSeconds',
  'setTime',
  'setUTCDate',
  'setUTCFullYear',
  'setUTCHours',
  'setUTCMilliseconds',
  'setUTCMinutes',
  'setUTCMonth',
  'setUTCSeconds',
] as const

type DateArgs = [] | [value: number | string | Date] | number[]

/**
 * A real `Date` (`instanceof Date`, works with `Intl` and `quarry`) whose reads
 * are tracked: one plain signal holds its time, every getter reads it and
 * every setter writes it (Svelte's `SvelteDate`).
 *
 *   const now = new SignalDate()
 *   effect(() => (clock.textContent = now.toLocaleTimeString()))
 *   setInterval(() => now.setTime(Date.now()), 1000)
 */
export class SignalDate extends Date {
  private readonly time: Signal<number>

  constructor(...args: DateArgs) {
    super(...(args as []))
    this.time = signal(super.getTime())
  }

  /** What JSON can hold, untracked like every `toJSON`. */
  override toJSON(): string {
    return untrack(() => super.toJSON())
  }
}

const native = Date.prototype as unknown as Record<PropertyKey, Function>

for (const name of READS) define(name, readTime)
for (const name of WRITES) define(name, writeTime)
define(Symbol.toPrimitive, readTime) // `+date`, `${date}`

function readTime(name: PropertyKey) {
  return function (this: { time: Signal<number> }, ...args: unknown[]) {
    this.time.get()
    return native[name]!.apply(this, args)
  }
}

function writeTime(name: PropertyKey) {
  return function (this: { time: Signal<number> }, ...args: unknown[]) {
    const time = native[name]!.apply(this, args) as number
    this.time.set(time)
    return time
  }
}

function define(
  name: PropertyKey,
  wrap: (name: PropertyKey) => Function,
): void {
  Object.defineProperty(SignalDate.prototype, name, {
    value: wrap(name),
    writable: true,
    configurable: true,
  })
}
