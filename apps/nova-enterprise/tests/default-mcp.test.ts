/** 默认清单准入与公开默认参数测试；不安装资源、不读生产配置或执行第三方脚本。 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { defaultMcpPlan, defaultMcpJournal, readDefaultMcpPlan } from '../src/default-mcp.ts'
import { fields, configuration } from '../src/catalog.ts'

void test('默认清单只接受准确资源 ID 和精确版本，签名随内容改变', () => {
  const plan = defaultMcpPlan({ revision: 'internal-1', mcp: [{ id: 'jira' }, { id: 'wiki', version: '1.2.3' }] })
  assert.equal(plan.mcp.length, 2)
  assert.equal(plan.signature.length, 64)
  assert.notEqual(plan.signature, defaultMcpPlan({ revision: 'internal-1', mcp: [{ id: 'jira' }] }).signature)
  for (const mcp of [[{ id: 'jira' }, { id: 'jira' }], [{ id: 'jira', version: 'latest' }],
    [{ id: 'jira', version: '^1.2.3' }], [{ id: 'jira', command: 'arbitrary' }]]) {
    assert.throws(() => defaultMcpPlan({ revision: 'internal-1', mcp }), { code: 'HUB_DEFAULT_MCP_INVALID' })
  }
  assert.throws(() => defaultMcpPlan({ revision: 'x', mcp: [{ id: '../secret' }] }))
  assert.throws(() => defaultMcpPlan({ revision: '', mcp: [] }))
  assert.throws(() => defaultMcpPlan({ revision: 'x', mcp: [], token: 'not-allowed' }))
})

void test('空清单路径禁用初始化，文件错误只报告稳定码', async () => {
  assert.equal(await readDefaultMcpPlan(''), undefined)
  await assert.rejects(readDefaultMcpPlan(new URL('./fixtures/nonexistent-default-mcp.json', import.meta.url).pathname), { code: 'HUB_DEFAULT_MCP_INVALID' })
})

void test('处理记录兼容缺失旧值，拒绝错误体或密钥冒充错误码', () => {
  assert.equal(defaultMcpJournal(undefined), undefined)
  const row = { revision: 'x', signature: 'a'.repeat(64), dismissed: true, errors: { jira: 'HUB_SOURCE_FAILED' } }
  assert.deepEqual(defaultMcpJournal(row), row)
  assert.throws(() => defaultMcpJournal({ ...row, errors: { jira: 'failed with token=secret' } }), { code: 'HUB_LOCAL_STATE_INVALID' })
})

void test('公开参数使用已验证默认值，秘密默认值不显示或注入', () => {
  const doc = { configuration: [
    { key: 'LIMIT', required: true, secret: false, schema: { type: 'integer', minimum: 1, default: 10 } },
    { key: 'TOKEN', required: true, secret: true, schema: { type: 'string', default: 'must-not-leak' } },
  ], secrets: [] }
  const definitions = fields(doc)
  assert.equal(JSON.stringify(definitions).includes('must-not-leak'), false)
  assert.throws(() => configuration(definitions, {}, {}), { code: 'HUB_CONFIGURATION_REQUIRED' })
  assert.deepEqual(configuration(definitions, {}, { TOKEN: 'own-token' }), { values: { LIMIT: 10 }, secrets: { TOKEN: 'own-token' } })
  doc.configuration[0]!.schema.default = 0
  assert.throws(() => fields(doc), { code: 'HUB_CONFIG_SCHEMA_UNSUPPORTED' })
})
