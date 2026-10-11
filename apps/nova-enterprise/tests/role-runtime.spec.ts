/** 无 API Key 的真实 Agent Loop 会话验证：职责进入下一次请求及事件日志，团队使用官方 Spawn Provider。 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import { SessionId } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SubagentService from '@deepseek-ai/dsh-subagent'
import * as SubagentSpawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import TeamService from '@deepseek-ai/dsh-experimental-agent-team'
import { MockAdapter, textResponse } from '../../../packages/core/agent-loop/tests/mock-adapter.ts'
import { mountWorkingDirectoryFixture } from '../../../packages/subagent/subagent/tests/working-directory-fixture.ts'
import { TestSessionQuery } from '../../../packages/experimental/agent-team/tests/test-session-query.ts'
import { roleRuntime } from '../src/role-runtime.ts'
import { roleAccess, mcpPrefix } from '../src/role-access.ts'
import { workspaceId, workspaceScope, agentWorkspace } from '../src/workspace.ts'
import { CapabilityTools } from '../src/capability-tools.ts'
import { resourceDrafts, draftContent } from '../src/resource-drafts.ts'

const contexts: Context[] = [], roots: string[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** @returns 隔离会话、模拟模型和真实官方团队服务；不接触当前桌面会话。 */
async function setup() {
  const ctx = new Context(); contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx)
  await mountWorkingDirectoryFixture(ctx)
  const root = mkdtempSync(join(tmpdir(), 'harness-role-')); roots.push(root)
  await ctx.plugin(JsonlSessionPersistence, { root })
  await ctx.plugin(TestSessionQuery)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(SubagentService)
  await ctx.plugin(SubagentSpawn, { providerName: 'spawn' })
  await ctx.plugin(TeamService)
  const records = new Map()
  ctx.provide('credentials', { readRecord: async key => records.get(key), modifyRecord: async (key, mutate) => {
    const next = await mutate(records.get(key)); if (next !== undefined) records.set(key, next); return next ?? records.get(key)
  } })
  const adapter = new MockAdapter(Array.from({ length: 4 }, () => textResponse('done')))
  ctx.llm.registerAdapter(['mock'], adapter)
  const agent = await ctx.agentLoop.create(SessionId('harness-role-lead'), { provider: 'mock', model: 'mock' })
  const lifecycle = { list: async () => [], mutate: vi.fn(), access: roleAccess(ctx) }
  const service = roleRuntime(ctx, 'roles', lifecycle, 'spawn')
  return { ctx, agent, adapter, service, lifecycle, records }
}
const role = { id: 'frontend', name: '前端工程师', version: '1.0.0', description: '使用 TypeScript，先验证再交付。' }

it('保存/读取/修改/删除模板，应用后下一次请求与会话日志包含职责，无隐式模型请求', async () => {
  const { ctx, agent, adapter, service } = await setup()
  const template = { id: 'mine', name: '我的角色', kind: 'role', roles: ['frontend'], instructions: '输出中文，保留现有改动。' }
  await service.save(template)
  expect((await service.list())[0].instructions).toBe(template.instructions)
  const result = await service.apply({ sessionId: agent.id, roles: [role], template, team: false })
  expect(result.outcome).toBe('queued')
  expect(adapter.requests).toHaveLength(0)
  const idle = new Promise<void>((resolve) => {
    const dispose = ctx.on('agent/status', ({ agent: target, status }) => {
      if (target === agent && status === 'idle') { dispose(); resolve() }
    })
  })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: '开始检查项目' }], source: { kind: 'user' } }))
  await idle
  expect(JSON.stringify(adapter.requests[0].messages)).toContain(template.instructions)
  expect(JSON.stringify(agent.session.snapshotEvents().filter(event => event.type === 'user/message'))).toContain('harness-role')
  await service.save({ ...template, instructions: '更新职责' })
  expect((await service.list())[0].instructions).toBe('更新职责')
  await service.save({ id: 'mine', action: 'remove' })
  expect(await service.list()).toEqual([])
})

it('真实官方团队创建独立队友，成员与任务提示落到对应会话日志', async () => {
  const { ctx, agent, service } = await setup()
  const result = await service.apply({ sessionId: agent.id, roles: [role], team: true, task: '检查前端类型', timeoutMs: 5000 })
  expect(result.outcome).toBe('team-started')
  const roster = ctx.agentTeams.listMembers(agent)
  expect(roster.some(member => member.name === 'frontend')).toBe(true)
  await vi.waitFor(async () => {
    const handle = await ctx.sessionPersistence.open(result.members[0].id, 'read')
    try { expect(JSON.stringify((await handle.read()).events)).toContain('检查前端类型') }
    finally { await handle.close() }
  })
})

it('无法映射的拒绝规则阻止应用，不能靠提示词冒充权限', async () => {
  const { agent, service, lifecycle } = await setup()
  await expect(service.apply({ sessionId: agent.id, roles: [role], team: false,
    plan: { permissions: [{ effect: 'deny' }], missingRuntimeBindings: [], capabilities: [] } })).rejects.toMatchObject({ code: 'HUB_ROLE_POLICY_UNSUPPORTED' })
  expect(lifecycle.mutate).not.toHaveBeenCalled()
})

it('角色能力范围隐藏其他 MCP，迟注册工具不越权，拒绝调用与请求日志一致', async () => {
  const { ctx, agent, service, adapter } = await setup()
  const execute = vi.fn(async () => [{ type: 'text' as const, text: 'ok' }])
  const allowed = `${mcpPrefix('jira-mcp')}read`, denied = `${mcpPrefix('dbhub')}query`
  const register = (name: string) => ctx.tools.register(defineContentToolFixture({ name, description: 'fixture', parameters: {}, execute }))
  register(allowed); register(denied)
  await service.apply({ sessionId: agent.id, roles: [role], team: false,
    plan: { capabilities: [], permissions: [{ effect: 'deny', resource: '*', action: `tool:${denied}` }], missingRuntimeBindings: [] } })
  expect(ctx.tools.schemas(agent).map(item => item.name)).not.toContain(denied)
  register(`${mcpPrefix('memory-mcp')}read`)
  expect(ctx.tools.schemas(agent)).toHaveLength(0)
  const result = await ctx.tools.execute({ name: denied, callId: ToolCallId('denied-call'), arguments: {}, agent, signal: new AbortController().signal })
  expect(result.isError).toBe(true); expect(execute).not.toHaveBeenCalled()
  agent.followup(createUserMessage({ content: [{ type: 'text', text: '开始' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  expect(adapter.requests[0]?.tools?.map(item => item.name) ?? []).not.toContain(denied)
  expect(JSON.stringify(agent.session.requestHeader()?.tools ?? [])).not.toContain(denied)
})

it('会话恢复会重新挂载保存的角色限制，删除模板不扩大范围', async () => {
  const { ctx, agent, service, records } = await setup()
  const denied = `${mcpPrefix('dbhub')}query`
  ctx.tools.register(defineContentToolFixture({ name: denied, description: 'fixture', parameters: {}, execute: async () => [] }))
  await service.apply({ sessionId: agent.id, roles: [role], team: false,
    plan: { capabilities: [], permissions: [], missingRuntimeBindings: [] } })
  expect(records.get('roles').payload.assignments[agent.id].access.capabilities).toEqual([])
  await service.save({ id: 'mine', name: '自定义', kind: 'role', roles: [], instructions: '中文' })
  await service.save({ id: 'mine', action: 'remove' })
  expect(records.get('roles').payload.assignments[agent.id]).toBeDefined()
  const resumed = await ctx.agentLoop.create(SessionId('policy-resume'), { provider: 'mock', model: 'mock' })
  records.get('roles').payload.assignments[resumed.id] = records.get('roles').payload.assignments[agent.id]
  await ctx.serial(resumed, 'agent/created', { agent: resumed, source: 'startup' })
  expect(ctx.tools.schemas(resumed).map(item => item.name)).not.toContain(denied)
})

it('团队成员首次模型请求只携带自己的 MCP，恢复现存会话也保持范围', async () => {
  const { ctx, agent, service, lifecycle, adapter } = await setup()
  const names = ['jira-mcp', 'dbhub'].map(id => `${mcpPrefix(id)}read`)
  for (const name of names) ctx.tools.register(defineContentToolFixture({ name, description: 'fixture', parameters: {}, execute: async () => [] }))
  const capability = (id: string) => ({ id, version: '1.0.0', enabled: true })
  const plan = (ids: string[]) => ({ capabilities: ids.map(capability), permissions: [], missingRuntimeBindings: [] })
  lifecycle.list = async () => ['jira-mcp', 'dbhub'].map(id => ({ ...capability(id), activation: 'active' })) as never[]
  const roles = [role, { ...role, id: 'backend', name: '后端工程师' }]
  const result = await service.apply({ sessionId: agent.id, roles, team: true, task: '独立检查', timeoutMs: 5000,
    plan: plan(['jira-mcp', 'dbhub']), memberPlans: [{ id: 'frontend', plan: plan(['jira-mcp']) }, { id: 'backend', plan: plan(['dbhub']) }] })
  expect(result.outcome).toBe('team-started')
  for (const [index, role] of roles.entries()) {
    await vi.waitFor(() => {
      const request = adapter.requests.find(item => JSON.stringify(item.messages).includes(`${role.name}：`))
      expect(request).toBeDefined()
      const tools = request?.tools?.map(item => item.name) ?? []
      expect(tools).toContain(names[index]); expect(tools).not.toContain(names[1 - index])
    })
  }
  await agent.whenIdle()
  await service.apply({ sessionId: agent.id, roles: [role], team: false, plan: plan(['jira-mcp']) })
  await service.restore()
  expect(ctx.tools.schemas(agent).map(item => item.name)).toContain(names[0])
  expect(ctx.tools.schemas(agent).map(item => item.name)).not.toContain(names[1])
})

it('子会话和孙会话不能借独立角色扩大父级能力，破损持久化记录明确拒绝', async () => {
  const { ctx, agent, lifecycle, service, records } = await setup()
  const denied = `${mcpPrefix('dbhub')}query`
  const execute = vi.fn(async () => [])
  ctx.tools.register(defineContentToolFixture({ name: denied, description: 'fixture', parameters: {}, execute }))
  lifecycle.access.install(agent, ['jira-mcp'])
  const child = await ctx.agentLoop.createAgent(agent.ctx, { sessionId: SessionId('role-child'), parentAgent: agent, agentOptions: { provider: 'mock', model: 'mock' } })
  lifecycle.access.install(child.agent, ['dbhub'])
  const grandchild = await ctx.agentLoop.createAgent(child.agent.ctx, { sessionId: SessionId('role-grandchild'), parentAgent: child.agent, agentOptions: { provider: 'mock', model: 'mock' } })
  expect(ctx.tools.schemas(grandchild.agent).map(tool => tool.name)).not.toContain(denied)
  const result = await ctx.tools.execute({ name: denied, callId: ToolCallId('grandchild-denied'), arguments: {}, agent: grandchild.agent, signal: new AbortController().signal })
  expect(result.isError).toBe(true); expect(execute).not.toHaveBeenCalled()
  records.set('roles', { kind: 'grant', payload: { templates: [], assignments: [] } })
  await expect(service.restore()).rejects.toMatchObject({ code: 'HUB_LOCAL_STATE_INVALID' })
})

it('项目工具在无角色会话也隔离，动态作者 SDK 工具不能跨角色执行，卸载清除注册', async () => {
  const { ctx, lifecycle } = await setup()
  const first = await ctx.agentLoop.create(SessionId('project-first'), { provider: 'mock', model: 'mock' }, { cwd: roots[0] })
  const second = await ctx.agentLoop.create(SessionId('project-second'), { provider: 'mock', model: 'mock' }, { cwd: join(roots[0], 'another') })
  const execute = vi.fn(async () => [])
  const projectTool = 'fixture_project_tool'
  ctx.tools.register(defineContentToolFixture({ name: projectTool, description: 'fixture', parameters: {}, execute }))
  lifecycle.access.ownTools('jira', [projectTool], workspaceId(roots[0]))
  expect(ctx.tools.schemas(first).map(tool => tool.name)).toContain(projectTool)
  expect(ctx.tools.schemas(second).map(tool => tool.name)).not.toContain(projectTool)
  expect((await ctx.tools.execute({ name: projectTool, callId: ToolCallId('project-denied'), arguments: {}, agent: second, signal: new AbortController().signal })).isError).toBe(true)
  expect(execute).not.toHaveBeenCalled()
  expect(() => workspaceScope(ctx, 'ws-made-up')).toThrow()
  new CapabilityTools(ctx, lifecycle.access)
  lifecycle.access.install(first, [])
  const staticTool = 'fixture_static_owned'
  ctx.tools.register(defineContentToolFixture({ name: staticTool, description: 'fixture', parameters: {}, execute }))
  lifecycle.access.ownTools('custom-plugin', [staticTool])
  let register: (() => void) | undefined
  const fiber = ctx.extend({ harnessCapabilityOwner: { id: 'custom-plugin', workspace: '' } }).plugin({ apply(inner) {
    register = () => inner.harnessCapabilities.registerTool(defineContentToolFixture({ name: 'fixture_dynamic_owned', description: 'fixture', parameters: {}, execute }))
  } })
  await fiber; register!()
  expect(ctx.tools.schemas(first).map(tool => tool.name)).not.toContain('fixture_dynamic_owned')
  expect(ctx.tools.schemas(first).map(tool => tool.name)).not.toContain(staticTool)
  expect((await ctx.tools.execute({ name: 'fixture_dynamic_owned', callId: ToolCallId('owned-denied'), arguments: {}, agent: first, signal: new AbortController().signal })).isError).toBe(true)
  await fiber.dispose()
  expect(ctx.tools.schemas().map(tool => tool.name)).not.toContain('fixture_dynamic_owned')
  expect(ctx.tools.schemas(first).map(tool => tool.name)).not.toContain(staticTool)
})

it('会话资源只形成项目草稿，用户可删除，跨项目读取和越界文件均拒绝', async () => {
  const { ctx } = await setup()
  const agent = await ctx.agentLoop.create(SessionId('draft-project'), { provider: 'mock', model: 'mock' }, { cwd: roots[0] })
  const drafts = resourceDrafts(ctx, ctx.credentials, 'draft-test', { maxRequestBytes: 4096 })
  const content = { id: 'test-skill', type: 'skill', version: '1.0.0', files: [{ path: 'SKILL.md', content: '中文技能' }] }
  const result = await drafts.prepare(content, agent.id)
  expect(result.reviewRequired).toBe(true)
  const workspace = agentWorkspace(agent, ctx)
  expect(await drafts.list('')).toEqual([])
  expect(await drafts.list(workspace)).toHaveLength(1)
  await expect(drafts.get(result.draftId, '')).rejects.toMatchObject({ code: 'HUB_PUBLISH_DRAFT_CHANGED' })
  expect((await drafts.get(result.draftId, workspace)).files).toEqual(content.files)
  await drafts.remove(result.draftId, workspace)
  expect(await drafts.list(workspace)).toEqual([])
  expect(() => draftContent({ ...content, files: [{ path: '../SKILL.md', content: 'x' }] }, 4096)).toThrow()
  expect(() => draftContent(content, Buffer.byteLength(JSON.stringify(content)) - 1)).toThrow()
})

it('团队成员模型在首请求生效，任务依赖持久化，调用次数上限在下一次请求前拒绝', async () => {
  const { ctx, agent, service, adapter } = await setup()
  const template = { id: 'limited-team', kind: 'team' as const, name: '受控团队', instructions: '', roles: ['frontend'], members: [{ role: 'frontend', provider: 'mock', model: 'member-model', maxTokens: 128, maxSteps: 1 }], tasks: [
    { id: 'review', subject: '审阅', description: '审阅代码', member: 'frontend', dependsOn: ['check'], writeScopes: [] },
    { id: 'check', subject: '检查', description: '检查类型', member: 'frontend', dependsOn: [], writeScopes: ['apps/web'] },
  ] }
  await service.save(template)
  const saved = (await service.list())[0]
  let capturedMember: import('@deepseek-ai/dsh-agent').Agent | undefined
  ctx.on('agent/created', ({ agent: created }) => { if (ctx.agents.isOwnedBy(created.id, agent)) capturedMember = created })
  const result = await service.apply({ sessionId: agent.id, roles: [role], template: saved, team: true, task: '执行共享任务', timeoutMs: 5000 })
  expect(result.outcome).toBe('team-started')
  const member = capturedMember!
  await member.whenIdle()
  expect(member.options.model).toBe('member-model')
  expect(adapter.requests[0].model).toBe('member-model')
  const tasks = ctx.agentTeams.listTasks(agent)
  expect(tasks[1].blockedBy).toEqual([tasks[0].id]); expect(tasks[1].ready).toBe(false)
  const count = adapter.requests.length
  await ctx.agentTeams.sendMessage(agent, { target: 'frontend', content: [{ type: 'text', text: '再执行一次' }], signal: AbortSignal.timeout(5000) })
  await vi.waitFor(async () => { expect((await service.team(agent.id)).members.find(item => item.name === 'frontend')?.exhausted).toBe(true) })
  expect(adapter.requests).toHaveLength(count)
  const state = await service.team(agent.id)
  expect(state.members.find(item => item.name === 'frontend')?.exhausted).toBe(true)
  await expect(service.save({ ...template, tasks: [{ ...template.tasks[0], dependsOn: ['review'] }] })).rejects.toMatchObject({ code: 'HUB_TEAM_SETTINGS_INVALID' })
})
