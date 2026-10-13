import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unzipSync, strFromU8 } from 'fflate'
import { expect, it } from 'vitest'
import { exportDesktopDiagnosticZip } from '../src/diagnostic-zip.ts'

it('exports allowlisted metadata and rejects overwrite without including secrets or raw logs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nova-diagnostic-'))
  try {
    const logs = join(root, 'logs')
    await mkdir(logs)
    await writeFile(join(logs, 'crash-secret.txt'), 'Bearer PRIVATE-TOKEN conversation PASSWORD')
    await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: {
      'dsh-context': '0.69.1', '@internal/mcp': 'https://user:password@internal/package.tgz',
    }, settings: { token: 'PRIVATE-TOKEN' } }))
    const output = join(root, 'diagnostic.zip')
    await exportDesktopDiagnosticZip(output, { applicationVersion: 'test', platform: 'win32', architecture: 'x64',
      electronVersion: '44.7.0', nodeVersion: '24.21.0', hostPhase: 'ready', updatePhase: 'idle', watchdog: null }, root, logs)
    const bytes = await readFile(output)
    const files = unzipSync(bytes)
    expect(Object.keys(files)).toEqual(['diagnostics.json', 'PRIVACY.txt'])
    const summary = strFromU8(files['diagnostics.json']!)
    expect(summary).toContain('0.69.1')
    expect(summary).toContain('"count": 1')
    for (const secret of ['PRIVATE-TOKEN', 'PASSWORD', 'password', 'conversation', 'internal/package', 'crash-secret']) {
      expect(summary).not.toContain(secret)
    }
    await expect(exportDesktopDiagnosticZip(output, { applicationVersion: 'test', platform: 'win32', architecture: 'x64',
      electronVersion: '44.7.0', nodeVersion: '24.21.0', hostPhase: 'ready', updatePhase: 'idle', watchdog: null }, root, logs)).rejects.toThrow()
    expect((await readFile(output)).equals(bytes)).toBe(true)
  } finally { await rm(root, { recursive: true, force: true }) }
})
