/** 用户角色与团队模板使用官方凭据记录保存；角色上下文通过 Agent.inject 进入可回放会话日志。 */
import { randomUUID } from 'node:crypto'
import { HubError } from './hub-client.ts'
import { capabilityId, object } from './catalog.ts'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { CredentialKey } from '@deepseek-ai/dsh-credentials'
import { SessionId } from '@deepseek-ai/dsh-session'
import { MessageId } from '@deepseek-ai/dsh-llm'
import { teamMembers, teamTasks } from './team-settings.ts'
import { createTeamWorktree, reviewTeamWorktree, mergeTeamWorktree } from './team-worktrees.ts'
import type { TeamMemberSettings } from './types.ts'
import type { TeamTaskView, TeamTaskId } from '@deepseek-ai/dsh-experimental-agent-team'
import type {} from '@deepseek-ai/dsh-experimental-agent-team'
import type { RoleAccess } from './role-access.ts'
import type { CapabilityLifecycle } from './lifecycle.ts'
import type { ApplicationPlan, RoleTemplate, RoleSummary } from './types.ts'

/** 角色应用调用只接受 Host 已准入的计划；task 仍需在启动模型前校验。 */
export interface RoleApplication {
  lifecycle?: Pick<CapabilityLifecycle, 'list' | 'mutate'>
  sessionId: string
  roles: Omit<RoleSummary, 'selectable'>[]
  team: boolean
  task?: unknown
  template?: RoleTemplate | undefined
  plan?: ApplicationPlan | undefined
  memberPlans?: { id: string; plan: ApplicationPlan }[]
  timeoutMs?: number
  resourceHome?: string
}
/** 职责持久记录只保存模板与脱敏范围，scope 在恢复时重新准入。 */
interface RolePayload {
  templates: RoleTemplate[]
  assignments: Record<string, { access: unknown; [key: string]: unknown }>
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** 用户主动选择的角色职责，按官方注入协议进入会话日志。 */
    'harness-role': {
      readonly kind: 'harness-role'
      readonly form: 'instructions'
    }
  }
}

/**
 * 准入用户保存的角色/团队模板，团队成员独立命名，禁止把密码字段当作职责说明。
 * @param value 界面提交或持久化 JSON。
 * @returns 有规模上限的模板；instructions 是用户主动提交的模型可见内容。
 */
export function roleTemplate(value: unknown): RoleTemplate {
  const item = object(value),
    id = capabilityId(item.id)
  if (
    (item.kind !== 'role' && item.kind !== 'team') ||
    typeof item.name !== 'string' ||
    !item.name.trim() ||
    item.name.length > 128 ||
    typeof item.instructions !== 'string' ||
    item.instructions.length > 16000 ||
    !Array.isArray(item.roles) ||
    item.roles.length > 20
  )
    throw new HubError('HUB_ROLE_SELECTION_INVALID')
  const roles = item.roles.map(capabilityId)
  if (new Set(roles).size !== roles.length) throw new HubError('HUB_ROLE_SELECTION_INVALID')
  const overrides: Pick<RoleTemplate, 'add' | 'remove' | 'disable' | 'includeOptional'> = {}
  for (const key of ['add', 'remove', 'disable', 'includeOptional'] as const) {
    if (item[key] === undefined) continue
    if (!Array.isArray(item[key]) || item[key].length > 100) throw new HubError('HUB_ROLE_SELECTION_INVALID')
    const ids = item[key].map(capabilityId)
    if (new Set(ids).size !== ids.length) throw new HubError('HUB_ROLE_SELECTION_INVALID')
    overrides[key] = ids
  }
  return {
    id,
    kind: item.kind,
    name: item.name,
    instructions: item.instructions,
    roles,
    ...overrides,
    ...(item.members === undefined ? {} : { members: teamMembers(item.members, roles) }),
    ...(item.tasks === undefined ? {} : { tasks: teamTasks(item.tasks, roles) }),
  }
}

/**
 * 创建角色模板、当前会话注入及官方团队启动入口；不启动用户未明确点击的模型任务。
 * @param ctx 官方 Host 上下文。
 * @param key Hub 隔离的模板存储键。
 * @param lifecycle 能力生命周期。
 * @param provider 部署指定的官方 continuable subagent Provider。
 * @returns 模板增删改查、会话列表及应用方法；团队启动可能产生模型费用。
 */
export function roleRuntime(
  ctx: Context,
  key: CredentialKey,
  lifecycle: Pick<CapabilityLifecycle, 'list' | 'mutate'> & {
    access?: RoleAccess
  },
  provider: string,
) {
  let pending: Promise<unknown> = Promise.resolve(),
    closed = false
  const startingMembers = new Map<
    Agent,
    {
      plan: ApplicationPlan | undefined
      template: RoleTemplate | undefined
      settings?: TeamMemberSettings
      worktree?: Awaited<ReturnType<typeof createTeamWorktree>>
    }
  >()
  /** @param record 官方凭据记录。 @returns 拒绝损坏或继承属性的会话策略记录。 */
  const admitted = (record: unknown): RolePayload | undefined => {
    if (record === undefined) return undefined
    const row = object(record, 'HUB_LOCAL_STATE_INVALID'),
      payload = object(row.payload, 'HUB_LOCAL_STATE_INVALID')
    if (row.kind !== 'grant' || !Array.isArray(payload.templates)) throw new HubError('HUB_LOCAL_STATE_INVALID')
    if (
      payload.assignments !== undefined &&
      (payload.assignments === null || typeof payload.assignments !== 'object' || Array.isArray(payload.assignments))
    )
      throw new HubError('HUB_LOCAL_STATE_INVALID')
    const assignments = Object.fromEntries(
      Object.entries(object(payload.assignments ?? {}, 'HUB_LOCAL_STATE_INVALID')).map(([id, value]) => {
        const assignment = object(value, 'HUB_LOCAL_STATE_INVALID')
        return [id, { ...assignment, access: assignment.access }]
      }),
    )
    return { templates: payload.templates.map(roleTemplate), assignments }
  }
  const read = async () => {
    const payload = admitted(await ctx.credentials.readRecord(key))
    return payload ? payload.templates.map(roleTemplate) : []
  }
  /** @param agent 官方活 Agent。 @param plan 权威解析计划。 @param template 用户职责模板。 @returns 范围先安装再保存；错误不会启动任务。 */
  const assign = async (agent: Agent, plan: ApplicationPlan | undefined, template: RoleTemplate | undefined) => {
    if (!lifecycle.access || !plan) return
    if (plan.unsupportedConditions) throw new HubError('HUB_ROLE_POLICY_UNSUPPORTED')
    const access = lifecycle.access.install(
      agent,
      plan.capabilities.filter(item => item.enabled).map(item => item.id),
      plan.permissions,
    )
    await ctx.credentials.modifyRecord(key, (record) => {
      const payload = admitted(record)
      const assignments = {
        ...(payload?.assignments ?? {}),
        [agent.id]: {
          access,
          name: template?.name ?? plan.role?.name ?? '',
          checksum: plan.checksum ?? '',
        },
      }
      if (Object.keys(assignments).length > 1000) throw new HubError('HUB_REQUEST_TOO_LARGE')
      return Promise.resolve({
        kind: 'grant',
        payload: { templates: payload?.templates ?? [], assignments },
      })
    })
  }
  ctx.on('agent/created', async ({ agent }) => {
    for (const [lead, entry] of startingMembers) {
      if (ctx.get('agents')?.isOwnedBy(agent.id, lead)) {
        await assign(agent, entry.plan, entry.template)
        if (entry.settings || entry.worktree)
          await ctx.credentials.modifyRecord(key, (record) => {
            const payload = admitted(record) ?? { templates: [], assignments: {} }
            payload.assignments[agent.id] = {
              ...payload.assignments[agent.id],
              access: payload.assignments[agent.id]?.access,
              settings: entry.settings ?? {},
              worktree: entry.worktree ?? null,
              steps: 0,
            }
            return Promise.resolve({ kind: 'grant', payload })
          })
        return
      }
    }
    const record = await ctx.credentials.readRecord(key)
    const assignments = admitted(record)?.assignments
    const saved = assignments && Object.hasOwn(assignments, agent.id) ? assignments[agent.id] : undefined
    if (saved?.access !== undefined) lifecycle.access?.restore(agent, saved.access)
  })
  ctx.on('agent/pre-step', async ({ agent }, next) => {
    const result = await ctx.credentials.modifyRecord(key, (record) => {
      const payload = admitted(record),
        assignment = payload?.assignments[agent.id]
      if (!payload || !assignment?.settings) return Promise.resolve(undefined)
      const settings = object(assignment.settings),
        limit = settings.maxSteps
      if (limit === undefined) return Promise.resolve(undefined)
      const steps = assignment.steps ?? 0
      if (
        typeof limit !== 'number' ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        typeof steps !== 'number' ||
        !Number.isSafeInteger(steps) ||
        steps < 0
      )
        throw new HubError('HUB_LOCAL_STATE_INVALID')
      const exhausted = steps >= limit
      payload.assignments[agent.id] = { ...assignment, steps: exhausted ? steps : steps + 1, exhausted }
      return Promise.resolve({ kind: 'grant', payload })
    })
    return admitted(result)?.assignments[agent.id]?.exhausted === true ? { kind: 'reject' } : next()
  })
  return {
    list: read,
    /** @returns 插件启动时也恢复已经存在的活会话，先限制工具再激活已安装能力。 */
    async restore() {
      const assignments = admitted(await ctx.credentials.readRecord(key))?.assignments
      for (const agent of ctx.get('agents')?.list() ?? []) {
        const assignment = assignments && Object.hasOwn(assignments, agent.id) ? assignments[agent.id] : undefined
        if (assignment?.access !== undefined) lifecycle.access?.restore(agent, assignment.access)
      }
    },
    /** @returns 阻止新角色应用，等待已有团队启动操作结束。 */
    async close() {
      closed = true
      await pending
    },
    /** @returns 官方当前存活根会话，用户必须明确选择目标，不猜测最后一个会话。 */
    sessions() {
      const agents = ctx.get('agents')
      return agents
        ? agents.roots().map(agent => ({
          id: agent.id,
          cwd: agent.session.header.cwd ?? '',
          status: agent.status,
        }))
        : []
    },
    /** @param sessionId 用户明确选定的 Lead。 @returns 官方持久任务/成员及脱敏调用预算和工作树收据，不推断模型是否成功。 */
    async team(sessionId: string) {
      const agent = ctx.get('agents')?.get(SessionId(sessionId)),
        teams = ctx.get('agentTeams')
      if (!agent || !teams) throw new HubError('HUB_TEAM_UNAVAILABLE')
      const assignments = admitted(await ctx.credentials.readRecord(key))?.assignments ?? {}
      return {
        members: teams
          .listMembers(agent)
          .map(member => ({
            ...member,
            settings: assignments[member.id]?.settings ?? {},
            steps: assignments[member.id]?.steps ?? 0,
            exhausted: assignments[member.id]?.exhausted === true,
            worktree: assignments[member.id]?.worktree ?? null,
          })),
        tasks: teams.listTasks(agent),
      }
    },
    /** @param sessionId 官方 Lead。 @param raw 用户审阅/合并操作。 @returns 不允许界面用任意路径代替成员工作树。 */
    worktree(sessionId: string, raw: unknown) {
      if (closed) throw new HubError('HUB_CANCELLED')
      const action = async () => {
        const input = object(raw),
          agent = ctx.get('agents')?.get(SessionId(sessionId)),
          teams = ctx.get('agentTeams')
        if (
          !agent ||
          !ctx.get('agents')?.roots().includes(agent) ||
          !teams ||
          typeof input.memberId !== 'string' ||
          !teams.listMembers(agent).some(member => member.id === input.memberId)
        )
          throw new HubError('HUB_TEAM_UNAVAILABLE')
        const assignments = admitted(await ctx.credentials.readRecord(key))?.assignments ?? {},
          value = object(assignments[input.memberId]?.worktree, 'HUB_TEAM_REVIEW_FAILED')
        if (
          typeof value.path !== 'string' ||
          typeof value.repository !== 'string' ||
          typeof value.branch !== 'string' ||
          typeof value.baseCommit !== 'string'
        )
          throw new HubError('HUB_TEAM_REVIEW_FAILED')
        const receipt = {
          path: value.path,
          repository: value.repository,
          branch: value.branch,
          baseCommit: value.baseCommit,
        }
        if (input.action === 'review') return reviewTeamWorktree(receipt)
        if (
          input.action !== 'merge' ||
          agent.status !== 'idle' ||
          teams.listMembers(agent).some(member => member.status === 'running')
        )
          throw new HubError('HUB_TEAM_MERGE_REFUSED')
        return mergeTeamWorktree(receipt, input.commit, input.expectedMainCommit, input.confirmed)
      }
      const operation = pending.then(action)
      pending = operation.catch(() => undefined)
      return operation
    },
    /** @param raw 模板写入或删除请求。 @returns 提交后的模板列表。 */
    async save(raw: unknown) {
      const input = object(raw)
      if (closed) throw new HubError('HUB_CANCELLED')
      if (input.action !== undefined && input.action !== 'remove') throw new HubError('HUB_REQUEST_INVALID')
      const id = capabilityId(input.id)
      const template = input.action === 'remove' ? undefined : roleTemplate(input)
      await ctx.credentials.modifyRecord(key, (record) => {
        const payload = admitted(record)
        const current = payload ? payload.templates.map(roleTemplate) : []
        const templates = current.filter(item => item.id !== id)
        if (template) templates.push(template)
        if (templates.length > 100) throw new HubError('HUB_REQUEST_TOO_LARGE')
        return Promise.resolve({
          kind: 'grant',
          payload: { templates, assignments: payload?.assignments ?? {} },
        })
      })
      return read()
    },
    /**
     * @param input 会话 ID、权威角色摘要、解析计划、用户模板及团队任务。
     * @returns 明确的 queued 或 team-started；queued 不代表模型已处理。
     */
    apply(input: RoleApplication) {
      if (closed) throw new HubError('HUB_CANCELLED')
      const action = async () => {
        const targetLifecycle = input.lifecycle ?? lifecycle
        const agent = requireIdle(ctx.get('agents')?.get(SessionId(input.sessionId)))
        const roles = input.roles
        const template = input.template
        if (
          input.team &&
          (!ctx.get('agentTeams') ||
            !provider ||
            !roles.length ||
            typeof input.task !== 'string' ||
            !input.task.trim() ||
            input.task.length > 16000)
        )
          throw new HubError('HUB_TEAM_UNAVAILABLE')
        if (
          input.plan?.unsupportedConditions ||
          input.plan?.permissions.some(
            rule =>
              rule.effect !== 'allow' &&
              (!lifecycle.access ||
                rule.effect !== 'deny' ||
                rule.resource !== '*' ||
                !rule.action.startsWith('tool:')),
          )
        )
          throw new HubError('HUB_ROLE_POLICY_UNSUPPORTED')
        if (input.plan?.missingRuntimeBindings.length) throw new HubError('HUB_RUNTIME_UNSUPPORTED')
        // 安装是全局用户能力，不自动提升原生工具权限；必需能力全部就绪后才允许注入职责。
        for (const capability of input.plan?.capabilities.filter(item => item.enabled) ?? []) {
          const installed = (await targetLifecycle.list()).find(item => item.id === capability.id)
          if (!installed || installed.version !== capability.version)
            await targetLifecycle.mutate({
              action: 'add',
              id: capability.id,
              version: capability.version,
            })
          if ((await targetLifecycle.list()).find(item => item.id === capability.id)?.enabled === false)
            await targetLifecycle.mutate({ action: 'enable', id: capability.id })
        }
        const state = await targetLifecycle.list()
        if (
          input.plan?.capabilities.some(
            item => item.enabled && state.find(row => row.id === item.id)?.activation !== 'active',
          )
        )
          throw new HubError('HUB_ROLE_NOT_READY')
        requireIdle(agent)
        const text = [
          '当前工作角色（以本次选择替换此前角色职责；能力范围受 Host 限制，不提升原生工具权限）：',
          ...roles.map(role => `${role.name} (${role.id}@${role.version})：${role.description}`),
          template?.instructions ?? '',
        ]
          .filter(Boolean)
          .join('\n')
        if (!input.team) {
          await assign(agent, input.plan, template)
          agent.inject({
            id: MessageId(randomUUID()),
            role: 'user',
            content: [{ type: 'text', text }],
            source: { kind: 'harness-role', form: 'instructions' },
          })
          return { outcome: 'queued', sessionId: agent.id }
        }
        const teams = ctx.get('agentTeams')
        if (
          !teams ||
          !provider ||
          !roles.length ||
          typeof input.task !== 'string' ||
          !input.task.trim() ||
          input.task.length > 16000
        )
          throw new HubError('HUB_TEAM_UNAVAILABLE')
        const existing = teams.listMembers(agent)
        if (roles.some(role => existing.some(member => member.name === role.id)))
          throw new HubError('HUB_TEAM_EXISTS')
        await assign(agent, input.plan, template)
        const members: { id: string; name: string }[] = []
        const tasks: TeamTaskView[] = [],
          ids = new Map<string, TeamTaskId>()
        for (const task of template?.tasks ?? []) {
          try {
            const created = await teams.createTask(agent, {
              subject: task.subject,
              description: `${task.description}\n负责角色：${task.member}`,
              blockedBy: task.dependsOn.map((id) => {
                const dependency = ids.get(id)
                if (!dependency) throw new HubError('HUB_TEAM_SETTINGS_INVALID')
                return dependency
              }),
              writeScopes: task.writeScopes,
            })
            tasks.push(created)
            ids.set(task.id, created.id)
          } catch (_error) {
            return { outcome: 'team-partial', sessionId: agent.id, members, tasks }
          }
        }
        // 成员创建不是原子事务；失败时返回已创建成员，不声称全队回滚或重复启动。
        for (const role of roles) {
          try {
            const memberPlan = input.memberPlans?.find(item => item.id === role.id)?.plan
            if (input.plan && !memberPlan) throw new HubError('HUB_ROLE_POLICY_UNSUPPORTED')
            const settings = template?.members?.find(item => item.role === role.id)
            const worktree = settings?.worktree
              ? await createTeamWorktree(agent.session.header.cwd ?? '', input.resourceHome ?? '', role.id)
              : undefined
            startingMembers.set(agent, {
              plan: memberPlan,
              template,
              ...(settings ? { settings } : {}),
              ...(worktree ? { worktree } : {}),
            })
            const result = await teams.spawnTeammate(agent, {
              name: role.id,
              description: role.name,
              context: 'fresh',
              provider,
              ...(worktree ? { cwd: worktree.path } : {}),
              ...(settings
                ? {
                  agentOptions: {
                    ...(settings.provider ? { provider: settings.provider, model: settings.model } : {}),
                    ...(settings.maxTokens ? { maxTokens: settings.maxTokens } : {}),
                  },
                }
                : {}),
              signal: AbortSignal.timeout(input.timeoutMs ?? 60000),
              prompt: [
                {
                  type: 'text',
                  text: `${role.name}：${role.description}\n${template?.instructions ?? ''}\n任务：${input.task}${tasks.length ? `\n共享任务（只认领自己角色的 ready 任务；依赖未完成不要开始）：${JSON.stringify(tasks)}` : ''}${worktree ? '\n在本成员独立工作树完成修改，提交结果给负责人审阅，不自动合并主分支。' : ''}`,
                },
              ],
            })
            members.push({ id: result.member.id, name: result.member.name })
          } catch (_error) {
            return { outcome: 'team-partial', sessionId: agent.id, members, tasks }
          } finally {
            startingMembers.delete(agent)
          }
        }
        return { outcome: 'team-started', sessionId: agent.id, members, tasks }
      }
      const result = pending.then(action)
      pending = result.catch(() => undefined)
      return result
    },
  }
}

/** @param agent 可能在异步安装期间改变状态的目标会话。 @returns 每次应用前重新检查的空闲会话。 */
function requireIdle(agent: Agent | undefined): Agent {
  if (!agent || agent.status !== 'idle') throw new HubError('HUB_SESSION_NOT_IDLE')
  return agent
}
