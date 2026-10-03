import { decodedSegments } from '../../../shared/url/decode'
import { FolderIndex, isFolder } from './folder-index'
import { SafeFile } from './safe-file'

/** A folder and the URL path it's served under. */
export interface StaticMount {
  dir: string
  at: string
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
  ) {
    this.at = '/' + at.replace(/^\/+|\/+$/g, '')
    this.index = new FolderIndex(dir)
    this.files = new SafeFile(dir)
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
  async serve(pathname: string, range: string | null) {
    const relative = this.relativeOf(pathname)
    const onDisk = this.index.find(relative)
    if (onDisk === undefined) return null
    return this.files.serve(onDisk ?? relative, range)
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

  /** The first file any folder has for this URL path, or `null`. */
  async serve(urlPath: string, range: string | null) {
    const pathname = filePathOf(urlPath)
    if (pathname === null) return null
    for (const mount of this.mounts.filter((m) => m.covers(pathname))) {
      const file = await mount.serve(pathname, range)
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

/** One `static` entry as a Mount, or a clear error for anything else. */
function mountOf(option: string | StaticMount): Mount {
  if (typeof option === 'string') return new Mount(option, '/')
  const { dir, at } = (option ?? {}) as Partial<StaticMount>
  if (typeof dir === 'string' && typeof at === 'string')
    return new Mount(dir, at)
  throw new Error(
    `keep: static takes a folder ('./public') or { dir, at } ({ dir: './covers', at: '/covers' }), not ${JSON.stringify(option)}`,
  )
}
