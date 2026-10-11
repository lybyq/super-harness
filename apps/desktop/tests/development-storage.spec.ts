import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from 'vitest'
import { configureDevelopmentStorage } from '../scripts/development-storage.mjs'

test('开发临时目录和缓存随工作区落盘，不修改传入环境以外的全局设置', () => {
  const root = mkdtempSync(join(tmpdir(), 'desktop-storage-'))
  try {
    const environment: NodeJS.ProcessEnv = { TEMP: 'old-system-temp' }
    configureDevelopmentStorage(root, environment)
    expect(environment.TEMP).toBe(join(root, 'scratch', 'temp'))
    expect(environment.TMP).toBe(environment.TEMP)
    expect(environment.TMPDIR).toBe(environment.TEMP)
    expect(environment.npm_config_cache).toBe(join(root, 'scratch', 'npm-cache'))
  } finally { rmSync(root, { recursive: true, force: true }) }
})
