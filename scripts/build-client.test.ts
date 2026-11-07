import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { entries } from './build-client'

const out = mkdtempSync(join(tmpdir(), 'nexo-built-'))
afterAll(() => rmSync(out, { recursive: true, force: true }))

/** Every .js under a folder. */
function files(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.js'))
    .map((f) => join(dir, f))
}

describe('the client build (F.2)', () => {
  test('every nexo-built subpath gets its file, shared code once', async () => {
    const build = Bun.spawnSync([
      'bun',
      resolve(import.meta.dir, 'build-client.ts'),
      `--outdir=${out}`,
    ])
    expect(build.exitCode).toBe(0)
    const pkg = await Bun.file(
      resolve(import.meta.dir, '../packages/nexo/package.json'),
    ).json()
    for (const target of Object.values(pkg.exports) as any[]) {
      if (typeof target !== 'object') continue
      const built = target['nexo-built'].default.replace('./dist/', '')
      expect(files(out)).toContain(join(out, built))
    }
    const defining = files(out).filter((f) =>
      /class Element\b/.test(readFileSync(f, 'utf8')),
    )
    expect(defining).toHaveLength(1)
  })

  test('the list is the exports map: nine client modules', async () => {
    expect(await entries()).toHaveLength(9)
  })
})
