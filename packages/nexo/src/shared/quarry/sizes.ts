import type { Numbers } from './numbers'

export interface BytesOptions extends Intl.NumberFormatOptions {
  /** Count in 1024s and write `KiB`, `MiB`…, instead of 1000s and `kB`, `MB`… */
  binary?: boolean
}

const STEPS = 5
const DECIMAL = [
  'byte',
  'kilobyte',
  'megabyte',
  'gigabyte',
  'terabyte',
  'petabyte',
]
const BINARY = ['KiB', 'MiB', 'GiB', 'TiB', 'PiB']

/**
 * An amount of data, in the largest unit that keeps the number readable:
 * `1887436` → `'1,9 MB'`; with `binary`, `'1,8 MiB'`. `Intl` has no binary
 * units, so those are written after the number.
 */
export function bytes(
  numbers: Numbers,
  value: number,
  options: BytesOptions = {},
): string {
  ensureAmount(value)
  const { binary = false, ...shown } = options
  const digits = { maximumFractionDigits: 1, ...shown }
  const base = binary ? 1024 : 1000
  const step = stepFor(value, base, digits.maximumFractionDigits)
  const amount = value / base ** step
  return binary && step > 0
    ? `${numbers.number(amount, digits)}\u00a0${BINARY[step - 1]}`
    : numbers.number(amount, { ...digits, ...decimalUnit(step) })
}

function decimalUnit(step: number): Intl.NumberFormatOptions {
  return { style: 'unit', unit: DECIMAL[step] }
}

/** The unit to use, looking at the number as written: 999,999 is 1 MB, not 1000 kB. */
function stepFor(value: number, base: number, digits: number): number {
  const size = Math.abs(value)
  let step = 0
  while (step < STEPS && written(size / base ** step, digits) >= base) step++
  return step
}

function written(amount: number, digits: number): number {
  return Number(amount.toFixed(Math.min(digits, 100)))
}

function ensureAmount(value: number): void {
  if (Number.isFinite(value)) return
  throw new Error(`quarry: ${value} is not an amount of bytes. Give a number`)
}
