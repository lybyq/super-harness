// @vitest-environment jsdom
/** 在真实 React 挂载中验证自动进入目录、管理员错误提示、重试及卸载取消，不访问企业服务。 */
import { createElement } from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { HubPanel } from '../src/client/HubPanel.tsx'
import { zh } from '../src/client/locales.ts'

let root: Root | undefined
let container: HTMLDivElement

afterEach(async () => {
  if (root) await act(async () => { root?.unmount() })
  root = undefined
  container?.remove()
  vi.unstubAllGlobals()
})

/** @returns 等待 React 副作用和有限请求完成的真实 DOM，测试不模拟组件内部状态。 */
async function mount(): Promise<HTMLDivElement> {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root?.render(createElement(HubPanel, { t: key => zh[key] })) })
  return container
}

/**
 * @param value Host 响应中公开可展示的数据。
 * @returns 官方 Host 路由返回的成功信封。
 */
function success(value: object): Response { return Response.json({ ok: true, value }) }

it('打开即读取部署状态并加载能力目录，没有地址或令牌输入框', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(success({ configured: true, authentication: 'none' }))
    .mockResolvedValueOnce(success({ data: [], total: 0 }))
  vi.stubGlobal('fetch', fetch)
  const panel = await mount()
  expect(fetch.mock.calls.map(call => call[0])).toEqual(['api/nova-hub/connection', 'api/nova-hub/catalog?q=&type=&page=1'])
  expect(panel.textContent).toContain('暂无搜索结果')
  expect(panel.querySelector('input[type=url], input[type=password]')).toBeNull()
  expect(panel.textContent).not.toContain('访问令牌')
})

it('尚未部署时明确提示联系管理员，不询问用户配置，也不请求目录', async () => {
  const fetch = vi.fn().mockResolvedValue(success({ configured: false, authentication: 'none' }))
  vi.stubGlobal('fetch', fetch)
  const panel = await mount()
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(panel.querySelector('[role=alert]')?.textContent).toBe(zh.HUB_NOT_CONFIGURED)
  expect(panel.querySelector('input[type=url], input[type=password]')).toBeNull()
})

it('不带发布状态的能力直接展示，不出现审核标签或审批入口', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(success({ configured: true, authentication: 'none' }))
    .mockResolvedValueOnce(success({ data: [{
      id: 'jira-mcp', type: 'mcp', name: 'Jira MCP', description: '企业工单',
      source: 'npm', version: '1.0.0', hasRuntimeBinding: true, installed: false,
    }], total: 1 }))
  vi.stubGlobal('fetch', fetch)
  const panel = await mount()
  expect(panel.textContent).toContain('Jira MCP')
  expect(panel.querySelector('[role=alert]')).toBeNull()
  expect(panel.textContent).not.toMatch(/待审核|已审核|管理员审批/)
})

it('连接失败可重新加载，失败不伪装为一个空目录', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(success({ configured: true, authentication: 'none' }))
    .mockRejectedValueOnce(new Error('private-server-details'))
    .mockResolvedValueOnce(success({ configured: true, authentication: 'none' }))
    .mockResolvedValueOnce(success({ data: [], total: 0 }))
  vi.stubGlobal('fetch', fetch)
  const panel = await mount()
  expect(panel.querySelector('[role=alert]')?.textContent).toBe(zh.HUB_UNAVAILABLE)
  expect(panel.textContent).not.toContain('暂无搜索结果')
  expect(panel.textContent).not.toContain('private-server-details')
  const retry = [...panel.querySelectorAll('button')].find(button => button.textContent === zh.retry)
  await act(async () => { retry?.click() })
  expect(fetch).toHaveBeenCalledTimes(4)
  expect(panel.querySelector('[role=alert]')).toBeNull()
  expect(panel.textContent).toContain('暂无搜索结果')
})

it('卸载时取消自动加载中的 Host 请求', async () => {
  let signal: AbortSignal | undefined
  vi.stubGlobal('fetch', vi.fn((_url, options: RequestInit) => {
    signal = options.signal ?? undefined
    return new Promise<Response>((_resolve, reject) => {
      signal?.addEventListener('abort', () => { reject(new Error('cancelled')) }, { once: true })
    })
  }))
  await mount()
  expect(signal?.aborted).toBe(false)
  await act(async () => { root?.unmount() })
  root = undefined
  expect(signal?.aborted).toBe(true)
})

it('能力以卡片展示，详情默认 README，配置页列出说明、必填项和秘密字段', async () => {
  const capability = { id: 'jira', type: 'mcp', name: 'Jira MCP', description: '企业工单', source: 'npm', version: '1.0.0', hasRuntimeBinding: true, installed: false }
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(success({ configured: true, authentication: 'none' }))
    .mockResolvedValueOnce(success({ data: [capability], total: 1 }))
    .mockResolvedValueOnce(success({ capability, fields: [
      { key: 'URL', description: '你的工单服务地址', required: true, secret: false, schema: { type: 'string', format: 'uri' } },
      { key: 'TOKEN', description: '个人访问令牌', required: true, secret: true, schema: { type: 'string' } },
    ], values: {}, configuredSecrets: [], configurationSaved: false, versions: [{ version: '1.0.0', hasRuntimeBinding: true }] }))
    .mockResolvedValueOnce(success({ content: '# Jira 使用说明' })))
  const panel = await mount()
  expect(panel.querySelectorAll('article')).toHaveLength(1)
  await act(async () => { [...panel.querySelectorAll('button')].find(button => button.textContent === zh.details)?.click() })
  expect(panel.querySelector('pre')?.textContent).toBe('# Jira 使用说明')
  expect(panel.querySelector('input[type=password]')).toBeNull()
  await act(async () => { [...panel.querySelectorAll('button')].find(button => button.textContent?.startsWith(zh.configure))?.click() })
  expect(panel.textContent).toContain('你的工单服务地址')
  expect(panel.textContent).toContain(zh.required)
  expect(panel.querySelector('input[type=password]')?.hasAttribute('required')).toBe(true)
  expect(panel.querySelector('input[type=url]')?.getAttribute('aria-describedby')).toBeTruthy()
})

it('公开 JSON/TOML 使用多行配置区，秘密仍为掩码输入且不回填', async () => {
  const capability = { id: 'dbhub', type: 'mcp', name: 'DBHub', description: '', source: 'npm', version: '1.0.0', hasRuntimeBinding: true, installed: true, enabled: true, activation: 'active' }
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(success({ configured: true, authentication: 'none' }))
    .mockResolvedValueOnce(success({ data: [capability], total: 1 }))
    .mockResolvedValueOnce(success({ capability, fields: [
      { key: 'CONFIG_TOML', description: '连接声明，不含密码', required: true, secret: false, schema: { type: 'string', minLength: 2 } },
      { key: 'DB_DSN', description: '数据库凭据', required: true, secret: true, schema: { type: 'string' } },
    ], values: { CONFIG_TOML: 'dsn = "${DB_DSN}"' }, configuredSecrets: ['DB_DSN'], configurationSaved: true, versions: [{ version: '1.0.0', hasRuntimeBinding: true }] }))
    .mockResolvedValueOnce(success({ content: '# DBHub' })))
  const panel = await mount()
  await act(async () => { [...panel.querySelectorAll('button')].find(button => button.textContent === zh.details)?.click() })
  await act(async () => { [...panel.querySelectorAll('button')].find(button => button.textContent?.startsWith(zh.configure))?.click() })
  expect(panel.querySelector('textarea')?.value).toBe('dsn = "${DB_DSN}"')
  expect(panel.querySelector('textarea')?.rows).toBe(8)
  expect(panel.querySelector<HTMLInputElement>('input[type=password]')?.value).toBe('')
})

it('离线目录明确标识缓存，不伪装在线', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(success({ configured: true, authentication: 'none' }))
    .mockResolvedValueOnce(success({ data: [], total: 0, offline: true })))
  const panel = await mount()
  expect(panel.textContent).toContain(zh.offlineNotice)
})

it('发布必须先校验并确认，部分成功显示 commit，未发布草稿离开需确认', async () => {
  const sha = 'a'.repeat(40)
  const fetch = vi.fn().mockResolvedValueOnce(success({ configured: true, authentication: 'none' }))
    .mockResolvedValueOnce(success({ data: [], total: 0 }))
    .mockResolvedValueOnce(success({ enabled: true, maxRequestBytes: 65536, sources: [{ id: 'gitlab', name: '内网 GitLab', type: 'gitlab' }] }))
    .mockResolvedValueOnce(success([{ path: 'SKILL.md', content: '# 我的技能' }]))
    .mockResolvedValueOnce(success({ checksum: 'fixture-checksum' }))
    .mockResolvedValueOnce(success({ outcome: 'source-partial', id: 'my-skill', version: '1.0.0', commitSha: sha }))
  vi.stubGlobal('fetch', fetch)
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  try {
    const panel = await mount()
    const click = async (text: string) => { await act(async () => { [...panel.querySelectorAll('button')].find(button => button.textContent === text)?.click() }) }
    await click(zh.authoringTab)
    expect([...panel.querySelectorAll('button')].find(button => button.textContent === zh.publishResource)?.disabled).toBe(true)
    await click(zh.generateTemplate)
    await click(zh.catalogTab)
    expect(confirm).toHaveBeenCalledWith(zh.unsavedConfiguration)
    expect(panel.querySelector('textarea')?.value).toBe('# 我的技能')
    await click(zh.validateDraft)
    expect([...panel.querySelectorAll('button')].find(button => button.textContent === zh.publishResource)?.disabled).toBe(false)
    await click(zh.publishResource)
    expect(fetch).toHaveBeenCalledTimes(5)
    confirm.mockReturnValue(true)
    await click(zh.publishResource)
    expect(JSON.parse(fetch.mock.calls[5][1].body)).toMatchObject({ action: 'publish', confirmed: true, expectedChecksum: 'fixture-checksum' })
    expect(panel.textContent).toContain(sha)
    expect(panel.textContent).toContain(zh.publicationPartial)
  } finally { confirm.mockRestore() }
})
