import { fileBlob, type DiskFile } from '../../dock/bun'
import { contentType } from '../mime'
import { Validators } from './validators'

/** The bytes a `Range` header asks for, both ends included. */
interface ByteRange {
  start: number
  end: number
}

/**
 * The response for one file on disk, streamed from it (never held in
 * memory), with the validators a browser needs to ask "still the same?"
 * (ETag, `Last-Modified`: a 304 answers), the `Cache-Control` the folder
 * chose, and byte ranges so audio and video can seek:
 *
 *   new FileResponse('./intro.mp4', 'no-cache').answer(request.headers)
 *
 * One range per request; a header asking for several, or written wrong,
 * gets the whole file (200), as HTTP allows. A range past the end is 416.
 */
export class FileResponse {
  private readonly file: DiskFile
  private readonly validators: Validators

  constructor(
    private readonly path: string,
    private readonly cacheControl: string | null,
  ) {
    this.file = fileBlob(path)
    this.validators = new Validators(this.file)
  }

  answer(headers: Headers): Response {
    if (this.validators.unchanged(headers)) return this.notModified()
    const range = this.validators.rangeApplies(headers)
      ? headers.get('range')
      : null
    return this.for(range)
  }

  private for(range: string | null): Response {
    const size = this.file.size
    const wanted = range === null ? null : rangeIn(range, size)
    if (wanted === 'past the end') return this.unsatisfiable(size)
    return wanted ? this.part(wanted, size) : this.whole()
  }

  /** The validators travel again, so the browser's copy stays known (§15.4.5). */
  private notModified(): Response {
    const headers = this.headers(null)
    headers.delete('content-type')
    return new Response(null, { status: 304, headers })
  }

  private whole(): Response {
    return new Response(this.file, { headers: this.headers(this.file) })
  }

  private part({ start, end }: ByteRange, size: number): Response {
    const body = this.file.slice(start, end + 1)
    const headers = this.headers(body)
    headers.set('content-range', `bytes ${start}-${end}/${size}`)
    return new Response(body, { status: 206, headers })
  }

  private unsatisfiable(size: number): Response {
    const headers = { 'content-range': `bytes */${size}` }
    return new Response(null, { status: 416, headers })
  }

  /** Said up front, so HEAD gets them without reading the file; `body` null for a 304, which sends none. */
  private headers(body: Blob | null): Headers {
    const headers = new Headers({
      'content-type': contentType(this.path),
      'accept-ranges': 'bytes',
      etag: this.validators.etag,
      'last-modified': this.validators.lastModified,
    })
    if (body) headers.set('content-length', String(body.size))
    if (this.cacheControl) headers.set('cache-control', this.cacheControl)
    return headers
  }
}

/**
 * `bytes=0-99`, `bytes=100-` or `bytes=-100` (the last 100) → the bytes to
 * send; `null` to send the whole file; 'past the end' when none exist.
 */
function rangeIn(
  header: string,
  size: number,
): ByteRange | null | 'past the end' {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (match[1] === '' && match[2] === '')) return null
  const [, first, last] = match
  if (first === '') return lastBytes(Number(last), size)
  return fromByte(Number(first), last === '' ? size - 1 : Number(last), size)
}

/** From `start` to `end` (cut at the file's end). */
function fromByte(start: number, end: number, size: number) {
  if (start >= size) return 'past the end'
  if (end < start) return null // written wrong: the whole file instead
  return { start, end: Math.min(end, size - 1) }
}

function lastBytes(count: number, size: number): ByteRange | 'past the end' {
  if (count === 0 || size === 0) return 'past the end'
  return { start: Math.max(0, size - count), end: size - 1 }
}
