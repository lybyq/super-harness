/** 使用真实回环 HTTP 和凭据 Provider 测试替身验证 Host 路由，禁止访问生产账号。 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { apply, Config } from '../src/index.ts'

const doc = {
  id: 'jira-mcp', type: 'mcp', displayName: 'Jira MCP', description: '', source: { kind: 'npm' },
  versions: [{ version: '1.0.0', recommended: true, runtimeBindings: { 'deepseek-harness': {} } }],
  configuration: [{ key: 'URL', required: true, secret: false, schema: { type: 'string' } }],
  secrets: [{ key: 'TOKEN', required: true, scope: 'user' }],
}

test('deployment limits are resolved and reject fractional or zero budgets', () => {
  assert.deepEqual(Config({}), { seedBuiltinThemes: false, secretProtection: 'none', apiBaseUrl: '', authentication: 'none', tokenEnvironmentVariable: 'NOVA_HUB_TOKEN', allowInsecureHttp: false, timeoutMs: 15000, maxResponseBytes: 2097152, maxRequestBytes: 65536, engineEntry: '', deploymentFile: '', resourceHome: '', maxHistory: 10, teamProvider: 'spawn', teamStartupTimeoutMs: 60000, offlineMaxEntries: 200, offlineMaxBytes: 16777216, offlineMaxAgeMs: 86400000, activationTimeoutMs: 30000, allowPublishing: false, publishingTimeoutMs: 120000 })
  assert.throws(() => Config({ timeoutMs: 0 }))
  assert.throws(() => Config({ timeoutMs: 1.5 }))
  assert.throws(() => Config({ authentication: 'auto' }))
})

/** @param t 测试生命周期。 @param documents 本地 Hub 替身返回的文档。 @returns 隔离路由和凭据的回环测试环境。 */
async function fixture(t, documents = {}, deployment = {}) {
  const requests = []
  const server = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined
    requests.push({ url: request.url, authorization: request.headers.authorization, method: request.method, body })
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify(request.url === '/api/v1/roles?view=published' ? documents.roles
      : request.url === '/api/v1/resolve' ? documents.resolve
        : request.url.startsWith('/api/v1/catalog/search') ? { data: [documents.capability ?? doc], total: 1 }
          : documents.capability ?? doc))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) })
  const routes = new Map(), records = new Map(), effects = [], logs = []
  const credentials = {
    readRecord: async key => records.get(key),
    modifyRecord: async (key, mutate) => {
      const next = await mutate(records.get(key)); if (next !== undefined) records.set(key, next); return next
    },
  }
  const base = `http://127.0.0.1:${server.address().port}/api/v1`
  const tokenEnvironmentVariable = `NOVA_HUB_TEST_TOKEN_${server.address().port}`
  process.env[tokenEnvironmentVariable] = 'fixture-hub-secret'
  t.after(() => { Reflect.deleteProperty(process.env, tokenEnvironmentVariable) })
  apply({
    // 本路由替身不提供 tools，依赖保持未满足；真实挂载／晚加载由 composition 测试覆盖。
    inject: () => undefined,
    on: () => () => {},
    get: () => undefined,
    credentials, logger: { warn: (...args) => { logs.push(args) } },
    connection: { fetch: { register: (route) => { routes.set(route.path, route); return async () => { routes.delete(route.path) } } } },
    effect: (fn) => { effects.push(fn()) },
  }, Config({ apiBaseUrl: base, authentication: 'bearer', tokenEnvironmentVariable,
    allowInsecureHttp: true, timeoutMs: 2000, maxResponseBytes: 65536, maxRequestBytes: 4096, ...deployment }))
  t.after(async () => { for (const dispose of effects.reverse()) await dispose() })
  async function call(path, data = undefined) {
    const route = routes.get(`/api/nova-hub/${path.split('?')[0]}`)
    const response = await route.fetch(new Request(`http://desktop.invalid/api/nova-hub/${path}`, {
      method: data === undefined ? 'GET' : 'POST', ...(data === undefined ? {} : { body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } }),
    }))
    assert.equal(response.headers.get('cache-control'), 'no-store')
    return response.json()
  }
  return { routes, records, logs, effects, call, base, requests, tokenEnvironmentVariable }
}

test('unconfigured Hub refuses catalog access and exposes no token', async (t) => {
  const f = await fixture(t, {}, { apiBaseUrl: '' })
  assert.deepEqual(await f.call('connection'), { ok: true, value: { configured: false, authentication: 'bearer' } })
  assert.deepEqual(await f.call('catalog'), { ok: false, error: { code: 'HUB_NOT_CONFIGURED' } })
  assert.equal(f.requests.length, 0)
})
test('administrator connection supports search and keeps capability secrets Host-owned', async (t) => {
  const f = await fixture(t)
  const settings = await f.call('connection')
  assert.equal(settings.ok, true); assert.equal(JSON.stringify(settings).includes('fixture-hub-secret'), false)
  const found = await f.call('catalog?q=jira&type=mcp')
  assert.equal(found.value.data[0].id, 'jira-mcp'); assert.equal(found.value.data[0].installed, false)
  assert.equal(f.requests[0].authorization, 'Bearer fixture-hub-secret')
  const saved = await f.call('configuration', { id: 'jira-mcp', values: { URL: 'https://jira.invalid' }, secrets: { TOKEN: 'fixture-jira-secret' } })
  assert.equal(saved.ok, true); assert.equal(saved.value.configurationSaved, true)
  assert.deepEqual(saved.value.configuredSecrets, ['TOKEN'])
  assert.equal(JSON.stringify(saved).includes('fixture-jira-secret'), false)
  const read = await f.call('configuration?id=jira-mcp')
  assert.deepEqual(read.value.values, { URL: 'https://jira.invalid' })
  assert.equal(JSON.stringify(read).includes('fixture-jira-secret'), false)
  const retained = await f.call('configuration', { id: 'jira-mcp', values: { URL: 'https://jira2.invalid' }, secrets: {} })
  assert.equal(retained.ok, true)
  assert.deepEqual(settings.value, { configured: true, authentication: 'bearer' })
  assert.equal(JSON.stringify(f.logs).includes('fixture-'), false)
})
test('user cannot replace the administrator connection or persist a Hub token', async (t) => {
  const f = await fixture(t)
  assert.deepEqual(f.routes.get('/api/nova-hub/connection').methods, ['GET'])
  assert.deepEqual(await f.call('connection', { apiBaseUrl: 'https://another.invalid/api/v1', token: 'untrusted' }), { ok: false, error: { code: 'HUB_CONNECTION_MANAGED' } })
  assert.equal(f.records.size, 0)
  await f.call('catalog')
  assert.equal(f.requests[0].authorization, 'Bearer fixture-hub-secret')
})

test('administrator Hub change keeps capability secrets isolated by API URL', async (t) => {
  const first = await fixture(t)
  await first.call('configuration', { id: 'jira-mcp', values: { URL: 'one' }, secrets: { TOKEN: 'secret-one' } })
  const second = await fixture(t)
  for (const [key, record] of first.records) second.records.set(key, record)
  const fresh = await second.call('configuration?id=jira-mcp')
  assert.equal(fresh.value.configurationSaved, false)
  assert.deepEqual(fresh.value.configuredSecrets, [])
})

test('open Hub omits authentication and ignores ambient bearer credentials', async (t) => {
  const f = await fixture(t, {}, { authentication: 'none' })
  assert.equal((await f.call('catalog')).ok, true)
  assert.equal(f.requests[0].authorization, undefined)
  assert.equal([...f.records.values()].some(record => record.payload?.secrets), false)
})

test('bearer mode refuses missing or invalid administrator credentials before networking', async (t) => {
  const f = await fixture(t)
  Reflect.deleteProperty(process.env, f.tokenEnvironmentVariable)
  assert.deepEqual(await f.call('catalog'), { ok: false, error: { code: 'HUB_AUTH_REQUIRED' } })
  process.env[f.tokenEnvironmentVariable] = 'secret\r\nX-Injected: 1'
  assert.deepEqual(await f.call('catalog'), { ok: false, error: { code: 'HUB_CREDENTIAL_UNAVAILABLE' } })
  assert.equal(f.requests.length, 0)
  assert.equal(JSON.stringify(f.logs).includes('secret'), false)
})
test('invalid configuration cannot commit values or report saving', async (t) => {
  const f = await fixture(t)
  const failed = await f.call('configuration', { id: 'jira-mcp', values: { URL: 'x' }, secrets: {} })
  assert.deepEqual(failed, { ok: false, error: { code: 'HUB_CONFIGURATION_REQUIRED' } })
  assert.equal([...f.records.values()].some(record => record.payload?.values || record.payload?.secrets), false)
})
test('invalid deployment URL fails at plugin load rather than inviting user configuration', async (t) => {
  await assert.rejects(fixture(t, {}, { apiBaseUrl: 'https://user:secret@hub.invalid/api/v1' }), { code: 'HUB_CONFIG_INVALID' })
  await assert.rejects(fixture(t, {}, { allowInsecureHttp: false }), { code: 'HUB_CONFIG_INVALID' })
})
test('all route registrations are removed by plugin disposal', async (t) => {
  const f = await fixture(t)
  assert.equal(f.routes.size, 18)
  for (const dispose of f.effects.splice(0).reverse()) await dispose()
  assert.equal(f.routes.size, 0)
})

test('URI 和字符串数组通过真实配置路由校验、持久化及脱敏读取', async (t) => {
  const document = structuredClone(doc)
  document.configuration[0].schema = { type: 'string', format: 'uri' }
  document.configuration.push({ key: 'PROJECTS', required: true, secret: false, schema: { type: 'array', items: { type: 'string' }, minItems: 1, uniqueItems: true } })
  const f = await fixture(t, { capability: document })
  const saved = await f.call('configuration', { id: 'jira-mcp', values: { URL: 'https://jira.invalid', PROJECTS: ['NOVA', 'DSH'] }, secrets: { TOKEN: 'fixture-jira' } })
  assert.deepEqual(saved.value.values.PROJECTS, ['NOVA', 'DSH'])
  assert.equal(JSON.stringify(saved).includes('fixture-jira'), false)
  const failed = await f.call('configuration', { id: 'jira-mcp', values: { URL: '/relative', PROJECTS: ['NOVA'] }, secrets: {} })
  assert.equal(failed.error.code, 'HUB_CONFIGURATION_INVALID')
  assert.deepEqual((await f.call('configuration?id=jira-mcp')).value.values.PROJECTS, ['NOVA', 'DSH'])
})

test('真实角色路由显式使用 DeepSeek Runtime，组合解析结果不回传密钥', async (t) => {
  const role = { apiVersion: 'harness.nova/v1', kind: 'RoleProfile', metadata: { id: 'frontend', displayName: '前端工程师', version: '1.0.0' }, defaults: { token: 'never-return-secret' } }
  const roles = [{ id: 'frontend', displayName: '前端工程师', published: true, versions: [{ published: true, document: role }] }]
  const resolve = { role, capabilities: [{ id: 'jira-mcp', version: '1.0.0', enabled: true, reason: [], configuration: { password: 'never-return-secret' } }],
    versions: { 'jira-mcp': '1.0.0' }, compatibility: { 'jira-mcp': true }, installationOrder: ['jira-mcp'], permissions: [],
    requiredSecrets: ['TOKEN'], requiredConfiguration: ['URL'], warnings: [], conflicts: [], checksum: 'b'.repeat(64) }
  const f = await fixture(t, { roles, resolve })
  assert.equal((await f.call('roles')).value[0].selectable, true)
  const result = await f.call('role-plan', { roles: ['frontend'] })
  assert.equal(result.ok, true); assert.equal(result.value.applied, false)
  assert.equal(JSON.stringify(result).includes('never-return-secret'), false)
  const sent = f.requests.find(request => request.url === '/api/v1/resolve')
  assert.deepEqual(sent.body, { runtime: 'deepseek-harness', scope: 'user', role: 'frontend', roles: ['frontend'] })
  const failed = await f.call('role-plan', { roles: ['frontend'], token: 'do-not-forward' })
  assert.equal(failed.error.code, 'HUB_ROLE_SELECTION_INVALID')
  assert.equal(f.requests.filter(request => request.url === '/api/v1/resolve').length, 1)
  assert.deepEqual(f.routes.get('/api/nova-hub/role-plan').methods, ['POST'])
})
