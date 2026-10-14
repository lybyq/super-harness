/** 无模型、无生产账号的真实 Loader + 安装引擎 + 官方 stdio MCP 集成测试。 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { boot } from '@deepseek-ai/dsh-app-boot'
import type {} from '@deepseek-ai/dsh-tools'
import { object } from '../src/catalog.ts'
import { defaultMcpStatus, installed, mcpSaveResults } from '../src/client/api.ts'

const { c: tarCreate } = createRequire(import.meta.url)('tar') as typeof import('tar')

declare module '@deepseek-ai/cordis' {
  interface Context {
    testRoutes: Map<string, { fetch(request: Request): Promise<Response> }>
  }
}

void test('默认安装、批量配置、真实工具注册、停用、移除覆盖与跨启动恢复', { timeout: 120000 }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'nova-default-mcp-'))
  const disposals: (() => Promise<void>)[] = []
  t.after(async () => {
    for (const dispose of disposals.reverse()) await dispose()
    // 等待已释放的 Windows 文件句柄收尾；只删除本测试原子创建的临时目录。
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  })
  const archivePath = join(root, 'fixture.tgz')
  await tarCreate({ file: archivePath, gzip: true, cwd: fileURLToPath(new URL('./fixtures', import.meta.url)) }, ['mcp'])
  const archive = await readFile(archivePath)
  let origin = '', available = true
  const server = createServer((request, response) => {
    if (!available) { request.socket.destroy(); return }
    if (request.url === '/fixture.tgz') { response.end(archive); return }
    const id = request.url?.split('/').at(-1)
    if (!['first', 'second'].includes(id ?? '')) { response.statusCode = 404; response.end('{}'); return }
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ id, type: 'mcp', name: id, displayName: id, description: '',
      source: { sourceId: 'fixture', kind: 'npm', locator: '@nova-cbb/mock-mcp', packageName: '@nova-cbb/mock-mcp' },
      configuration: id === 'first' ? [{ key: 'URL', description: '测试地址', required: true, secret: false, schema: { type: 'string' } }] : [],
      secrets: id === 'first' ? [{ key: 'TOKEN', required: true, scope: 'user', description: '测试令牌' }] : [],
      versions: [{ version: '1.0.0', recommended: true, manifestChecksum: 'a'.repeat(64),
        integrity: `sha512-${createHash('sha512').update(archive).digest('base64')}`,
        artifact: { kind: 'npm-tarball', url: `${origin}/fixture.tgz` },
        dependencies: [], conflicts: [], runtimeBindings: { 'deepseek-harness': { type: 'mcp', compatibility: '*', configuration: { transport: 'stdio', bin: 'mock-mcp', args: [] } } } }],
    }))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  disposals.push(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() =>{  resolve() })) })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  origin = `http://127.0.0.1:${address.port}`
  const manifest = join(root, 'defaults.json'), deployment = join(root, 'deployment.json'), record = join(root, 'records.json')
  await writeFile(manifest, JSON.stringify({ revision: 'one', mcp: [{ id: 'first' }, { id: 'second' }, { id: 'missing' }] }))
  await writeFile(record, '[]')
  await writeFile(deployment, JSON.stringify({ apiVersion: 'harness.nova/v1', kind: 'DeploymentProfile',
    metadata: { id: 'fixture', displayName: 'fixture' }, hub: { url: `${origin}/api/v1` },
    downloads: { allowedHosts: ['127.0.0.1'], allowedRedirectHosts: [], maxArchiveBytes: 1000000,
      maxExtractedBytes: 1000000, maxFiles: 100, allowLifecycleScripts: false },
    sources: [{ id: 'fixture', displayName: 'fixture', type: 'npm', registry: origin, adapter: 'npm-compatible' }],
    runtime: { default: 'deepseek-harness', mode: 'integrated' }, trust: { allowedMaintainerTeams: [] },
  }))
  const environment = { HARNESS_TEST_HUB_URL: `${origin}/api/v1`, HARNESS_TEST_DEPLOYMENT_FILE: deployment,
    HARNESS_TEST_RESOURCE_HOME: root, HARNESS_TEST_RECORD_FILE: record, HARNESS_TEST_DEFAULT_MCP_FILE: manifest }
  const previous = Object.fromEntries(Object.keys(environment).map(key => [key, process.env[key]]))
  for (const [key, value] of Object.entries(environment)) process.env[key] = value
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = value
    }
  })
  const config = fileURLToPath(new URL('./fixtures/cordis.yml', import.meta.url))
  let ctx = await boot('nova-defaults-test', config)
  disposals.push(async () => { await ctx.fiber.dispose() })
  const call = async (path: string, data?: object) => {
    const route = ctx.get('testRoutes')?.get(`/api/nova-hub/${path}`)
    assert.ok(route)
    const response = await route.fetch(new Request(`http://fixture.invalid/api/nova-hub/${path}`, {
      method: data ? 'POST' : 'GET', ...(data ? { body: JSON.stringify(data) } : {}),
    }))
    const envelope = object(await response.json())
    assert.equal(envelope.ok, true, JSON.stringify(envelope))
    return envelope.value
  }
  const defaultsNow = async (data?: object) => defaultMcpStatus(await call('mcp-defaults', data))
  const startup = await defaultsNow()
  assert.equal(startup.items.find(row => row.id === 'first')?.activation, 'needs-configuration')
  assert.equal(startup.items.find(row => row.id === 'second')?.activation, 'active')
  assert.equal(startup.items.find(row => row.id === 'missing')?.installed, false)
  assert.ok(startup.items.find(row => row.id === 'missing')?.error)
  assert.equal(ctx.tools.schemas().filter(tool => tool.name.startsWith('mcp__')).length, 1)
  const saved = await call('mcp-configurations', { configurations: [{ id: 'first', values: { URL: 'test-url' }, secrets: { TOKEN: 'test-only-credential' } }] })
  assert.equal(mcpSaveResults(saved)[0]?.activation, 'active')
  assert.equal(JSON.stringify(saved).includes('test-only-credential'), false)
  assert.equal(JSON.stringify(await call('mcp-configurations')).includes('test-only-credential'), false)
  assert.equal(ctx.tools.schemas().filter(tool => tool.name.startsWith('mcp__')).length, 2)
  await call('lifecycle', { action: 'disable', id: 'second' })
  await call('lifecycle', { action: 'remove', id: 'first' })
  assert.equal(ctx.tools.schemas().filter(tool => tool.name.startsWith('mcp__')).length, 0)
  await ctx.fiber.dispose()
  ctx = await boot('nova-defaults-test', config)
  const recovered = await defaultsNow({ action: 'retry' })
  assert.equal(recovered.items.find(row => row.id === 'first')?.activation, 'removed')
  assert.equal(recovered.items.find(row => row.id === 'second')?.activation, 'disabled')
  assert.equal(ctx.tools.schemas().filter(tool => tool.name.startsWith('mcp__')).length, 0)
  await call('lifecycle', { action: 'enable', id: 'second' })
  available = false
  assert.equal((await defaultsNow({ action: 'retry' })).items.find(row => row.id === 'second')?.activation, 'active')
  await call('mcp-defaults', { action: 'dismiss' })
  assert.equal((await defaultsNow()).dismissed, true)
  await ctx.fiber.dispose()
  ctx = await boot('nova-defaults-test', config)
  assert.equal(installed(await call('installed')).find(row => row.id === 'second')?.activation, 'active')
  assert.equal(ctx.tools.schemas().filter(tool => tool.name.startsWith('mcp__')).length, 1)
  // 所有默认项都失败时仍必须能读取本地状态，不写入未封装校验和的空 desired state。
  await ctx.fiber.dispose()
  await writeFile(record, '[]')
  await writeFile(manifest, JSON.stringify({ revision: 'all-missing', mcp: [{ id: 'missing-only' }] }))
  ctx = await boot('nova-defaults-test', config)
  assert.ok((await defaultsNow({ action: 'retry' })).items[0]?.error)
  assert.deepEqual(installed(await call('installed')), [])
  await ctx.fiber.dispose()
  ctx = await boot('nova-defaults-test', config)
  assert.deepEqual(installed(await call('installed')), [])
})
