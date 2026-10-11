/** 网络与安全错误使用同一缓存代理验证，禁止认证失败被旧记录掩盖。 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { offlineClient } from '../src/offline-client.ts'
import { HubError } from '../src/hub-client.ts'

const doc = { id: 'test-skill', displayName: '测试', description: '', type: 'skill', source: { kind: 'gitlab' },
  versions: [{ version: '1.0.0', runtimeBindings: { 'deepseek-harness': {} } }], configuration: [], secrets: [] }
function fixture() {
  const records = new Map()
  const ctx = { credentials: { readRecord: async key => records.get(key),
    modifyRecord: async (key, action) => { records.set(key, await action(records.get(key))) } } }
  let error
  const source = { capability: async () => { if (error) throw error; return structuredClone(doc) },
    search: async () => { if (error) throw error; return { data: [structuredClone(doc)], total: 1 } } }
  const options = { offlineMaxEntries: 5, offlineMaxBytes: 65536, offlineMaxAgeMs: 100000, maxResponseBytes: 65536 }
  return { ctx, source, options, records, fail: (value) => { error = value }, client: offlineClient(ctx, source, 'fixture', options) }
}
test('断网与重启可恢复已缓存目录和能力，且缓存按 Hub 隔离', async () => {
  const f = fixture()
  await f.client.search({ q: '' }); await f.client.capability(doc.id)
  f.fail(new HubError('HUB_UNAVAILABLE'))
  const restored = offlineClient(f.ctx, f.source, 'fixture', f.options)
  assert.deepEqual(await restored.capability(doc.id), doc)
  assert.equal(restored.status().offline, true)
  assert.equal((await restored.search({ q: '' })).total, 1)
  await assert.rejects(offlineClient(f.ctx, f.source, 'different-hub', f.options).capability(doc.id), { code: 'HUB_OFFLINE_CACHE_MISS' })
})
test('401、404、损坏响应、取消不得回退缓存', async () => {
  const f = fixture(); await f.client.capability(doc.id)
  for (const error of [new HubError('HUB_HTTP_ERROR', 401), new HubError('HUB_HTTP_ERROR', 404), new HubError('HUB_RESPONSE_INVALID'), new HubError('HUB_CANCELLED')]) {
    f.fail(error); await assert.rejects(f.client.capability(doc.id), error)
  }
  f.fail(new HubError('HUB_UNAVAILABLE'))
  await assert.rejects(f.client.capability('missing'), { code: 'HUB_OFFLINE_CACHE_MISS' })
})
test('过期和破损本地记录明确失败，界面不伪造空目录', async () => {
  const f = fixture(); await f.client.capability(doc.id)
  f.fail(new HubError('HUB_TIMEOUT'))
  f.records.get('fixture').payload.entries[0].date = 1
  await assert.rejects(f.client.capability(doc.id), { code: 'HUB_OFFLINE_CACHE_MISS' })
  f.records.get('fixture').payload.entries = [{}]
  await assert.rejects(f.client.capability(doc.id), { code: 'HUB_LOCAL_STATE_INVALID' })
})
