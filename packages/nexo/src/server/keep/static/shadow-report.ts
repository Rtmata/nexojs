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
    const lines = this.mounts.flatMap((mount) => this.shadowedIn(mount))
    if (lines.length === 0) return
    const count =
      lines.length === 1
        ? '1 static file is'
        : `${lines.length} static files are`
    console.warn(
      `⚠ keep: ${count} shadowed by a route or another static folder and will never be served:\n${lines.join('\n')}`,
    )
  }

  private async read(mount: Mount): Promise<void> {
    this.filesOf.set(mount, new Set(await filesIn(mount)))
  }

  private shadowedIn(mount: Mount): string[] {
    return [...this.filesOf.get(mount)!].flatMap((relative) => {
      const pathname = (mount.at === '/' ? '' : mount.at) + '/' + relative
      const cause = this.ownerOf(pathname, mount)
      const url = encoded(pathname)
      return cause
        ? [`    ${join(mount.dir, relative)}  →  ${url}  (${cause})`]
        : []
    })
  }

  /**
   * What answers this (decoded) pathname before `mount` does, if anything.
   * The router reads URLs, so it gets the encoded one.
   */
  private ownerOf(pathname: string, mount: Mount): string | undefined {
    const route = this.router.match('GET', encoded(pathname))
    if (route) return `route: GET ${route.route.pattern?.path ?? '?'}`
    const first = this.mounts
      .slice(0, this.mounts.indexOf(mount))
      .find((m) => m.covers(pathname) && this.has(m, m.relativeOf(pathname)))
    return first ? `static: ${first.dir} at ${first.at}` : undefined
  }

  private has(mount: Mount, relative: string): boolean {
    return this.filesOf.get(mount)!.has(relative)
  }
}

/** The URL path of a file path: `/100%.png` is served at `/100%25.png`. */
function encoded(relative: string): string {
  return relative.split('/').map(encodeURIComponent).join('/')
}

/** The files the mount's index knows, or a fresh walk when it knows none. */
async function filesIn(mount: Mount): Promise<readonly string[]> {
  if (mount.index.known.length > 0) return mount.index.known
  const walk = await new FolderWalker(mount.dir).walk()
  return walk ? [...walk.files.values()] : []
}
