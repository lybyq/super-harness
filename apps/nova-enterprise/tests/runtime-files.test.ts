/** 配置文件生命周期回归：只落公开参数，保留环境引用，不写 Store，不删除 MCP 数据。 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runtimeFiles } from '../src/runtime-files.ts'

test('为每次启动创建独立公开配置，停用删除临时文件但保留记忆数据', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'harness-runtime-files-')); t.after(() => rm(root, { recursive: true, force: true }))
  const spec = [{ name: 'REGISTRY', field: 'JSON', format: 'json' }], saved = { values: { JSON: '{"token":"${YAPI_MCP_TOKEN}"}' }, secrets: { YAPI_MCP_TOKEN: 'must-not-enter-file' } }
  const first = await runtimeFiles(root, 'yapi', '', spec, saved), second = await runtimeFiles(root, 'yapi', '', spec, saved)
  assert.notEqual(first.values.FILE_REGISTRY, second.values.FILE_REGISTRY)
  assert.deepEqual(JSON.parse(await readFile(first.values.FILE_REGISTRY, 'utf8')), { token: '${YAPI_MCP_TOKEN}' })
  await writeFile(join(first.values.INSTANCE_HOME, 'memory.jsonl'), 'fixture-data')
  await first.close(); await assert.rejects(access(first.values.FILE_REGISTRY))
  assert.equal(await readFile(join(second.values.INSTANCE_HOME, 'memory.jsonl'), 'utf8'), 'fixture-data')
  await second.close()
  await assert.rejects(runtimeFiles(root, 'yapi', '', [{ name: 'SECRET', field: 'YAPI_MCP_TOKEN', format: 'text' }], saved), { code: 'HUB_BINDING_INVALID' })
  await assert.rejects(runtimeFiles(root, 'yapi', '', [{ name: '../ESCAPE', field: 'JSON', format: 'json' }], saved), { code: 'HUB_BINDING_INVALID' })
})
