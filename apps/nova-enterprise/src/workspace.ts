/** 项目身份只来自官方存活会话，界面不能提交任意磁盘路径来取得配置或启动 MCP。 */
import { createHash } from 'node:crypto'
import { isAbsolute, resolve } from 'node:path'
import { HubError } from './hub-client.ts'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'

/** 项目配置身份；空 ID 是用户级能力，非空 ID 与官方会话 cwd 绑定。 */
export interface WorkspaceScope {
  id: string
  cwd: string
}

/** @param cwd 官方会话工作目录。 @returns 跨重启稳定、Windows 下忽略路径大小写的项目标识。 */
export function workspaceId(cwd: string): string {
  if (!isAbsolute(cwd)) throw new HubError('HUB_WORKSPACE_INVALID')
  const canonical = process.platform === 'win32' ? resolve(cwd).toLowerCase() : resolve(cwd)
  return `ws-${createHash('sha256').update(canonical).digest('hex').slice(0, 32)}`
}

/** @param agent 官方 Agent。 @returns 无 cwd 的会话使用用户级配置，不猜测进程目录。 */
export function agentWorkspace(agent: Agent | undefined, ctx?: Context): string {
  const registry = ctx?.get('agents'),
    visited = new Set<string>()
  let root = agent
  while (root && registry && !visited.has(root.id)) {
    visited.add(root.id)
    const child = root,
      owner = registry.list().find(item => registry.isOwnedBy(child.id, item))
    if (!owner) break
    root = owner
  }
  const cwd = root?.session.header.cwd
  return cwd ? workspaceId(cwd) : ''
}

/** @param ctx 官方 Host。 @returns 去重的存活项目；目录名称仅供界面展示，不含凭据。 */
export function workspaces(ctx: Context): WorkspaceScope[] {
  const result = new Map<string, WorkspaceScope>()
  for (const agent of ctx.get('agents')?.roots() ?? []) {
    const cwd = agent.session.header.cwd
    if (cwd) result.set(workspaceId(cwd), { id: workspaceId(cwd), cwd })
  }
  return [...result.values()]
}

/** @param ctx 官方 Host。 @param id 用户选中的不透明项目 ID。 @returns 官方会话认可的项目，不接受任意路径。 */
export function workspaceScope(ctx: Context, id: unknown): WorkspaceScope {
  if (id === undefined || id === '') return { id: '', cwd: '' }
  if (typeof id !== 'string') throw new HubError('HUB_WORKSPACE_INVALID')
  const scope = workspaces(ctx).find(item => item.id === id)
  if (!scope) throw new HubError('HUB_WORKSPACE_INVALID')
  return scope
}
