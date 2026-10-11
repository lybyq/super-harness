/** 验证角色纯展示组件的发布开关、精确版本预览和权限边界，不连接任何真实 Hub。 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { RolePanel } from '../src/client/RolePanel.tsx'
import { zh } from '../src/client/locales.ts'
import type { RolePlan } from '../src/client/api.ts'

it('草稿角色不可选，组合预览不伪装为已安装、已授权或并发团队', () => {
  const plan: RolePlan = { role: { id: 'frontend', name: '前端工程师', version: '1.0.0' },
    capabilities: [{ id: 'jira-mcp', version: '1.0.0', enabled: true, hasRuntimeBinding: false, reason: [] }],
    installationOrder: ['jira-mcp'], permissions: [{ id: 'deny-write', effect: 'deny', action: 'jira.write', resource: '*', enforced: true }],
    requiredSecrets: ['TOKEN'], requiredConfiguration: ['URL'], missingRuntimeBindings: ['jira-mcp'],
    warningCount: 0, checksum: 'a'.repeat(64), applied: false }
  const html = renderToStaticMarkup(createElement(RolePanel, {
    t: key => zh[key], roles: [{ id: 'draft', name: '草稿', description: '', version: '0.1.0', selectable: false }],
    selected: [], plan, busy: false, configured: true,
    onLoad: () => {}, onSelect: () => {}, onResolve: () => {},
  }))
  expect(html).toContain('type="checkbox" disabled=""')
  expect(html).toContain('应用前的预览')
  expect(html).toContain('此列表不授予权限')
  expect(html).toContain('jira-mcp')
  expect(html).toContain('1.0.0')
  expect(html).toContain('强制规则')
  expect(html).toContain('角色团队通过官方 Agent Teams')
})
