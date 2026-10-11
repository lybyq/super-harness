/** 团队模板准入：模型参数、调用次数和 DAG 在创建会话/工作树前整体验证。 */
import { capabilityId, object } from './catalog.ts'
import { HubError } from './hub-client.ts'
import type { TeamMemberSettings, TeamTaskSettings } from './types.ts'

/** @param raw 不可信成员设置。 @param roles 当前模板角色。 @returns 每个角色至多一条可执行设置。 */
export function teamMembers(raw: unknown, roles: string[]): TeamMemberSettings[] {
  if (!Array.isArray(raw) || raw.length > 20) throw new HubError('HUB_TEAM_SETTINGS_INVALID')
  const seen = new Set<string>()
  return raw.map((value) => {
    const row = object(value),
      role = capabilityId(row.role)
    if (
      !roles.includes(role) ||
      seen.has(role) ||
      Object.keys(row).some(key => !['role', 'provider', 'model', 'maxTokens', 'maxSteps', 'worktree'].includes(key))
    )
      throw new HubError('HUB_TEAM_SETTINGS_INVALID')
    seen.add(role)
    const result: TeamMemberSettings = { role }
    for (const key of ['provider', 'model'] as const) {
      if (row[key] !== undefined) {
        if (typeof row[key] !== 'string' || !row[key].trim() || row[key].length > 128)
          throw new HubError('HUB_TEAM_SETTINGS_INVALID')
        result[key] = row[key]
      }
    }
    if (Boolean(result.provider) !== Boolean(result.model)) throw new HubError('HUB_TEAM_SETTINGS_INVALID')
    for (const key of ['maxTokens', 'maxSteps'] as const) {
      if (row[key] !== undefined) {
        if (
          typeof row[key] !== 'number' ||
          !Number.isSafeInteger(row[key]) ||
          row[key] < 1 ||
          row[key] > (key === 'maxSteps' ? 1000 : 1000000)
        )
          throw new HubError('HUB_TEAM_SETTINGS_INVALID')
        result[key] = row[key]
      }
    }
    if (row.worktree !== undefined) {
      if (typeof row.worktree !== 'boolean') throw new HubError('HUB_TEAM_SETTINGS_INVALID')
      result.worktree = row.worktree
    }
    return result
  })
}

/** @param raw 任务模板。 @param roles 团队成员。 @returns 拓扑排序后的任务，拒绝循环、缺失依赖和非法写范围。 */
export function teamTasks(raw: unknown, roles: string[]): TeamTaskSettings[] {
  if (!Array.isArray(raw) || raw.length > 100) throw new HubError('HUB_TEAM_SETTINGS_INVALID')
  const byId = new Map<string, TeamTaskSettings>()
  for (const value of raw) {
    const row = object(value),
      id = capabilityId(row.id),
      member = capabilityId(row.member)
    if (
      byId.has(id) ||
      !roles.includes(member) ||
      typeof row.subject !== 'string' ||
      !row.subject.trim() ||
      row.subject.length > 200 ||
      typeof row.description !== 'string' ||
      !row.description.trim() ||
      row.description.length > 16000 ||
      !Array.isArray(row.dependsOn) ||
      row.dependsOn.length > 100 ||
      !Array.isArray(row.writeScopes) ||
      row.writeScopes.length > 100 ||
      Object.keys(row).some(
        key => !['id', 'subject', 'description', 'member', 'dependsOn', 'writeScopes'].includes(key),
      )
    )
      throw new HubError('HUB_TEAM_SETTINGS_INVALID')
    const dependsOn = row.dependsOn.map(capabilityId)
    const writeScopes = row.writeScopes.map((value) => {
      if (
        typeof value !== 'string' ||
        value.length > 512 ||
        !value ||
        value.startsWith('/') ||
        value.includes('\\') ||
        value.includes(':') ||
        value.split('/').includes('..')
      )
        throw new HubError('HUB_TEAM_SETTINGS_INVALID')
      return value
    })
    if (new Set(dependsOn).size !== dependsOn.length) throw new HubError('HUB_TEAM_SETTINGS_INVALID')
    byId.set(id, { id, member, subject: row.subject, description: row.description, dependsOn, writeScopes })
  }
  const result: TeamTaskSettings[] = [],
    visiting = new Set<string>(),
    done = new Set<string>()
  const visit = (id: string) => {
    if (done.has(id)) return
    const item = byId.get(id)
    if (!item || visiting.has(id)) throw new HubError('HUB_TEAM_SETTINGS_INVALID')
    visiting.add(id)
    item.dependsOn.forEach(visit)
    visiting.delete(id)
    done.add(id)
    result.push(item)
  }
  byId.forEach((_value, id) =>{  visit(id) })
  return result
}
