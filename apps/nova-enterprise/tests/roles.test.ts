/** 验证角色契约准入和秘密隔离；不执行任何角色、插件或 MCP。 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { roleCatalog, rolePlan, roleRequest } from '../src/roles.ts'

const profile = { apiVersion: 'harness.nova/v1', kind: 'RoleProfile', metadata: { id: 'frontend', displayName: '前端工程师', version: '1.0.0' }, defaults: { token: 'never-return-this' } }
const rows = [{ id: 'frontend', displayName: '前端工程师', description: '', published: true, versions: [{ published: true, document: profile }] }]
const desired = {
  role: profile, capabilities: [{ id: 'jira-mcp', version: '1.0.0', enabled: true, reason: ['role:frontend:required'], configuration: { password: 'never-return-this' } }],
  installationOrder: ['jira-mcp'], versions: { 'jira-mcp': '1.0.0' }, compatibility: { 'jira-mcp': false },
  permissions: [{ id: 'jira-read', effect: 'requireApproval', action: 'jira.read', resource: '*', enforced: true, conditions: { token: 'never-return-this' } }],
  conflicts: [], requiredSecrets: ['jira/token'], requiredConfiguration: ['JIRA_BASE_URL'], warnings: ['never-return-this'], checksum: 'a'.repeat(64),
}

test('当前 Hub 角色行按发布状态准入，不把最新草稿视为可选角色', () => {
  assert.equal(roleCatalog(rows)[0].selectable, true)
  const draft = structuredClone(rows); draft[0].versions[0].published = false
  assert.equal(roleCatalog(draft)[0].selectable, false)
  assert.equal(JSON.stringify(roleCatalog(rows)).includes('never-return-this'), false)
})
test('角色列表拒绝裸 Profile、重复标识及版本身份错配', () => {
  assert.throws(() => roleCatalog([profile]))
  assert.throws(() => roleCatalog([...rows, ...rows]))
  const invalid = structuredClone(rows); invalid[0].versions[0].document.metadata.id = 'backend'
  assert.throws(() => roleCatalog(invalid))
})
test('单角色和多角色请求明确指定 DeepSeek Runtime，不发送秘密或配置覆盖', () => {
  const available = [...roleCatalog(rows), { id: 'backend', selectable: true }]
  assert.deepEqual(roleRequest({ roles: ['frontend', 'backend'] }, available), { runtime: 'deepseek-harness', scope: 'user', role: 'frontend', roles: ['frontend', 'backend'] })
  for (const input of [{ roles: [] }, { roles: ['frontend', 'frontend'] }, { roles: ['unknown'] }, { roles: ['frontend'], token: 'secret' }, { roles: ['frontend'], runtime: 'claude-code' }]) assert.throws(() => roleRequest(input, available))
})
test('解析预览剥离公开配置、默认值、权限条件和原始警告中的秘密', () => {
  const result = rolePlan(desired)
  assert.equal(JSON.stringify(result).includes('never-return-this'), false)
  assert.deepEqual(result.missingRuntimeBindings, ['jira-mcp'])
  assert.equal(result.warningCount, 1); assert.equal(result.applied, false)
  assert.equal(result.permissions[0].effect, 'requireApproval')
})

test('自由组合只接收能力 ID；继承后可选集合用于团队逐成员过滤', () => {
  const available = roleCatalog(rows)
  assert.deepEqual(roleRequest({ roles: ['frontend'], add: ['wiki'], disable: ['jira-mcp'], includeOptional: ['dbhub'] }, available), { runtime: 'deepseek-harness', scope: 'user', role: 'frontend', roles: ['frontend'], add: ['wiki'], disable: ['jira-mcp'], includeOptional: ['dbhub'] })
  assert.deepEqual(rolePlan({ ...desired, optionalCapabilities: ['dbhub'] }).optionalCapabilities, ['dbhub'])
  assert.throws(() => roleRequest({ roles: ['frontend'], add: ['wiki', 'wiki'] }, available))
  assert.throws(() => rolePlan({ ...desired, optionalCapabilities: ['../bad'] }))
})
test('精确版本表、顺序、绑定与解析能力必须互相一致', () => {
  for (const mutate of [
    (plan) => { plan.versions['jira-mcp'] = '2.0.0' },
    (plan) => { plan.installationOrder = [] },
    (plan) => { plan.installationOrder = ['jira-mcp', 'jira-mcp'] },
    (plan) => { plan.compatibility['jira-mcp'] = 'true' },
    (plan) => { plan.capabilities.push(plan.capabilities[0]) },
    (plan) => { plan.conflicts = [{ code: 'PLAN_CONFLICT' }] },
  ]) { const invalid = structuredClone(desired); mutate(invalid); assert.throws(() => rolePlan(invalid)) }
})
test('缺少绑定的已禁用能力不算待启用阻断，但仍保留其精确版本', () => {
  const disabled = structuredClone(desired); disabled.capabilities[0].enabled = false
  const result = rolePlan(disabled)
  assert.deepEqual(result.missingRuntimeBindings, []); assert.equal(result.capabilities[0].version, '1.0.0')
})
