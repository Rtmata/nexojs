import { matches } from '../../../shared/http/etag'

/** What a validator needs to know about a file: its size and when it last changed. */
export interface FileFacts {
  readonly size: number
  readonly lastModified: number
}

/**
 * How a browser can ask "has this file changed?" without downloading it
 * again: a weak ETag from the size and the date (what nginx and Caddy
 * send), and `Last-Modified` to the second. Conditional headers are read
 * as RFC 9110 §13 says: `If-None-Match` decides when present, else
 * `If-Modified-Since`; `If-Range` lets a range go on only while its
 * validator still holds.
 */
export class Validators {
  readonly etag: string
  readonly lastModified: string
  private readonly seconds: number

  constructor(file: FileFacts) {
    this.seconds = Math.floor(file.lastModified / 1000)
    this.etag = `W/"${file.size.toString(16)}-${this.seconds.toString(16)}"`
    this.lastModified = new Date(this.seconds * 1000).toUTCString()
  }

  /** The browser's copy is still good: nothing to send but a 304. */
  unchanged(headers: Headers): boolean {
    const ifNoneMatch = headers.get('if-none-match')
    if (ifNoneMatch !== null) return matches(ifNoneMatch, this.etag)
    return this.notSince(headers.get('if-modified-since'))
  }

  /**
   * Whether a `Range` may be honoured: always without `If-Range`; with
   * one, only when it names this very version — a date equal to ours, or
   * a strong ETag, which ours never is (weak tags never match here,
   * §13.1.5), so a resumed download gets the whole file if the file moved.
   */
  rangeApplies(headers: Headers): boolean {
    const ifRange = headers.get('if-range')
    if (ifRange === null) return true
    if (ifRange.trim().startsWith('"') || ifRange.trim().startsWith('W/'))
      return false
    return secondsOf(ifRange) === this.seconds
  }

  private notSince(ifModifiedSince: string | null): boolean {
    const since = secondsOf(ifModifiedSince)
    return since !== null && this.seconds <= since
  }
}

/** An HTTP date to the second; null for anything that isn't one. */
function secondsOf(date: string | null): number | null {
  const ms = date === null ? NaN : Date.parse(date)
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000)
}
