// @vitest-environment jsdom
/** 统一向导验证：首次提示、同名 env 隔离、秘密不回填、批量提交和卸载取消。 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { McpSetup, openMcpConfiguration } from '../src/client/McpSetup.tsx'
import { zh, type HubLocaleKey } from '../src/client/locales.ts'

const t = (key: HubLocaleKey): string => zh[key]
const dialogMethods = Object.fromEntries(['showModal', 'close'].map(key => [key, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, key)]))
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute('open') } })
})
afterEach(() => {
  cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks()
  for (const key of ['showModal', 'close']) {
    const descriptor = dialogMethods[key]
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, key, descriptor)
    else Reflect.deleteProperty(HTMLDialogElement.prototype, key)
  }
})

/** @param dismissed 是否已选择稍后配置。 @returns 只有当前测试拥有的请求替身，不读真实 Hub 或凭据。 */
function fixture(dismissed = false) {
  const writes: { path: string; value: unknown }[] = []
  const forms = ['jira', 'wiki'].map(id => ({
    capability: { id, name: id, type: 'mcp', description: '', source: 'npm', version: '1.0.0',
      hasRuntimeBinding: true, installed: true, enabled: true, activation: 'needs-configuration' },
    fields: [{ key: 'URL', description: `${id} 服务地址`, required: true, secret: false, schema: { type: 'string' } },
      { key: 'TOKEN', description: `${id} 个人账号令牌`, required: true, secret: true, schema: { type: 'string' } }],
    values: { URL: `https://${id}.internal` }, configuredSecrets: id === 'wiki' ? ['TOKEN'] : [],
    configurationSaved: false, versions: [{ version: '1.0.0', hasRuntimeBinding: true }],
  }))
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const path = input.split('/').at(-1)!
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    if (body) writes.push({ path, value: body })
    const value = path === 'connection' ? { configured: true, authentication: 'none', defaultMcpEnabled: true }
      : path === 'mcp-defaults' ? { configured: true, revision: 'x', dismissed, items: forms.map(form => form.capability) }
        : path === 'mcp-configurations' && body ? { results: [{ id: 'jira', saved: true, activation: 'active' }, { id: 'wiki', saved: false, activation: 'needs-configuration', error: 'HUB_CONFIGURATION_STORE_FAILED' }] }
          : path === 'mcp-configurations' ? { data: forms, errors: [] } : undefined
    if (!value) throw new Error(`Unexpected fixture path: ${path}`)
    return Response.json({ ok: true, value })
  }))
  return { writes }
}

it('首次向导按资源分组，同名字段独立提交，保留既有秘密且呈现部分失败', async () => {
  const { writes } = fixture()
  render(<McpSetup t={t} />)
  const dialog = await screen.findByRole('dialog')
  await waitFor(() =>{  expect(within(dialog).getByRole('button', { name: zh.mcpSaveAll }).hasAttribute('disabled')).toBe(false) })
  const tokens = within(dialog).getAllByLabelText(/TOKEN/)
  expect(tokens).toHaveLength(2)
  expect(tokens[1]?.getAttribute('placeholder')).toBe(zh.secretConfigured)
  fireEvent.change(tokens[0], { target: { value: 'jira-only-secret' } })
  fireEvent.submit(dialog.querySelector('form')!)
  await screen.findByText(/wiki · 配置未保存/)
  expect(writes.find(row => row.path === 'mcp-configurations')?.value).toEqual({ configurations: [
    { id: 'jira', values: { URL: 'https://jira.internal' }, secrets: { TOKEN: 'jira-only-secret' } },
    { id: 'wiki', values: { URL: 'https://wiki.internal' }, secrets: {} },
  ] })
  expect(screen.queryByText('jira-only-secret')).toBeNull()
  expect(tokens[0]?.getAttribute('value')).toBe('')
})

it('稍后配置记忆只控制自动提示，仍可手动打开配置', async () => {
  fixture(true)
  render(<McpSetup t={t} />)
  await waitFor(() =>{  expect(fetch).toHaveBeenCalledTimes(3) })
  expect(screen.queryByRole('dialog')).toBeNull()
  openMcpConfiguration()
  await screen.findByRole('dialog')
})
