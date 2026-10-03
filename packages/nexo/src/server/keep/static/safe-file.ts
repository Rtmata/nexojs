import { realpath, stat } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { FileResponse } from './file-response'

/**
 * One folder's files, served only when it's safe. Never served:
 *   - paths that leave the folder (`../`), also through a symlink
 *   - hidden files and folders (`.env`, `.git/…`), except `.well-known`
 *   - paths with a null byte
 */
export class SafeFile {
  private readonly root: string

  constructor(folder: string) {
    this.root = resolve(folder)
  }

  /**
   * The response for `path` inside the folder, or `null`. The file is
   * checked on disk every time, however it was found, and streamed;
   * `range` is the request's `Range` header, for seeking.
   *
   *   await new SafeFile('./public').serve('logo.svg')
   */
  async serve(path: string, range: string | null = null) {
    const target = await this.existing(path)
    if (!target || !(await this.staysInside(target))) return null
    return new FileResponse(target).for(range)
  }

  /**
   * The file the path names, if it may be served and is a file. A name
   * written NFC in the URL may be stored NFD on disk (or the other way), so
   * both spellings are tried.
   */
  private async existing(path: string): Promise<string | null> {
    for (const spelling of spellingsOf(path)) {
      const target = this.targetOf(spelling)
      if (target && (await isFile(target))) return target
    }
    return null
  }

  /** The file's absolute path, or `null` when the path may not be served. */
  private targetOf(path: string): string | null {
    const relative = path.replace(/^\/+/, '')
    if (!isPublicPath(relative)) return null
    const target = resolve(this.root, relative)
    return inside(this.root, target) ? target : null
  }

  /**
   * The path looked fine; check it on disk, as the folder index does: a
   * symlinked file must stay inside, and no folder on the way is a symlink.
   * Resolved on every call, so a root created or re-pointed later is seen.
   */
  private async staysInside(target: string): Promise<boolean> {
    const [root, real, folder] = await Promise.all(
      [this.root, target, dirname(target)].map((path) =>
        realpath(path).catch(() => null),
      ),
    )
    if (!root || !real || !folder) return false
    const expected = resolve(root, relative(this.root, dirname(target)))
    return inside(root, real) && sameName(folder, expected)
  }
}

/** The path as written, and in both Unicode spellings. */
function spellingsOf(path: string): Set<string> {
  return new Set([path, path.normalize('NFC'), path.normalize('NFD')])
}

async function isFile(target: string): Promise<boolean> {
  return (await stat(target).catch(() => null))?.isFile() ?? false
}

/** No null bytes, no hidden segments (but `.well-known`, a web standard). */
export function isPublicPath(relative: string): boolean {
  if (relative.includes('\0')) return false
  return relative.split(/[\\/]/).every(isPublicName)
}

export function isPublicName(name: string): boolean {
  return !name.startsWith('.') || name === '.well-known'
}

function sameName(a: string, b: string): boolean {
  return a.normalize('NFC') === b.normalize('NFC')
}

export function inside(root: string, target: string): boolean {
  return target === root || target.startsWith(root + sep)
}
