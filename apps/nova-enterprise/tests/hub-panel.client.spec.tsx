// @vitest-environment jsdom
/** 验证实际 Hub 控件的分组、秘密保留及角色模式切换；所有请求只使用本测试的内存响应。 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { HubPanel } from '../src/client/HubPanel.tsx'
import { zh } from '../src/client/locales.ts'
import type { HubLocaleKey } from '../src/client/locales.ts'

const t = (key: HubLocaleKey): string => zh[key]
const jira = { id: 'jira', name: 'Jira MCP', type: 'mcp', description: '查询内网工单',
  source: 'npm', version: '1.1.0', installed: true, hasRuntimeBinding: true, activation: 'needs-configuration' }
const legacy = { ...jira, id: 'legacy-plugin', name: 'Legacy Plugin', type: 'plugin', installed: false, hasRuntimeBinding: false }
const role = { id: 'frontend', name: '前端工程师', description: '页面实现与自测', version: '1.1.0', selectable: true }

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

/** @returns 精确截获 Hub 请求的测试记录，不调用真实网络或保存账号。 */
function mountHub() {
  const writes: { path: string; value: unknown }[] = []
  const responseForm = {
    capability: jira, fields: [
      { key: 'JIRA_BASE_URL', description: '服务根地址', required: true, secret: false, schema: { type: 'string', format: 'uri' } },
      { key: 'CONFIG_JSON', description: '运行选项', required: false, secret: false, schema: { type: 'string' } },
      { key: 'JIRA_API_TOKEN', description: '当前用户令牌', required: true, secret: true, schema: { type: 'string' } },
    ],
    values: { JIRA_BASE_URL: 'https://jira.example.internal', CONFIG_JSON: '{}' },
    configuredSecrets: ['JIRA_API_TOKEN'], configurationSaved: false,
    versions: [{ version: '1.1.0', hasRuntimeBinding: true }],
  }
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const path = new URL(input, 'http://fixture.local/').pathname.replace('/api/nova-hub/', '')
    if (init?.body !== undefined && typeof init.body !== 'string') throw new Error('Fixture expects a JSON string body')
    const payload: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    if (payload !== undefined) writes.push({ path, value: payload })
    let value: unknown
    switch (path) {
      case 'connection': value = { configured: true, authentication: 'none' }; break
      case 'catalog': value = { data: [jira, legacy], total: 2 }; break
      case 'configuration': value = { ...responseForm, configurationSaved: payload !== undefined }; break
      case 'readme': value = { content: '# Jira\n只读工单查询。' }; break
      case 'roles': value = [role]; break
      case 'templates': value = payload === undefined ? [] : [payload]; break
      case 'sessions': value = [{ id: 'lead', cwd: 'E:/project', status: 'idle' }]; break
      default: throw new Error(`Unexpected fixture route: ${path}`)
    }
    return new Response(JSON.stringify({ ok: true, value }), { headers: { 'Content-Type': 'application/json' } })
  }))
  const view = render(<HubPanel t={t} />)
  return { ...view, writes }
}

it('keeps unsupported installation disabled and provides a localized explanation', async () => {
  mountHub()
  const card = (await screen.findByRole('heading', { name: legacy.name })).closest('article')!
  const install = within(card).getByRole('button', { name: zh.install })
  expect(install.hasAttribute('disabled')).toBe(true)
  expect(install.getAttribute('title')).toBe(zh.missingBinding)
  expect(within(card).getByText(zh.missingBinding)).toBeDefined()
})

it('groups public parameters and credentials without displaying or replacing saved secrets', async () => {
  const { writes } = mountHub()
  const card = (await screen.findByRole('heading', { name: jira.name })).closest('article')!
  fireEvent.click(within(card).getByRole('button', { name: zh.details }))
  const configure = await screen.findByRole('button', { name: /配置参数/ })
  await waitFor(() => { expect(screen.queryByText(zh.working)).toBeNull() })
  fireEvent.click(configure)
  expect(screen.getByRole('group', { name: zh.publicParameters })).toBeDefined()
  const credentialGroup = screen.getByRole('group', { name: zh.secretParameters })
  const secret = within(credentialGroup).getByLabelText(/JIRA_API_TOKEN/)
  expect(secret.getAttribute('type')).toBe('password')
  expect(secret.getAttribute('placeholder')).toBe(zh.secretConfigured)
  expect(secret.hasAttribute('required')).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: zh.saveConfiguration }))
  await screen.findAllByText(zh.configurationSaved)
  expect(writes).toEqual([{ path: 'configuration', value: {
    id: 'jira', values: { JIRA_BASE_URL: 'https://jira.example.internal', CONFIG_JSON: '{}' }, secrets: {},
  } }])
})

it('makes role and team modes explicit while keeping advanced composition collapsed and editable', async () => {
  const { writes, container } = mountHub()
  await screen.findByRole('heading', { name: jira.name })
  fireEvent.click(screen.getByRole('button', { name: zh.rolesTab }))
  const checkbox = await screen.findByRole('checkbox', { name: /前端工程师/ })
  fireEvent.click(checkbox)
  const advanced = Array.from(container.querySelectorAll('details')).find(item => item.querySelector('summary')?.textContent === zh.customCapabilities)!
  expect(advanced.open).toBe(false)
  expect(screen.getAllByRole('radio').map(input => input.closest('label')?.textContent)).toMatchInlineSnapshot(`
    [
      "单会话角色组合一个 Agent，组合岗位职责与能力。",
      "多 Agent 角色团队多个独立 Agent，按任务分工协作。",
    ]
  `)
  expect(screen.getByRole('radio', { name: /单会话角色组合/ }).getAttribute('checked')).not.toBeNull()
  fireEvent.click(screen.getByRole('radio', { name: /多 Agent 角色团队/ }))
  expect(screen.getByText(zh.memberSettings)).toBeDefined()
  expect(screen.getByRole('button', { name: zh.startTeam }).hasAttribute('disabled')).toBe(true)
  fireEvent.click(screen.getByRole('radio', { name: /单会话角色组合/ }))
  expect(screen.queryByText(zh.memberSettings)).toBeNull()
  fireEvent.change(screen.getByLabelText(zh.templateId), { target: { value: 'frontend-local' } })
  fireEvent.change(screen.getByLabelText(zh.templateName), { target: { value: '前端工作约定' } })
  fireEvent.click(advanced.querySelector('summary')!)
  fireEvent.change(screen.getByLabelText(zh.roleAdd), { target: { value: 'jira' } })
  fireEvent.click(screen.getByRole('button', { name: zh.saveTemplate }))
  await screen.findByText(zh.templateSaved)
  expect(writes).toEqual([{ path: 'templates', value: { id: 'frontend-local', name: '前端工作约定',
    instructions: '', kind: 'role', roles: ['frontend'], add: ['jira'] } }])
})
