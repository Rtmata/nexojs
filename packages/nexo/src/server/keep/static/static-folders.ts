import { decodedSegments } from '../../../shared/url/decode'
import { FolderIndex, isFolder } from './folder-index'
import { ensureCacheOption, type CacheOption } from './freshness'
import { SafeFile } from './safe-file'

/** A folder, the URL path it's served under, and how long browsers may keep its files. */
export interface StaticMount {
  dir: string
  at: string
  /** Unset: ask every time (a 304 when unchanged). `'immutable'` for content-hashed names. See `CacheOption`. */
  cache?: CacheOption
  /** `false` for a folder whose files never change while the server runs: indexed once, never watched — a must above tens of thousands of files (see `FolderIndex`). */
  watch?: boolean
}

export type StaticOption =
  string | StaticMount | readonly (string | StaticMount)[]

/** One static folder served under a URL path, with the index of its files. */
export class Mount {
  /** Normalized: '/', or '/covers' (no trailing slash). */
  readonly at: string
  readonly index: FolderIndex
  private readonly files: SafeFile

  constructor(
    readonly dir: string,
    at: string,
    cache?: CacheOption,
    watch = true,
  ) {
    this.at = '/' + at.replace(/^\/+|\/+$/g, '')
    this.index = new FolderIndex(dir, watch)
    this.files = new SafeFile(dir, cache)
  }

  /** Whether this mount's path holds the pathname. */
  covers(pathname: string): boolean {
    return (
      this.at === '/' ||
      pathname === this.at ||
      pathname.startsWith(this.at + '/')
    )
  }

  /** The pathname inside the folder: '/covers/nes.png' → 'nes.png'. */
  relativeOf(pathname: string): string {
    return pathname.slice(this.at === '/' ? 1 : this.at.length + 1)
  }

  /**
   * The file for a (decoded) pathname, or `null`. A file the index knows is
   * missing skips the disk; any other is checked on disk before it's served.
   */
  async serve(pathname: string, headers: Headers) {
    const relative = this.relativeOf(pathname)
    const onDisk = this.index.find(relative)
    if (onDisk === undefined) return null
    return this.files.serve(onDisk ?? relative, headers)
  }
}

/**
 * Every static folder, longest path first, so `/covers` answers before `/`.
 * Folders sharing a path answer in the order they were given.
 */
export class StaticFolders {
  readonly mounts: readonly Mount[]

  constructor(option: StaticOption | undefined) {
    const list =
      option === undefined ? [] : Array.isArray(option) ? option : [option]
    this.mounts = list.map(mountOf).sort((a, b) => b.at.length - a.at.length)
  }

  /** The first file any folder has for this URL path, or `null`; `headers` are the request's. */
  async serve(urlPath: string, headers: Headers) {
    const pathname = filePathOf(urlPath)
    if (pathname === null) return null
    for (const mount of this.mounts.filter((m) => m.covers(pathname))) {
      const file = await mount.serve(pathname, headers)
      if (file) return file
    }
    return null
  }

  /** Throws for a folder that doesn't exist: a typo must not start a server of 404s. */
  async ensureExist(): Promise<void> {
    for (const mount of this.mounts) {
      if (await isFolder(mount.dir)) continue
      throw new Error(
        `keep: static folder "${mount.dir}" does not exist. Create it, or fix the path`,
      )
    }
  }

  /** While listening, files are known from memory, not asked for on disk. */
  async start(): Promise<void> {
    await Promise.all(this.mounts.map((m) => m.index.start()))
  }

  stop(): void {
    for (const mount of this.mounts) mount.index.stop()
  }
}

/**
 * The decoded pathname a file could have, read like the router reads it
 * (see `decodedSegments`). No file is named '' (`/covers//nes.png`), so
 * such a path is no file, with or without the index.
 */
function filePathOf(urlPath: string): string | null {
  const parts = decodedSegments(urlPath)
  if (!parts || parts.includes('')) return null
  return '/' + parts.join('/')
}

/** `watch` is on unless told `false`; anything else is a mistake. */
function ensureWatch(watch: unknown): boolean {
  if (watch === undefined || typeof watch === 'boolean') return watch ?? true
  throw new Error(
    `keep: static watch takes true or false, not ${JSON.stringify(watch)}`,
  )
}

/** One `static` entry as a Mount, or a clear error for anything else. */
function mountOf(option: string | StaticMount): Mount {
  if (typeof option === 'string') return new Mount(option, '/')
  const { dir, at, cache, watch } = (option ?? {}) as Partial<StaticMount>
  if (typeof dir === 'string' && typeof at === 'string')
    return new Mount(dir, at, ensureCacheOption(cache), ensureWatch(watch))
  throw new Error(
    `keep: static takes a folder ('./public') or { dir, at } ({ dir: './covers', at: '/covers' }), not ${JSON.stringify(option)}`,
  )
}
