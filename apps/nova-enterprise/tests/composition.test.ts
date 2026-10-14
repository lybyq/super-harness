/** 真正经官方 boot/Loader/cordis.yml 挂载企业插件；可选本地 Hub 测试不调用模型、不依赖生产密钥。 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { boot } from '@deepseek-ai/dsh-app-boot'

const configPath = fileURLToPath(new URL('./fixtures/cordis.yml', import.meta.url))
const { c: tarCreate } = createRequire(new URL('../../../package.json', import.meta.url))('tar')
/** @param {object} ctx 真实启动上下文。 @param {string} path 注册的路由名。 @param {object} [data] 写请求。 @returns {Promise<object>} 脱敏路由信封。 */
async function call(ctx, path, data) {
  const route = ctx.get('testRoutes').get(`/api/nova-hub/${path}`)
  const response = await route.fetch(new Request(`http://desktop.invalid/api/nova-hub/${path}`, {
    method: data ? 'POST' : 'GET', ...(data ? { body: JSON.stringify(data) } : {}),
  }))
  return response.json()
}

test('真实 Loader 组合挂载企业路由，关闭后完整撤销', async () => {
  const ctx = await boot('harness-test', configPath)
  const routes = ctx.get('testRoutes')
  try {
    assert.equal(routes.size, 20)
    assert.equal((await call(ctx, 'connection')).ok, true)
    assert.deepEqual(ctx.tools.schemas().map(item => item.name), ['harness_prepare_resource'])
    // 模型看到的声明固定，防止未来改动静默把“仅草稿”变成执行／远端发布工具。
    assert.deepEqual(ctx.tools.schemas()[0], {
      name: 'harness_prepare_resource',
      description: '将用户请求创建的 skill、MCP 或 Host 插件文本保存为待检查草稿。不会执行代码或发布；用户在 AI Hub 的开发与发布中检查、配置目标并明确确认。不能包含密码或 Token。',
      parameters: { type: 'object', properties: { id: { type: 'string' }, type: { type: 'string', enum: ['skill', 'mcp', 'plugin'] }, version: { type: 'string' }, files: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'], additionalProperties: false } } }, required: ['id', 'type', 'version', 'files'], additionalProperties: false },
    })
  } finally { await ctx.fiber.dispose() }
  assert.equal(routes.size, 0)
})

test('工具服务晚于企业插件声明时仍注册草稿入口，关闭后不残留工具', async () => {
  const ctx = await boot('harness-late-tools-test', fileURLToPath(new URL('./fixtures/cordis-late-tools.yml', import.meta.url)))
  const tools = ctx.tools
  try { assert.deepEqual(tools.schemas().map(item => item.name), ['harness_prepare_resource']) }
  finally { await ctx.fiber.dispose() }
  assert.deepEqual(tools.schemas(), [])
})

test('隔离 npm MCP、GitLab 嵌套 Skill、原生 Plugin 的配置、注册、停用、回滚、卸载', {
  skip: !process.env.HARNESS_TEST_HUB_URL, timeout: 60000,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'harness-desktop-live-'))
  const originalUrl = process.env.HARNESS_TEST_HUB_URL
  const originalDeployment = process.env.HARNESS_TEST_DEPLOYMENT_FILE
  const archivePath = join(root, 'fixture.tgz')
  await tarCreate({ file: archivePath, gzip: true, cwd: fileURLToPath(new URL('./fixtures', import.meta.url)) }, ['mcp'])
  const archive = await readFile(archivePath)
  const fixtureDir = fileURLToPath(new URL('./fixtures', import.meta.url))
  await tarCreate({ file: join(root, 'skill.tgz'), gzip: true, cwd: fixtureDir }, ['skill'])
  await tarCreate({ file: join(root, 'plugin.tgz'), gzip: true, cwd: fixtureDir }, ['plugin'])
  const skillArchive = await readFile(join(root, 'skill.tgz'))
  const pluginArchive = await readFile(join(root, 'plugin.tgz'))
  const mcp = await (await fetch(`${originalUrl}/capabilities/mock-mcp`)).json()
  const skill = await (await fetch(`${originalUrl}/capabilities/mock-nested-skill`)).json()
  const plugin = structuredClone(mcp)
  plugin.id = 'native-test-plugin'; plugin.type = 'plugin'; plugin.source.locator = '@nova-cbb/mock-plugin'; plugin.source.packageName = '@nova-cbb/mock-plugin'
  plugin.configuration = [{ key: 'VALUE', required: true, secret: false, schema: { type: 'string' } }]
  plugin.versions[0].runtimeBindings['deepseek-harness'] = { type: 'plugin', compatibility: '*', configuration: { value: '${VALUE}' } }
  mcp.configuration = [{ key: 'URL', description: '测试服务地址', required: true, secret: false, schema: { type: 'string', format: 'uri' } }]
  mcp.secrets = [{ key: 'TOKEN', description: '测试账号令牌', required: true, scope: 'user' }]
  const server = createServer(async (request, response) => {
    if (request.url === '/fixture.tgz') { response.end(archive); return }
    if (request.url?.startsWith('/skill.tgz')) { response.end(skillArchive); return }
    if (request.url === '/plugin.tgz') { response.end(pluginArchive); return }
    response.setHeader('Content-Type', 'application/json')
    if (request.url === '/api/v1/capabilities/mock-mcp') { response.end(JSON.stringify(mcp)); return }
    if (request.url === '/api/v1/capabilities/mock-nested-skill') { response.end(JSON.stringify(skill)); return }
    if (request.url === '/api/v1/capabilities/native-test-plugin') { response.end(JSON.stringify(plugin)); return }
    const remote = await fetch(`${new URL(originalUrl).origin}${request.url}`)
    response.statusCode = remote.status; response.end(await remote.text())
  })
  await new Promise(resolve => server.listen(0, 'localhost', resolve))
  const origin = `http://localhost:${server.address().port}`
  mcp.versions[0].artifact.url = `${origin}/fixture.tgz`
  mcp.versions[0].integrity = `sha512-${createHash('sha512').update(archive).digest('base64')}`
  skill.versions[0].artifact = { kind: 'gitlab-archive', url: `${origin}/skill.tgz?sha=${skill.versions[0].commitSha}`, entryPath: 'skills/example/SKILL.md' }
  skill.versions[0].archiveSha256 = createHash('sha256').update(skillArchive).digest('hex')
  plugin.versions[0].artifact.url = `${origin}/plugin.tgz`
  plugin.versions[0].integrity = `sha512-${createHash('sha512').update(pluginArchive).digest('base64')}`
  const deployment = join(root, 'deployment.yaml')
  await writeFile(deployment, (await readFile(originalDeployment, 'utf8')).replace(originalUrl, `${origin}/api/v1`))
  process.env.HARNESS_TEST_HUB_URL = `${origin}/api/v1`
  process.env.HARNESS_TEST_DEPLOYMENT_FILE = deployment
  process.env.HARNESS_TEST_RESOURCE_HOME = root
  const recordFile = join(root, 'test-records.json')
  await writeFile(recordFile, '[]')
  process.env.HARNESS_TEST_RECORD_FILE = recordFile
  let ctx = await boot('harness-test', configPath)
  const mutate = async (action, id) => {
    const result = await call(ctx, 'lifecycle', { action, ...(id ? { id } : {}) })
    assert.equal(result.ok, true, JSON.stringify(result))
    return result.value
  }
  try {
    const installed = await mutate('add', 'mock-mcp')
    assert.equal(installed.data.find(item => item.id === 'mock-mcp').activation, 'needs-configuration')
    assert.deepEqual(ctx.tools.schemas().map(tool => tool.name), ['harness_prepare_resource'])
    const settings = await call(ctx, 'configuration', { id: 'mock-mcp', values: { URL: 'https://fixture.invalid' }, secrets: { TOKEN: 'test-only-token' } })
    assert.equal(settings.ok, true, JSON.stringify(settings))
    assert.equal(JSON.stringify(settings).includes('test-only-token'), false)
    assert.equal((await call(ctx, 'installed')).value.data.find(item => item.id === 'mock-mcp').activation, 'active')
    assert.ok(ctx.tools.schemas().some(tool => tool.name.startsWith('mcp__hub_')))
    await mutate('update', 'mock-mcp')
    assert.ok(ctx.tools.schemas().some(tool => tool.name.startsWith('mcp__hub_')))
    await mutate('add', 'mock-nested-skill')
    assert.ok((await ctx.skills.list()).some(skill => skill.path.includes('SKILL.md')))
    // 真实进程级组合关闭后让 Hub 与产物端点均离线，只能从持久化元数据和已校验 Store 恢复。
    await ctx.fiber.dispose()
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
    ctx = await boot('harness-test', configPath)
    for (let attempt = 0; attempt < 100 && !ctx.tools.schemas().some(tool => tool.name.startsWith('mcp__hub_')); attempt++) {
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    const resumed = await call(ctx, 'installed')
    assert.equal(resumed.ok, true, JSON.stringify(resumed))
    assert.ok(resumed.value.data.every(item => item.activation === 'active'), JSON.stringify(resumed))
    assert.ok(ctx.tools.schemas().some(tool => tool.name.startsWith('mcp__hub_')))
    assert.ok((await ctx.skills.list()).some(skill => skill.path.includes('SKILL.md')))
    await new Promise(resolve => server.listen(new URL(origin).port, 'localhost', resolve))
    await mutate('disable', 'mock-mcp')
    assert.deepEqual(ctx.tools.schemas().map(tool => tool.name), ['harness_prepare_resource'])
    await mutate('rollback')
    assert.ok(ctx.tools.schemas().some(tool => tool.name.startsWith('mcp__hub_')))
    assert.equal((await call(ctx, 'clear-secret', { id: 'mock-mcp', key: 'TOKEN' })).ok, true)
    assert.deepEqual(ctx.tools.schemas().map(tool => tool.name), ['harness_prepare_resource'])
    await mutate('remove', 'mock-mcp')
    assert.deepEqual(ctx.tools.schemas().map(tool => tool.name), ['harness_prepare_resource'])
    await mutate('remove', 'mock-nested-skill')
    assert.equal((await ctx.skills.list()).length, 0)
    await mutate('add', 'native-test-plugin')
    assert.equal((await call(ctx, 'configuration', { id: 'native-test-plugin', values: { VALUE: 'bound-value' }, secrets: {} })).ok, true)
    assert.equal(ctx.get('harnessFixtureValue'), 'bound-value')
    await mutate('remove', 'native-test-plugin')
    assert.equal(ctx.get('harnessFixtureValue'), undefined)
  } finally {
    await ctx.fiber.dispose()
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
    process.env.HARNESS_TEST_HUB_URL = originalUrl
    process.env.HARNESS_TEST_DEPLOYMENT_FILE = originalDeployment
    delete process.env.HARNESS_TEST_RESOURCE_HOME
    delete process.env.HARNESS_TEST_RECORD_FILE
    // 只清理 mkdtemp 返回的独立测试目录，不接触桌面或 CLI 的资源目录。
    await rm(root, { recursive: true, force: true })
  }
})
