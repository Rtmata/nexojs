import type { Formats } from './formats'

export type DisplayNameOptions = Omit<
  Intl.DisplayNamesOptions,
  'type' | 'fallback'
>

/**
 * The names of codes in one language. Codes tend to come from outside (a
 * file's metadata, a database), so one with no name gives `''` and a strange
 * one in a book doesn't break its page. Bad options still throw: those are
 * the programmer's.
 */
export class DisplayNames {
  constructor(private readonly formats: Formats) {}

  name(
    type: Intl.DisplayNamesOptions['type'],
    code: string | null,
    options: DisplayNameOptions = {},
  ): string {
    const names = this.formats.names({ ...options, type, fallback: 'none' })
    return readName(names, code)
  }
}

function readName(names: Intl.DisplayNames, code: string | null): string {
  if (!code) return ''
  try {
    return names.of(code) ?? ''
  } catch (error) {
    if (error instanceof RangeError) return '' // not even shaped like a code
    throw error
  }
}
