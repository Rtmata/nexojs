import { watch, type FSWatcher } from 'node:fs'
import type { Dirent } from 'node:fs'
import { readdir, realpath, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { inside, isPublicName, isPublicPath } from './safe-file'

/**
 * Which files a static folder has, kept in memory while the server listens,
 * so a request never asks the disk whether a file exists. The disk keeps the
 * last word when the file is read: one deleted a moment ago is a 404.
 *
 * On any change the whole index is rebuilt — simpler and sturdier than
 * applying each event, since watchers merge, repeat or (on Linux) miss
 * them. Until the newest rebuild lands, the index steps aside and the disk
 * answers, so a file written a moment ago is never a false 404. When a
 * rebuild finds new folders, the watcher needs a moment to cover them, so
 * the index stays aside and confirms with one more rebuild.
 *
 * The watcher follows the folder the root pointed to when listening began:
 * re-pointing a symlinked root (an atomic deploy) needs a restart.
 */
export class FolderIndex {
  /** NFC path → the path as written on disk. */
  private files: Map<string, string> | null = null
  private folders = new Set<string>()
  private generation = 0
  private stale = false
  private readonly walker: FolderWalker
  private readonly watcher: FolderWatcher
  private readonly settle = new Debounce(() => this.rebuild(), 50, 500)

  constructor(readonly dir: string) {
    this.walker = new FolderWalker(dir)
    this.watcher = new FolderWatcher(dir, {
      changed: () => this.changed(),
      // Can't watch any more: forget the list, so every request asks the disk.
      gaveUp: () => this.forget(),
    })
  }

  /**
   * The path to read for a request: the file as written on disk, `undefined`
   * when it's known not to exist, `null` when the index can't tell (not
   * listening, can't watch, or a change is being indexed): ask the disk.
   */
  find(relative: string): string | undefined | null {
    if (!this.files || this.stale) return null
    return this.files.get(relative.normalize('NFC'))
  }

  /** The files it knows, as `a/b.png` paths. */
  get known(): readonly string[] {
    return this.files ? [...this.files.values()] : []
  }

  async start(): Promise<void> {
    if (!(await isFolder(this.dir))) return // gone since keep checked it
    this.watcher.start()
    if (this.watcher.watching) await this.rebuild()
  }

  stop(): void {
    this.watcher.stop()
    this.forget()
  }

  private forget(): void {
    this.settle.cancel()
    this.files = null
  }

  private changed(): void {
    this.stale = true
    this.settle.trigger()
  }

  /** Only the newest rebuild may land; an older, slower walk is dropped. */
  private async rebuild(): Promise<void> {
    const generation = ++this.generation
    const found = await this.walker.walk()
    if (generation !== this.generation || !this.watcher.watching) return
    this.files = found?.files ?? null
    const added = found ? this.addsFolders(found.folders) : false
    if (found) this.folders = found.folders
    if (added) return this.coverNewFolders()
    this.stale = this.settle.pending
  }

  /** Whether a walk found folders the last one didn't (the first walk adds none). */
  private addsFolders(folders: Set<string>): boolean {
    if (this.folders.size === 0) return false
    return [...folders].some((folder) => !this.folders.has(folder))
  }

  /**
   * Watch again so the new folders are covered, stay aside while the
   * watcher settles on them, then look again for files written meanwhile.
   */
  private coverNewFolders(): void {
    this.watcher.restart()
    this.stale = true
    this.settle.trigger(300)
  }
}

/** What a walk found: NFC path → path as written, and every folder visited. */
interface Walk {
  files: Map<string, string>
  folders: Set<string>
}

/**
 * Lists the files a folder may serve. Hidden folders are never entered and
 * symlinked folders never followed; a symlinked file counts only if it stays
 * inside. `null` when part of the folder can't be read: then nothing is
 * claimed missing.
 */
export class FolderWalker {
  constructor(readonly dir: string) {}

  async walk(): Promise<Walk | null> {
    const root = await realpath(this.dir).catch(() => null)
    if (!root) return null
    const found: Walk = { files: new Map(), folders: new Set() }
    try {
      await this.walkInto('', root, found)
      return found
    } catch {
      return null
    }
  }

  private async walkInto(relative: string, root: string, found: Walk) {
    found.folders.add(relative)
    const entries = await readdir(join(this.dir, relative), {
      withFileTypes: true,
    })
    const visible = entries.filter((entry) => isPublicName(entry.name))
    await Promise.all(
      visible.map((entry) => this.visit(entry, relative, root, found)),
    )
  }

  private async visit(
    entry: Dirent,
    parent: string,
    root: string,
    found: Walk,
  ) {
    const relative = parent ? `${parent}/${entry.name}` : entry.name
    if (entry.isDirectory()) return this.walkInto(relative, root, found)
    if (entry.isFile() || (await this.isServableLink(entry, relative, root))) {
      found.files.set(relative.normalize('NFC'), relative)
    }
  }

  /** A symlink counts when it leads to a file inside; a plain file needs no syscall. */
  private async isServableLink(
    entry: Dirent,
    relative: string,
    root: string,
  ): Promise<boolean> {
    if (!entry.isSymbolicLink()) return false
    const path = join(this.dir, relative)
    const [info, real] = await Promise.all([
      stat(path).catch(() => null),
      realpath(path).catch(() => null),
    ])
    return !!info?.isFile() && !!real && inside(root, real)
  }
}

/** What a watcher tells: something changed, or it can't watch any more. */
interface WatchListener {
  changed(): void
  gaveUp(): void
}

/**
 * Watches a folder and everything in it. Changes inside hidden folders
 * (`.git`) are ignored. A folder that can't be watched is reported once and
 * left to the disk.
 */
export class FolderWatcher {
  private watcher: FSWatcher | null = null

  constructor(
    readonly dir: string,
    private readonly listener: WatchListener,
  ) {}

  get watching(): boolean {
    return this.watcher !== null
  }

  start(): void {
    try {
      this.watcher = watch(this.dir, { recursive: true }, (_, name) =>
        this.heard(name),
      )
      this.watcher.on('error', (error) => this.giveUp(error))
    } catch (error) {
      this.giveUp(error)
    }
  }

  /** Watch again, so folders created since are covered too. */
  restart(): void {
    if (!this.watching) return
    this.watcher!.close()
    this.start()
  }

  stop(): void {
    this.watcher?.close()
    this.watcher = null
  }

  private heard(name: string | Buffer | null): void {
    if (name === null || isPublicPath(String(name))) this.listener.changed()
  }

  private giveUp(error: unknown): void {
    console.warn(
      `⚠ keep: can't watch "${this.dir}" for changes, so its files are looked up on disk for every request\n`,
      error,
    )
    this.stop()
    this.listener.gaveUp()
  }
}

/**
 * Runs `action` once things settle: `wait` ms after the last trigger, but
 * at least every `maxWait` ms while triggers keep coming.
 */
class Debounce {
  private timer: ReturnType<typeof setTimeout> | null = null
  private since: number | null = null

  constructor(
    private readonly action: () => unknown,
    private readonly wait: number,
    private readonly maxWait: number,
  ) {}

  get pending(): boolean {
    return this.timer !== null
  }

  /** Run after `delay` ms of quiet (the usual wait unless given). */
  trigger(delay = this.wait): void {
    this.since ??= Date.now()
    const overdue = Date.now() - this.since >= this.maxWait
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.fire(), overdue ? 0 : delay)
  }

  cancel(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.since = null
  }

  private fire(): void {
    this.cancel()
    this.action()
  }
}

export async function isFolder(path: string): Promise<boolean> {
  return (await stat(path).catch(() => null))?.isDirectory() ?? false
}
