import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { serveFile } from './files'
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
