import type { Duration, DurationUnit } from './durations'
import type { Formats } from './formats'

/** Writes a duration already split into units (pattern: strategy). */
export interface DurationWriter {
  format(duration: Duration): string
}

type ListedStyle = 'long' | 'short' | 'narrow'

const SINGULAR: readonly [DurationUnit, string][] = [
  ['days', 'day'],
  ['hours', 'hour'],
  ['minutes', 'minute'],
  ['seconds', 'second'],
  ['milliseconds', 'millisecond'],
]

/**
 * The platform's writer, or one built from older `Intl` parts on engines that
 * don't have it yet (Android WebViews before 129). Those ignore the options
 * for single units, like `hoursDisplay`.
 */
export function durationWriter(
  formats: Formats,
  options: Intl.DurationFormatOptions,
  native: typeof Intl.DurationFormat | null = Intl.DurationFormat ?? null,
): DurationWriter {
  if (native) return new native(formats.lang, options)
  return options.style === 'digital'
    ? new DigitalDuration(formats)
    : new ListedDuration(formats, options.style ?? 'short')
}

/** `'3 h y 10 min'`: each unit as `Intl.NumberFormat` writes it, in a list. */
export class ListedDuration implements DurationWriter {
  constructor(
    private readonly formats: Formats,
    private readonly style: ListedStyle,
  ) {}

  format(duration: Duration): string {
    const written = SINGULAR.filter(
      ([plural]) => duration[plural] !== undefined,
    )
    const units = written.map(([plural, unit]) =>
      this.unit(duration[plural]!, unit),
    )
    const list = { type: 'unit', style: this.style } as const
    return this.formats.list(list).format(units)
  }

  private unit(amount: number, unit: string): string {
    const shown = { style: 'unit', unit, unitDisplay: this.style } as const
    return this.formats.number(shown).format(amount)
  }
}

/** `'3:10:00'`: a clock, always with its three parts, and days written apart. */
export class DigitalDuration implements DurationWriter {
  constructor(private readonly formats: Formats) {}

  format(duration: Duration): string {
    const { days, milliseconds = 0 } = duration
    const { hours = 0, minutes = 0, seconds = 0 } = duration
    const clock = this.clock(hours, minutes, seconds + milliseconds / 1000)
    if (days === undefined) return clock
    const day = new ListedDuration(this.formats, 'short').format({ days })
    const list = { type: 'unit', style: 'short' } as const
    return this.formats.list(list).format([day, clock])
  }

  private clock(hours: number, minutes: number, seconds: number): string {
    const pair = { minimumIntegerDigits: 2, maximumFractionDigits: 3 }
    const parts = [
      this.formats.number().format(hours),
      this.formats.number(pair).format(minutes),
      this.formats.number(pair).format(seconds),
    ]
    return parts.join(this.separator())
  }

  /** What the language puts between hours and minutes: `:`, or `.` in Finnish. */
  private separator(): string {
    const clock = {
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    } as const
    const parts = this.formats.instant(clock).formatToParts(0)
    return parts.find((part) => part.type === 'literal')?.value ?? ':'
  }
}
