/** 真实 Windows Junction 与 7-Zip 验证目录保留，避免 portable store 被扁平化或携带 projects。 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { access, mkdtemp, mkdir, readFile, writeFile, rm, lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execute = promisify(execFile)
const zip = 'C:/Program Files/7-Zip/7z.exe'

test('archive restores the full .offline/apps layout and excludes machine-local project links', { skip: process.platform !== 'win32' && 'Windows NTFS Junction/7-Zip test' }, async t => {
  try { await access(zip) } catch { t.skip('7-Zip is not installed on this Windows test host'); return }
  const root = await mkdtemp(join(tmpdir(), 'nova-archive-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'nova'))
  await writeFile(join(root, 'nova/archive-materials.ps1'), await readFile(new URL('../archive-materials.ps1', import.meta.url)))
  const paths = [
    '.offline/toolchain/node/bin/node.exe', '.offline/assets/electron/dist/electron.exe',
    '.offline/pnpm-store/v10/files/hash', '.offline/pnpm-store/v10/index/hash.json',
    'apps/desktop/.desktop-build/downloads/hash', 'apps/desktop/.desktop-build/targets/win-x64/runtime/primary-runtime/runtime.json',
    'apps/nova-enterprise/lib/engine.js', '.offline/pnpm-store/v10/projects/do-not-ship',
  ]
  for (const path of paths) {
    await mkdir(join(root, path, '..'), { recursive: true })
    await writeFile(join(root, path), path)
  }
  const archive = join(root, 'output/materials.7z')
  await execute('pwsh', ['-NoProfile', '-File', join(root, 'nova/archive-materials.ps1'), '-OutputPath', archive], { windowsHide: true })
  const listing = await execute(zip, ['l', '-slt', archive], { windowsHide: true })
  for (const path of paths.slice(0, -1)) assert.ok(listing.stdout.includes('Path = ' + path.replaceAll('/', '\\')))
  assert.ok(!listing.stdout.includes('do-not-ship'))
  const restored = join(root, 'restored')
  await execute(zip, ['x', archive, '-o' + restored, '-bso0', '-bsp0'], { windowsHide: true })
  for (const path of paths.slice(0, -1)) assert.equal(await readFile(join(restored, path), 'utf8'), path)
  assert.equal((await lstat(join(restored, '.offline/toolchain'))).isSymbolicLink(), false)
  assert.equal(await readFile(join(root, paths[0]!), 'utf8'), paths[0])
  await assert.rejects(execute('pwsh', ['-NoProfile', '-File', join(root, 'nova/archive-materials.ps1'), '-OutputPath', archive], { windowsHide: true }))
})
