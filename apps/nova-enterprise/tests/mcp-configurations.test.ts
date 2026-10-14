/** 批量配置测试：全量准入后写入、同名秘密隔离、部分失败和单次重载协调。 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import type { CredentialKey, CredentialRecord } from '@deepseek-ai/dsh-credentials'
import type { InstalledCapability } from '../src/types.ts'
import { saveMcpConfigurations } from '../src/mcp-configurations.ts'
import { protectedCredentials } from '../src/credential-protection.ts'

/** @returns 每次测试独占的存储、目录和生命周期替身；不读真实账号或启动 MCP。 */
function fixture() {
  const records = new Map<CredentialKey, CredentialRecord>()
  const counts = { writes: 0, reloads: 0 }
  const key = (id: string) => credentialKey('fixture', id)
  const credentials = protectedCredentials({
    readRecord: key => Promise.resolve(records.get(key)),
    modifyRecord: async (recordKey, update) => {
      counts.writes++
      if (recordKey === key('fails')) throw new Error('storage failed with must-not-leak-secret')
      const next = await update(records.get(recordKey))
      if (next) records.set(recordKey, next)
      return next
    },
  })
  const client = { capability: (id: string) => Promise.resolve({ id, name: id, displayName: id, type: 'mcp',
    description: '', source: { kind: 'npm' }, versions: [], configuration: [
      { key: 'URL', description: '服务地址', required: true, secret: false, schema: { type: 'string' } },
    ], secrets: [{ key: 'TOKEN', description: '个人令牌', required: true, scope: 'user' }] }) }
  const lifecycle = {
    configureMany: async <T>(_ids: string[], update: () => Promise<T>) => { counts.reloads++; return update() },
    list: () => Promise.resolve(['jira', 'wiki', 'fails'].map((id): InstalledCapability =>
      ({ id, version: '1.0.0', installed: true, enabled: true, activation: 'active' }))),
  }
  const row = (id: string, token: string) => ({ id, values: { URL: `${id}.internal` }, secrets: { TOKEN: token } })
  return { records, counts, credentials, client, lifecycle, key, row }
}

void test('任何一项不合法时整批零写入、零重载；拒绝重复资源与客户端伪造字段定义', async () => {
  const f = fixture()
  const save = (configurations: unknown[]) => saveMcpConfigurations({ configurations }, f.lifecycle, f.client, f.credentials, f.key)
  await assert.rejects(save([f.row('jira', 'jira-token'), { id: 'wiki', values: {}, secrets: {} }]), { code: 'HUB_CONFIGURATION_REQUIRED' })
  await assert.rejects(save([f.row('jira', 'one'), f.row('jira', 'two')]), { code: 'HUB_REQUEST_INVALID' })
  await assert.rejects(save([{ ...f.row('jira', 'one'), fields: [] }]), { code: 'HUB_REQUEST_INVALID' })
  assert.deepEqual(f.counts, { writes: 0, reloads: 0 })
})

void test('同名 TOKEN 按资源隔离，空秘密保留各自旧值；整批只协调一次', async () => {
  const f = fixture()
  for (const id of ['jira', 'wiki']) f.records.set(f.key(id), { kind: 'grant', payload: { values: {}, secrets: { TOKEN: `${id}-old` } } })
  const result = await saveMcpConfigurations({ configurations: [f.row('jira', 'jira-new'), { ...f.row('wiki', ''), secrets: {} }] }, f.lifecycle, f.client, f.credentials, f.key)
  assert.deepEqual(f.counts, { writes: 2, reloads: 1 })
  assert.deepEqual(f.records.get(f.key('jira')), { kind: 'grant', payload: { values: { URL: 'jira.internal' }, secrets: { TOKEN: 'jira-new' } } })
  assert.deepEqual(f.records.get(f.key('wiki')), { kind: 'grant', payload: { values: { URL: 'wiki.internal' }, secrets: { TOKEN: 'wiki-old' } } })
  assert.deepEqual(result.results.map(row => row.saved), [true, true])
  assert.equal(JSON.stringify(result).includes('jira-new'), false)
})

void test('存储部分失败逐项报告，继续保存其他项，不泄漏底层错误或谎称整体回滚', async () => {
  const f = fixture()
  const result = await saveMcpConfigurations({ configurations: [f.row('fails', 'one'), f.row('jira', 'two')] }, f.lifecycle, f.client, f.credentials, f.key)
  assert.deepEqual(f.counts, { writes: 2, reloads: 1 })
  assert.equal(f.records.has(f.key('jira')), true)
  assert.deepEqual(result.results, [
    { id: 'fails', saved: false, error: 'HUB_CONFIGURATION_STORE_FAILED', activation: 'active' },
    { id: 'jira', saved: true, activation: 'active' },
  ])
  assert.equal(JSON.stringify(result).includes('must-not-leak'), false)
})
