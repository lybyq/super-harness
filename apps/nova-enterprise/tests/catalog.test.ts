/** Host-side domain admission, configuration validation, and safe display snapshots. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { catalog, configuration, fields, summary } from '../src/catalog.ts'

const capability = () => ({
  id: 'jira-mcp', type: 'mcp', displayName: 'Jira MCP', description: 'Intranet issue tracker',
  source: { kind: 'npm', locator: '@nova/jira-mcp' },
  versions: [{ version: '1.2.3', recommended: true, runtimeBindings: { 'deepseek-harness': { type: 'mcp' } } }],
  configuration: [
    { key: 'JIRA_URL', required: true, secret: false, description: 'Server URL', schema: { type: 'string', minLength: 1 } },
    { key: 'LIMIT', required: false, secret: false, schema: { type: 'integer', minimum: 1, maximum: 100 } },
    { key: 'READ_ONLY', required: true, secret: false, schema: { type: 'boolean' } },
  ],
  secrets: [{ key: 'JIRA/TOKEN', required: true, scope: 'user', description: 'Personal access token' }],
})

test('catalog snapshot reports a declared binding without claiming installation', () => {
  assert.deepEqual(catalog({ data: [capability()], total: 1 }), { data: [{
    id: 'jira-mcp', type: 'mcp', name: 'Jira MCP', description: 'Intranet issue tracker',
    source: 'npm', version: '1.2.3', hasRuntimeBinding: true, installed: false,
  }], total: 1 })
})
test('Claude-only and unversioned capabilities remain unbound', () => {
  const doc = capability(); doc.versions[0].runtimeBindings = { 'claude-code': {} }
  assert.equal(summary(doc).hasRuntimeBinding, false)
  doc.versions = []; assert.equal(summary(doc).hasRuntimeBinding, false)
})
test('domain admission rejects traversal IDs and unknown capability types', () => {
  assert.throws(() => summary({ ...capability(), id: '../secret' }), { code: 'HUB_CAPABILITY_ID_INVALID' })
  assert.throws(() => catalog({ data: [{ ...capability(), type: 'trusted-by-client' }], total: 1 }), { code: 'HUB_RESPONSE_INVALID' })
})
test('secret reference keys do not need to be POSIX environment names', () => {
  assert.equal(fields(capability()).at(-1).key, 'JIRA/TOKEN')
})
test('required values, bounded numbers, and secrets are validated independently', () => {
  const definitions = fields(capability())
  assert.deepEqual(configuration(definitions, { JIRA_URL: 'https://jira.invalid', LIMIT: 50, READ_ONLY: false }, { 'JIRA/TOKEN': 'fixture-secret' }), {
    values: { JIRA_URL: 'https://jira.invalid', LIMIT: 50, READ_ONLY: false }, secrets: { 'JIRA/TOKEN': 'fixture-secret' },
  })
  assert.throws(() => configuration(definitions, { JIRA_URL: '', READ_ONLY: true }, {}), { code: 'HUB_CONFIGURATION_REQUIRED' })
  assert.throws(() => configuration(definitions, { JIRA_URL: 'x', LIMIT: 101, READ_ONLY: true }, { 'JIRA/TOKEN': 's' }), { code: 'HUB_CONFIGURATION_INVALID' })
  assert.throws(() => configuration(definitions, { JIRA_URL: 'x', READ_ONLY: 'true' }, { 'JIRA/TOKEN': 's' }), { code: 'HUB_CONFIGURATION_INVALID' })
})
test('saved secrets are retained only in secret fields, never merged into values', () => {
  const definitions = fields(capability())
  assert.deepEqual(configuration(definitions, { JIRA_URL: 'x', READ_ONLY: true }, {}, { 'JIRA/TOKEN': 'old' }).secrets, { 'JIRA/TOKEN': 'old' })
  assert.throws(() => configuration(definitions, { JIRA_URL: 'x', READ_ONLY: true, 'JIRA/TOKEN': 's' }, {}), { code: 'HUB_CONFIGURATION_INVALID' })
  assert.throws(() => configuration(definitions, { JIRA_URL: 'x', READ_ONLY: true, EXTRA: 1 }, {}), { code: 'HUB_CONFIGURATION_INVALID' })
})
test('unknown schema constraints cannot be bypassed by saving a partial form', () => {
  for (const spec of [{ type: 'object' }, { type: 'string', pattern: '.*' }, { type: 'string', format: 'custom' }, { $ref: '#/$defs/auth' }]) {
    const doc = capability(); doc.configuration[0].schema = spec
    assert.throws(() => fields(doc), { code: 'HUB_CONFIG_SCHEMA_UNSUPPORTED' })
  }
})
test('scope mismatch and duplicate keys fail before a credential write', () => {
  const doc = capability(); doc.secrets[0].scope = 'project'
  assert.throws(() => fields(doc), { code: 'HUB_CONFIG_SCOPE_UNSUPPORTED' })
  doc.secrets[0].scope = 'user'; doc.secrets[0].key = 'JIRA_URL'
  assert.throws(() => fields(doc), { code: 'HUB_RESPONSE_INVALID' })
})
test('secret schema defaults are not returned as configuration metadata', () => {
  const doc = capability(); doc.configuration[0] = { key: 'PASSWORD', required: false, secret: true, schema: { type: 'string', default: 'fixture-secret' } }
  assert.equal(JSON.stringify(fields(doc)).includes('fixture-secret'), false)
})
test('enum choices and string limits are enforced on the Host', () => {
  const doc = capability(); doc.configuration[0].schema = { type: 'string', minLength: 2, maxLength: 3, enum: ['abc'] }
  const definitions = fields(doc)
  for (const value of ['a', 'abcd', 'xyz']) assert.throws(() => configuration(definitions, { JIRA_URL: value, READ_ONLY: true }, { 'JIRA/TOKEN': 's' }), { code: 'HUB_CONFIGURATION_INVALID' })
})

test('URI configuration is validated without claiming an outbound-network policy', () => {
  const doc = capability(); doc.configuration[0].schema = { type: 'string', format: 'uri' }
  const definitions = fields(doc)
  assert.equal(configuration(definitions, { JIRA_URL: 'https://jira.invalid', READ_ONLY: true }, { 'JIRA/TOKEN': 's' }).values.JIRA_URL, 'https://jira.invalid')
  for (const value of ['not a url', '/relative', 'https://jira.invalid/with space']) assert.throws(() => configuration(definitions, { JIRA_URL: value, READ_ONLY: true }, { 'JIRA/TOKEN': 's' }), { code: 'HUB_CONFIGURATION_INVALID' })
})
test('string arrays enforce item constraints, size, and uniqueness', () => {
  const doc = capability(); doc.configuration.push({ key: 'PROJECTS', required: true, secret: false, schema: { type: 'array', items: { type: 'string', minLength: 1, enum: ['A', 'B'] }, minItems: 1, maxItems: 2, uniqueItems: true } })
  const definitions = fields(doc)
  const check = PROJECTS => configuration(definitions, { JIRA_URL: 'x', READ_ONLY: true, PROJECTS }, { 'JIRA/TOKEN': 's' })
  assert.deepEqual(check(['A', 'B']).values.PROJECTS, ['A', 'B'])
  for (const value of [[], ['A', 'A'], ['A', 'B', 'A'], ['C'], [1]]) assert.throws(() => check(value), { code: 'HUB_CONFIGURATION_INVALID' })
  doc.configuration.at(-1).schema.items = { type: 'object' }
  assert.throws(() => fields(doc), { code: 'HUB_CONFIG_SCHEMA_UNSUPPORTED' })
})
test('恶意深层数组声明不会递归耗尽调用栈，而是返回受控错误码', () => {
  let nested = { type: 'string' }
  for (let depth = 0; depth < 10000; depth += 1) nested = { type: 'array', items: nested }
  assert.throws(() => fields({ configuration: [{ key: 'LIST', required: true, secret: false, schema: nested }], secrets: [] }), { code: 'HUB_CONFIG_SCHEMA_UNSUPPORTED' })
})

test('catalog accepts status-free documents and discards legacy catalog status', () => {
  for (const status of ['needs-review', 'disabled', 'experimental']) {
    assert.deepEqual(summary({ ...capability(), status }), summary(capability()))
    assert.equal(Object.hasOwn(summary({ ...capability(), status }), 'status'), false)
  }
})
