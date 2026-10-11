/** Bundle 参数映射使用官方 Fiber 配置瀑布，不改原始 Loader 配置，不把密钥写入 JSON。 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { bundleConfiguration } from '../src/bundle-configuration.ts'
import { boot } from '@deepseek-ai/dsh-app-boot'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('官方配置解析前注入类型和密钥，释放映射后恢复原值', async () => {
  const ctx = new Context()
  const adapter = bundleConfiguration(ctx)
  const row = { id: 'bundle-row', name: 'test-module' }
  const raw = { keep: true }
  const bundle = { rows: [{ rowId: row.id, moduleName: row.name }], overrides: [] }
  adapter.prepare('test-plugin', bundle, { bundleRows: [{ ...row, configuration: { count: '${COUNT}', token: '${TOKEN}' } }] },
    { values: { COUNT: 3 }, secrets: { TOKEN: 'host-only-secret' } })
  try {
    // Fiber 是真实插件实例；仅 entry 元数据由独立声明模拟，原始配置仍由官方 resolveConfig 接收。
    const plugin = { apply(inner, config) { inner.provide('testBundleConfig', config) } }
    const fiber = ctx.plugin(plugin, raw)
    await fiber
    fiber.entry = { options: row }
    const resolved = fiber.ctx.waterfall(fiber, 'internal/config', raw, () => raw)
    assert.deepEqual(resolved, { keep: true, count: 3, token: 'host-only-secret' })
    assert.equal(JSON.stringify(raw).includes('host-only-secret'), false)
    adapter.release('test-plugin')
    assert.deepEqual(fiber.ctx.waterfall(fiber, 'internal/config', raw, () => raw), raw)
  } finally { await ctx.fiber.dispose() }
})
test('不得映射其他 Bundle 行、覆盖核心行、重复行或未使用参数', async () => {
  const ctx = new Context(), adapter = bundleConfiguration(ctx)
  const row = { id: 'row', name: 'module', configuration: { token: '${TOKEN}' } }
  const saved = { values: {}, secrets: { TOKEN: 'secret' } }
  try {
    assert.throws(() => adapter.prepare('plugin', { rows: [], overrides: [] }, { bundleRows: [row] }, saved), { code: 'HUB_BINDING_INVALID' })
    assert.throws(() => adapter.prepare('plugin', { rows: [{ rowId: 'row', moduleName: 'module' }], overrides: ['row'] }, { bundleRows: [row] }, saved), { code: 'HUB_BINDING_INVALID' })
    assert.throws(() => adapter.prepare('plugin', { rows: [{ rowId: 'row', moduleName: 'module' }], overrides: [] }, { bundleRows: [row, row] }, saved), { code: 'HUB_BINDING_INVALID' })
  } finally { await ctx.fiber.dispose() }
})

test('真实 Loader 在原生 apply 前注入 Bundle 行参数，磁盘配置不含密钥', async () => {
  const root = await mkdtemp(join(tmpdir(), 'harness-bundle-loader-'))
  const path = join(root, 'cordis.yml'), plugin = join(root, 'addon.mjs')
  const rows = [{ id: 'bundle-row', name: './addon.mjs', config: { keep: true } }]
  await writeFile(path, JSON.stringify(rows))
  await writeFile(plugin, 'export function apply(ctx, config) { ctx.provide("harnessBundleObserved", config); }')
  let ctx
  try {
    ctx = await boot('bundle-test', path, [], (host) => {
      bundleConfiguration(host).prepare('addon', { rows: [{ rowId: 'bundle-row', moduleName: './addon.mjs' }], overrides: [] },
        { bundleRows: [{ id: 'bundle-row', name: './addon.mjs', configuration: { token: '${TOKEN}', count: '${COUNT}' } }] },
        { values: { COUNT: 4 }, secrets: { TOKEN: 'fixture-secret' } })
    })
    assert.deepEqual(ctx.get('harnessBundleObserved'), { keep: true, count: 4, token: 'fixture-secret' })
    assert.equal((await readFile(path, 'utf8')).includes('fixture-secret'), false)
  } finally { await ctx?.fiber.dispose(); await rm(root, { recursive: true, force: true }) }
})
