import { join } from 'node:path'
import type { KeepRouter } from '../keep'
import { FolderWalker } from './folder-index'
import type { Mount } from './static-folders'

/**
 * The startup report on static folders: files that can never be served because a route — or another folder that
 * answers first — owns their URL. It only warns: it never stops the server.
 */
export class ShadowReport {
  private readonly filesOf = new Map<Mount, Set<string>>()

  constructor(
    private readonly router: KeepRouter,
    private readonly mounts: readonly Mount[],
  ) {}

  async print(): Promise<void> {
    for (const mount of this.mounts) await this.read(mount)
    const lines: string[] = []
    for (const mount of this.mounts)
      lines.push(...(await this.shadowedIn(mount)))
    if (lines.length > 0) console.warn(warning(lines))
  }

  private async read(mount: Mount): Promise<void> {
    this.filesOf.set(mount, new Set(await filesIn(mount)))
  }

  private async shadowedIn(mount: Mount): Promise<string[]> {
    const lines: string[] = []
    for (const relative of this.filesOf.get(mount)!) {
      const pathname = (mount.at === '/' ? '' : mount.at) + '/' + relative
      const cause = await this.ownerOf(pathname, mount)
      if (cause)
        lines.push(
          `    ${join(mount.dir, relative)}  →  ${encoded(pathname)}  (${cause})`,
        )
    }
    return lines
  }

  /**
   * What answers this (decoded) pathname before `mount` does, if anything.
   * The router reads URLs, so it gets the encoded one.
   */
  private async ownerOf(
    pathname: string,
    mount: Mount,
  ): Promise<string | undefined> {
    const route = this.router.match('GET', encoded(pathname))
    if (route) return `route: GET ${route.route.pattern?.path ?? '?'}`
    for (const m of this.mounts.slice(0, this.mounts.indexOf(mount)))
      if (m.covers(pathname) && (await this.has(m, m.relativeOf(pathname))))
        return `static: ${m.dir} at ${m.at}`
    return undefined
  }

  /** From the index, or, for an unindexed mount, from the disk itself. */
  private async has(mount: Mount, relative: string): Promise<boolean> {
    if (mount.index.watched) return this.filesOf.get(mount)!.has(relative)
    return Bun.file(join(mount.dir, relative)).exists()
  }
}

/** The URL path of a file path: `/100%.png` is served at `/100%25.png`. */
function encoded(relative: string): string {
  return relative.split('/').map(encodeURIComponent).join('/')
}

/**
 * The files the mount's index knows, or a fresh walk when it knows none.
 * An unindexed mount (`watch: false`, R.42) is not walked: its files are
 * never read as a list, so nothing is said about them.
 */
async function filesIn(mount: Mount): Promise<readonly string[]> {
  if (!mount.index.watched) return []
  if (mount.index.known.length > 0) return mount.index.known
  const walk = await new FolderWalker(mount.dir).walk()
  return walk ? [...walk.files.values()] : []
}

function warning(lines: string[]): string {
  const count =
    lines.length === 1 ? '1 static file is' : `${lines.length} static files are`
  return `⚠ keep: ${count} shadowed by a route or another static folder and will never be served:\n${lines.join('\n')}`
}
