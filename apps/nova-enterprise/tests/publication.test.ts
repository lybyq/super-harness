/** 发布测试只访问临时回环私有源；真实 npm CLI 关闭脚本且缓存落在测试根目录。 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { publicationDraft, publicationService, resourceTemplate } from '../src/publication.ts'
import { contracts, yaml } from '../lib/engine.js'

/** @param {object} t 测试生命周期。 @returns {Promise<object>} 无外部服务的可信源、部署和请求收集器。 */
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'harness-publish-'))
  const requests = []; let mode = ''
  const server = createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk)
    const payload = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined
    requests.push({ method: request.method, url: request.url, payload, token: request.headers['private-token'] })
    response.setHeader('Content-Type', 'application/json')
    if (request.url === '/api/v4/projects/12') {
      response.end(JSON.stringify({ id: 12, path_with_namespace: mode === 'bad-project' ? 'other/skills/test' : 'enterprise/skills/test', default_branch: 'main', archived: false })); return
    }
    if (request.url?.startsWith('/api/v4/projects/12/repository/tags/v')) {
      response.statusCode = mode === 'existing-version' ? 200 : 404; response.end('{}'); return
    }
    if (request.url?.startsWith('/api/v4/projects/12/repository/files/')) { response.statusCode = 404; response.end('{}'); return }
    if (request.url === '/api/v4/projects/12/repository/commits') { response.end(JSON.stringify({ id: 'a'.repeat(40) })); return }
    if (request.url === '/api/v4/projects/12/repository/tags') { response.statusCode = mode === 'tag-failed' ? 403 : 201; response.end('{}'); return }
    if (request.method === 'PUT') { response.statusCode = 201; response.end(JSON.stringify({ ok: true })); return }
    response.statusCode = 404; response.end('{}')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const profile = contracts.deploymentProfileSchema.parse({ apiVersion: 'harness.nova/v1', kind: 'DeploymentProfile',
    metadata: { id: 'test-deployment', displayName: 'Test' }, hub: { url: `${origin}/api/v1` },
    downloads: { allowedHosts: ['127.0.0.1'], allowedRedirectHosts: [], maxArchiveBytes: 1048576, maxExtractedBytes: 1048576, maxFiles: 100, allowLifecycleScripts: false },
    sources: [{ id: 'git', displayName: 'GitLab', type: 'gitlab', baseUrl: origin, rootGroup: 'enterprise', authRef: 'HARNESS_PUBLISH_TEST_TOKEN' },
      { id: 'npm', displayName: 'Private npm', type: 'npm', registry: origin, adapter: 'npm-compatible', scopes: ['@harness'], authRef: 'HARNESS_PUBLISH_TEST_TOKEN' }],
    runtime: { default: 'deepseek-harness' }, trust: {}, sync: {},
  })
  const deploymentFile = join(root, 'deployment.yaml'); await writeFile(deploymentFile, yaml.stringify(profile))
  const options = { apiBaseUrl: `${origin}/api/v1`, deploymentFile, resourceHome: root, allowPublishing: true,
    allowInsecureHttp: true, maxRequestBytes: 65536, maxResponseBytes: 65536, timeoutMs: 2000, publishingTimeoutMs: 30000 }
  const sync = []
  const online = { syncSource: async (id) => { sync.push(id) }, capability: async id => ({ id, displayName: id, type: id.startsWith('npm') ? 'mcp' : 'skill',
    source: { kind: id.startsWith('npm') ? 'npm' : 'gitlab' }, versions: [{ version: '1.0.0', commitSha: 'a'.repeat(40), runtimeBindings: { 'deepseek-harness': {} } }] }) }
  const service = publicationService(options, online)
  process.env.HARNESS_PUBLISH_TEST_TOKEN = 'test-only-source-token'
  t.after(async () => {
    await service.close(); delete process.env.HARNESS_PUBLISH_TEST_TOKEN
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
    await rm(root, { recursive: true, force: true })
  })
  return { service, profile, options, requests, sync, mode: (value) => { mode = value } }
}
test('Skill 模板校验、GitLab 默认分支提交、固定 SHA 标签与 Hub 精确发现', async (t) => {
  const f = await fixture(t)
  const input = { id: 'new-skill', type: 'skill', version: '1.0.0', sourceId: 'git', projectId: 12,
    files: resourceTemplate({ id: 'new-skill', type: 'skill', version: '1.0.0' }) }
  const validated = await f.service.validate(input)
  assert.equal(validated.fileCount, 3); assert.equal(f.requests.length, 0)
  assert.equal((await f.service.publish({ ...input, confirmed: true, expectedChecksum: validated.checksum })).outcome, 'published')
  const commit = f.requests.find(item => item.url.endsWith('/commits'))
  assert.equal(commit.payload.branch, 'main'); assert.equal(commit.payload.force, undefined)
  assert.equal(f.requests.find(item => item.method === 'POST' && item.url.endsWith('/tags')).payload.ref, 'a'.repeat(40))
  assert.deepEqual(f.sync, ['git'])
  assert.equal(JSON.stringify(validated).includes('test-only-source-token'), false)
})
test('已有版本、越界项目和修改过的草稿均不能产生写请求', async (t) => {
  const f = await fixture(t)
  const input = { id: 'new-skill', type: 'skill', version: '1.0.0', sourceId: 'git', projectId: 12, files: resourceTemplate({ id: 'new-skill', type: 'skill', version: '1.0.0' }) }
  const validated = await f.service.validate(input)
  await assert.rejects(f.service.publish({ ...input, confirmed: true, expectedChecksum: 'bad' }), { code: 'HUB_PUBLISH_DRAFT_CHANGED' })
  f.mode('bad-project'); await assert.rejects(f.service.publish({ ...input, confirmed: true, expectedChecksum: validated.checksum }), { code: 'HUB_PUBLISH_TARGET_INVALID' })
  f.mode('existing-version'); await assert.rejects(f.service.publish({ ...input, confirmed: true, expectedChecksum: validated.checksum }), { code: 'HUB_PUBLISH_VERSION_EXISTS' })
  assert.equal(f.requests.some(item => item.method === 'POST' || item.method === 'PUT'), false)
})
test('标签失败明确返回已提交的 SHA，不自动重试、不声称整体回滚', async (t) => {
  const f = await fixture(t); f.mode('tag-failed')
  const input = { id: 'new-skill', type: 'skill', version: '1.0.0', sourceId: 'git', projectId: 12, files: resourceTemplate({ id: 'new-skill', type: 'skill', version: '1.0.0' }) }
  const validated = await f.service.validate(input)
  const result = await f.service.publish({ ...input, confirmed: true, expectedChecksum: validated.checksum })
  assert.equal(result.outcome, 'source-partial'); assert.equal(result.commitSha, 'a'.repeat(40))
  assert.equal(f.requests.filter(item => item.method === 'POST' && item.url.endsWith('/tags')).length, 1)
  assert.deepEqual(f.sync, [])
})
test('真实 npm CLI 向临时私有源发布精确包，上传内容不含凭据配置文件', { timeout: 45000 }, async (t) => {
  const f = await fixture(t)
  const input = { id: 'npm-test', type: 'mcp', version: '1.0.0', sourceId: 'npm',
    files: resourceTemplate({ id: 'npm-test', type: 'mcp', version: '1.0.0', packageName: '@harness/npm-test' }) }
  const validated = await f.service.validate(input)
  const result = await f.service.publish({ ...input, confirmed: true, expectedChecksum: validated.checksum })
  assert.equal(result.outcome, 'published')
  const uploaded = f.requests.find(item => item.method === 'PUT')
  assert.equal(uploaded.payload.name, '@harness/npm-test')
  assert.equal(uploaded.payload.versions['1.0.0'].version, '1.0.0')
  assert.ok(uploaded.payload._attachments)
  assert.equal(JSON.stringify(uploaded.payload).includes('test-only-source-token'), false)
})
test('拒绝目录穿越、密码文件、私有源以外 Scope 与脚本入口', async (t) => {
  const f = await fixture(t), engine = { profile: f.profile, contracts, yaml }
  const input = { id: 'npm-test', type: 'mcp', version: '1.0.0', sourceId: 'npm', files: resourceTemplate({ id: 'npm-test', type: 'mcp', version: '1.0.0', packageName: '@harness/npm-test' }) }
  assert.throws(() => publicationDraft({ ...input, files: [{ path: '../secret', content: 'x' }] }, engine, f.options), { code: 'HUB_REQUEST_INVALID' })
  assert.throws(() => publicationDraft({ ...input, files: [...input.files, { path: '.env', content: 'x' }] }, engine, f.options), { code: 'HUB_REQUEST_INVALID' })
  const pkg = input.files.find(file => file.path === 'package.json')
  const parsed = JSON.parse(pkg.content); parsed.scripts = { prepublishOnly: 'whoami' }; pkg.content = JSON.stringify(parsed)
  assert.throws(() => publicationDraft(input, engine, f.options), { code: 'HUB_PUBLISH_MANIFEST_INVALID' })
})
