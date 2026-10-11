/** 角色能力限制复用官方 scoped Tools；范围限制只减少能力，不授予原生安全策略拒绝的权限。 */
import { createHash } from 'node:crypto'
import { HubError } from './hub-client.ts'
import { capabilityId } from './catalog.ts'
import { object } from './catalog.ts'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { RolePermission, RoleScope } from './types.ts'
import { agentWorkspace } from './workspace.ts'
import type {} from '@deepseek-ai/dsh-tools'

/** @param id Hub 能力 ID。 @returns 与官方 MCP 注册名相同的唯一前缀。 */
export const mcpPrefix = (id: string) => `mcp__hub_${createHash('sha256').update(id).digest('hex').slice(0, 24)}__`

/**
 * 管理本进程角色范围，维护工具模型可见集、最终调用 Guard 和 Skill 发现过滤。
 * @param ctx 官方上下文；agent/created 在初始任务前完成范围挂载。
 * @returns install、allows、inherit、clear 接口；没有角色的根会话沿用部署默认能力。
 */
export function roleAccess(ctx: Context) {
  const assignments = new Map<string, RoleScope>(),
    disposers = new Map<string, () => void>(),
    owners = new Map<string, string[]>(),
    toolOwners = new Map<string, { id: string; workspace: string }>(),
    skillInvalidators = new Map<string, () => void>()
  let updating = false
  const assignment = (scope: object | undefined): RoleScope | undefined => {
    if (!scope) return undefined
    const registry = ctx.get('agents'),
      agents = registry?.list() ?? [],
      visited = new Set(),
      values: RoleScope[] = []
    let cursor = agents.find(agent => agent === scope)
    // 按真实运行时所有者链取交集，子角色即使单独设置也不能扩大任何祖先的范围。
    while (cursor && !visited.has(cursor.id)) {
      visited.add(cursor.id)
      const value = assignments.get(cursor.id)
      if (value) values.push(value)
      const child = cursor
      cursor = agents.find(owner => registry?.isOwnedBy(child.id, owner))
    }
    const first = values[0]
    if (!first) return undefined
    return {
      capabilities: first.capabilities.filter(id => values.every(value => value.capabilities.includes(id))),
      denied: [...new Set(values.flatMap(value => value.denied))],
    }
  }
  const denied = (name: string, value: RoleScope) =>
    value.denied.some(
      pattern =>
        pattern === '*' || pattern === name || (pattern.endsWith('*') && name.startsWith(pattern.slice(0, -1))),
    )
  const toolAllowed = (name: string, value: RoleScope | undefined, agent?: Agent) => {
    if (value && denied(name, value)) return false
    const owner = toolOwners.get(name)
    if (owner) {
      if (owner.workspace && owner.workspace !== agentWorkspace(agent, ctx)) return false
      return !value || value.capabilities.includes(owner.id)
    }
    if (name.startsWith('mcp__hub_')) return !value || value.capabilities.some(id => name.startsWith(mcpPrefix(id)))
    return true
  }
  /** @param agent 活会话。 @returns 每次注册表变化重新计算隐藏集，Guard 始终按最新角色范围执行。 */
  const refresh = (agent: Agent) => {
    const value = assignment(agent),
      tools = ctx.get('tools')
    if (!tools || updating) return
    updating = true
    try {
      disposers.get(agent.id)?.()
      disposers.delete(agent.id)
      const deny = tools
        .schemas()
        .map(tool => tool.name)
        .filter(name => !toolAllowed(name, value, agent))
      if (deny.length) disposers.set(agent.id, agent.ctx.tools.restrict({ deny }))
    } finally {
      updating = false
    }
  }
  {
    ctx.on('tools/change', () => {
      if (!updating) for (const agent of ctx.get('agents')?.list() ?? []) refresh(agent)
    })
    ctx.on('agent/created', ({ agent }) => {
      refresh(agent)
    })
    ctx.on('agent/disposed', ({ agent }) => {
      disposers.get(agent.id)?.()
      disposers.delete(agent.id)
    })
  }
  const tools = ctx.get('tools')
  if (tools)
    tools.guard((exec) => {
      const value = assignment(exec.agent)
      return !toolAllowed(exec.name, value, exec.agent) ? 'Harness role does not permit this tool.' : undefined
    })
  return {
    /** @param id 能力 ID。 @param invalidate 官方 Provider 的缓存失效回调；卸载传 undefined。 */
    skillInvalidator(id: string, invalidate: (() => void) | undefined) {
      if (invalidate) skillInvalidators.set(id, invalidate)
      else skillInvalidators.delete(id)
    },
    /** @param scope 调用 Agent。 @param id 能力 ID。 @returns 无角色沿用默认范围，有角色只能发现选定 Skill。 */
    allows(scope: object | undefined, id: string, workspace = '') {
      const agent = ctx
        .get('agents')
        ?.list()
        .find(item => item === scope)
      if (workspace && workspace !== agentWorkspace(agent, ctx)) return false
      const value = assignment(scope)
      return !value || value.capabilities.includes(id)
    },
    /** @param id 插件能力。 @param names 该插件贡献的工具。 @returns 登记归属，重载时不得继承旧的工具名单。 */
    ownTools(id: string, names: string[], workspace = '') {
      const key = JSON.stringify([id, workspace])
      for (const name of owners.get(key) ?? []) {
        const owner = toolOwners.get(name)
        if (owner?.id === id && owner.workspace === workspace) toolOwners.delete(name)
      }
      owners.set(key, names)
      for (const name of names) toolOwners.set(name, { id, workspace })
      for (const agent of ctx.get('agents')?.list() ?? []) refresh(agent)
    },
    /** @param id 能力 ID。 @param name 动态工具名。 @param present 注册或撤销。 @param workspace 账户范围。 @returns 只改变此工具归属，不覆盖同插件的静态工具。 */
    updateTool(id: string, name: string, present: boolean, workspace = '') {
      const key = JSON.stringify([id, workspace])
      const names = new Set(owners.get(key) ?? [])
      if (present) names.add(name)
      else names.delete(name)
      this.ownTools(id, [...names], workspace)
    },
    /**
     * @param agent 目标空闲 Agent。
     * @param capabilities 已解析并激活的能力集合。
     * @param permissions 权限声明；仅执行无条件 tool:<名称或前缀*> 拒绝，其他强制规则拒绝应用。
     * @returns 可持久化的脱敏范围；安装范围不提升原生权限。
     */
    install(agent: Agent, capabilities: string[], permissions: RolePermission[] = []) {
      const denied: string[] = []
      for (const rule of permissions) {
        if (rule.effect === 'allow') continue
        if (
          rule.effect !== 'deny' ||
          rule.resource !== '*' ||
          !/^tool:[A-Za-z0-9_.*-]+$/.test(rule.action) ||
          (rule.action.slice(5).includes('*') && !/^[^*]*\*$/.test(rule.action.slice(5)))
        )
          throw new HubError('HUB_ROLE_POLICY_UNSUPPORTED')
        denied.push(rule.action.slice(5))
      }
      const value = {
        capabilities: [...new Set(capabilities.map(capabilityId))],
        denied,
      }
      assignments.set(agent.id, value)
      for (const target of ctx.get('agents')?.list() ?? [agent]) refresh(target)
      for (const invalidate of skillInvalidators.values()) invalidate()
      return value
    },
    /** @param agent 恢复后的 Agent。 @param input 持久化脱敏范围。 @returns 检验后重新挂载，不接受任意秘密或可执行配置。 */
    restore(agent: Agent, input: unknown) {
      const value = object(input, 'HUB_LOCAL_STATE_INVALID')
      if (
        !Array.isArray(value.capabilities) ||
        !Array.isArray(value.denied) ||
        value.denied.some((item: unknown) => typeof item !== 'string')
      )
        throw new HubError('HUB_LOCAL_STATE_INVALID')
      const names = value.denied.map((item: unknown) => {
        if (typeof item !== 'string') throw new HubError('HUB_LOCAL_STATE_INVALID')
        return item
      })
      this.install(
        agent,
        value.capabilities.map(capabilityId),
        names.map(name => ({
          effect: 'deny',
          action: `tool:${name}`,
          resource: '*',
        })),
      )
    },
    /** @param agent 目标 Agent。 @returns 只撤销本插件限制，不撤销原生策略。 */
    clear(agent: Agent) {
      assignments.delete(agent.id)
      disposers.get(agent.id)?.()
      disposers.delete(agent.id)
      for (const target of ctx.get('agents')?.list() ?? []) refresh(target)
      for (const invalidate of skillInvalidators.values()) invalidate()
    },
  }
}

/** 角色范围服务契约，运行适配器不自行复制权限逻辑。 */
export type RoleAccess = ReturnType<typeof roleAccess>
