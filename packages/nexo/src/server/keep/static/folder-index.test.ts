import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { boat } from '../../../shared/boat'
import { keep } from '../keep'
import { FolderWalker } from './folder-index'

let root: string
let folder: string

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'keep-index-'))
  folder = join(root, 'public')
  await mkdir(join(folder, 'img'), { recursive: true })
  await mkdir(join(folder, '.git'))
  await mkdir(join(folder, '.well-known'))
  await writeFile(join(folder, 'img', 'nes.png'), 'png')
  await writeFile(join(folder, '.env'), 'SECRET=1')
  await writeFile(join(folder, '.git', 'config'), 'git')
  await writeFile(join(folder, '.well-known', 'security.txt'), 'contact')
  await writeFile(join(root, 'outside.txt'), 'outside')
  await symlink(join(root, 'outside.txt'), join(folder, 'escape.txt'))
})

afterAll(() => rm(root, { recursive: true }))

const get = (server: { fetch(r: Request): Promise<Response> }, path: string) =>
  server.fetch(new Request(`http://museo.test${path}`))

describe('static files: what may be served', () => {
  test('lists only public files that stay inside the folder', async () => {
    expect(
      [...(await new FolderWalker(folder).walk())!.files.values()].sort(),
    ).toEqual(['.well-known/security.txt', 'img/nes.png'])
  })

  test('hidden files, symlinks out and null bytes are never served', async () => {
    const server = keep({ router: boat(), static: folder })
    expect((await get(server, '/.env')).status).toBe(404)
    expect((await get(server, '/.git/config')).status).toBe(404)
    expect((await get(server, '/escape.txt')).status).toBe(404)
    expect((await get(server, '/img/nes.png%00.txt')).status).toBe(404)
    expect(await (await get(server, '/.well-known/security.txt')).text()).toBe(
      'contact',
    )
  })
})

describe('static files: the index while listening', () => {
  test('new files, also in new folders, are served; deleted ones are 404', async () => {
    const log = spyOn(console, 'log').mockImplementation(() => {})
    const server = keep({ router: boat(), static: folder })
    await server.listen(0)
    try {
      await mkdir(join(folder, 'covers'))
      await Bun.sleep(150) // the watcher sees the folder and restarts
      await writeFile(join(folder, 'covers', 'snes.png'), 'snes')
      await Bun.sleep(150)
      expect(await (await get(server, '/covers/snes.png')).text()).toBe('snes')

      await rm(join(folder, 'covers', 'snes.png'))
      // Even before the index catches up, the disk has the last word.
      expect((await get(server, '/covers/snes.png')).status).toBe(404)
    } finally {
      await server.stop()
      log.mockRestore()
    }
  })
})

describe('static files: the index stays honest', () => {
  test('a folder that loops back on itself is still served from disk', async () => {
    const looped = join(root, 'looped')
    await mkdir(looped)
    await writeFile(join(looped, 'a.txt'), 'a')
    await symlink(looped, join(looped, 'self'))
    const log = spyOn(console, 'log').mockImplementation(() => {})
    const server = keep({ router: boat(), static: looped })
    await server.listen(0)
    try {
      expect(await (await get(server, '/a.txt')).text()).toBe('a')
    } finally {
      await server.stop()
      log.mockRestore()
    }
  })

  test("two folders on one path: the second one's hidden files are reported", async () => {
    const first = join(root, 'first')
    const second = join(root, 'second')
    await mkdir(first)
    await mkdir(second)
    await writeFile(join(first, 'logo.png'), '1')
    await writeFile(join(second, 'logo.png'), '2')
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    const log = spyOn(console, 'log').mockImplementation(() => {})
    const server = keep({ router: boat(), static: [first, second] })
    await server.listen(0)
    await server.stop()
    expect(warn.mock.calls.flat().join('\n')).toContain(`static: ${first} at /`)
    warn.mockRestore()
    log.mockRestore()
  })

  test('a missing folder stops listen() with a clear error', async () => {
    const server = keep({ router: boat(), static: join(root, 'nope') })
    await expect(server.listen(0)).rejects.toThrow('does not exist. Create it')
  })
})
