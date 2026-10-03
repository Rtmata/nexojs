import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SafeFile } from './static/safe-file'

const serveFile = (folder: string, path: string) =>
  new SafeFile(folder).serve(path)
import { contentType } from './mime'

let folder: string

beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'files-'))
  await mkdir(join(folder, 'public'))
  await writeFile(join(folder, 'secret.txt'), 'secret')
  await writeFile(join(folder, 'public', 'style.css'), 'body{}')
})

afterAll(() => rm(folder, { recursive: true }))

describe('serveFile', () => {
  test('serves a file with its type and size', async () => {
    const response = await serveFile(join(folder, 'public'), '/style.css')

    expect(response?.headers.get('content-type')).toBe(
      'text/css; charset=utf-8',
    )
    expect(response?.headers.get('content-length')).toBe('6')
    expect(await response?.text()).toBe('body{}')
  })

  test('refuses to leave the folder', async () => {
    const publicFolder = join(folder, 'public')

    expect(await serveFile(publicFolder, '../secret.txt')).toBeNull()
    expect(await serveFile(publicFolder, '/../secret.txt')).toBeNull()
    expect(await serveFile(publicFolder, 'a/../../secret.txt')).toBeNull()
  })

  test('returns null for folders and missing files', async () => {
    expect(await serveFile(folder, 'public')).toBeNull()
    expect(await serveFile(folder, 'nada.txt')).toBeNull()
  })
})

describe('contentType', () => {
  test('knows common types and falls back to binary', () => {
    expect(contentType('cover.webp')).toBe('image/webp')
    expect(contentType('FONT.WOFF2')).toBe('font/woff2')
    expect(contentType('data.xyz')).toBe('application/octet-stream')
  })
})

describe('serveFile on disk', () => {
  test('a folder created after the first request is served', async () => {
    const later = join(folder, 'later')
    const safe = new SafeFile(later)

    expect(await safe.serve('/a.txt')).toBeNull()
    await mkdir(later)
    await writeFile(join(later, 'a.txt'), 'a')
    expect(await (await safe.serve('/a.txt'))?.text()).toBe('a')
  })

  test('a symlinked folder is never followed, as in the index', async () => {
    const site = join(folder, 'site')
    await mkdir(join(site, 'v2'), { recursive: true })
    await writeFile(join(site, 'v2', 'app.js'), 'js')
    await symlink(join(site, 'v2'), join(site, 'latest'))

    expect(await serveFile(site, '/v2/app.js')).not.toBeNull()
    expect(await serveFile(site, '/latest/app.js')).toBeNull()
  })
})

describe('byte ranges', () => {
  const ranged = (range: string | null) =>
    new SafeFile(join(folder, 'public')).serve('/style.css', range)

  test('one range is a 206 with only those bytes', async () => {
    const response = await ranged('bytes=0-3')
    expect(response?.status).toBe(206)
    expect(response?.headers.get('content-range')).toBe('bytes 0-3/6')
    expect(await response?.text()).toBe('body')
  })

  test('open and suffix ranges', async () => {
    expect(await (await ranged('bytes=4-'))?.text()).toBe('{}')
    expect(await (await ranged('bytes=-2'))?.text()).toBe('{}')
  })

  test('a range past the end is 416; one written wrong gets the whole file', async () => {
    const past = await ranged('bytes=10-')
    expect(past?.status).toBe(416)
    expect(past?.headers.get('content-range')).toBe('bytes */6')
    expect((await ranged('bytes=5-2'))?.status).toBe(200)
    expect((await ranged('bytes=0-1,3-4'))?.status).toBe(200)
  })

  test('every response says ranges are accepted', async () => {
    expect((await ranged(null))?.headers.get('accept-ranges')).toBe('bytes')
  })
})

describe('content types', () => {
  test('a name without an extension is binary; common web types are known', () => {
    expect(contentType('json')).toBe('application/octet-stream')
    expect(contentType('page.htm')).toBe('text/html; charset=utf-8')
    expect(contentType('site.webmanifest')).toBe('application/manifest+json')
  })
})
