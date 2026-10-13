/** 用独立临时目录验证 pnpm 10 的稳定入口及已有入口保留。 */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'
import { ensureRuntimePnpmEntry } from './pnpm-entry.ts'

it('pnpm 10 包装入口转发参数，重复调用不改写，缺少入口拒绝', (context) => {
  const root = mkdtempSync(join(tmpdir(), 'harness-pnpm-entry-'))
  context.onTestFinished(() => { rmSync(root, { recursive: true, force: true }) })
  mkdirSync(join(root, 'bin'))
  expect(() => ensureRuntimePnpmEntry(root)).toThrow('neither bin/pnpm.mjs nor bin/pnpm.cjs')
  writeFileSync(join(root, 'bin', 'pnpm.cjs'), 'process.stdout.write(JSON.stringify(process.argv.slice(2)))\n')
  const entry = ensureRuntimePnpmEntry(root)
  expect(execFileSync(process.execPath, [entry, 'install', '--offline'], { encoding: 'utf8', timeout: 30000 })).toBe('["install","--offline"]')
  writeFileSync(entry, '/* existing entry */\n')
  expect(ensureRuntimePnpmEntry(root)).toBe(entry)
  expect(readFileSync(entry, 'utf8')).toBe('/* existing entry */\n')
})
