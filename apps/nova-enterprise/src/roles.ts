/** 对接当前 Hub 的角色行和解析结果；只产生脱敏预览，不安装、不授权、不修改会话。 */
import { capabilityId, object } from './catalog.ts'
import { HubError } from './hub-client.ts'
import type { RoleSummary, RolePermission } from './types.ts'
import type { ResolveRequest } from './hub-client.ts'

/**
 * @param value 不可信文字。
 * @param max 长度上限。
 * @returns 已准入文字。
 */
function text(value: unknown, max = 2000): string {
  if (typeof value !== 'string' || value.length > max) throw new HubError('HUB_RESPONSE_INVALID')
  return value
}

/**
 * @param value 不可信列表。
 * @returns 有规模上限的数组，成员仍需校验。
 */
function list(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 1000) throw new HubError('HUB_RESPONSE_INVALID')
  return value
}

/**
 * 将 Hub 数据库角色行准入为可展示角色，不把最新草稿伪装成已发布版本。
 * @param document GET /roles 返回的角色行数组，包含 versions[].document。
 * @returns 脱敏角色摘要；只有角色与所展示版本均已发布时才允许选择。
 */
export function roleCatalog(document: unknown): RoleSummary[] {
  const seen = new Set()
  return list(document).map((value) => {
    const row = object(value),
      id = capabilityId(row.id)
    if (seen.has(id)) throw new HubError('HUB_RESPONSE_INVALID')
    seen.add(id)
    if (typeof row.published !== 'boolean') throw new HubError('HUB_RESPONSE_INVALID')
    const latest = list(row.versions)[0]
    if (latest === undefined)
      return {
        id,
        name: text(row.displayName, 128),
        description: text(row.description ?? ''),
        version: '',
        selectable: false,
      }
    const version = object(latest),
      profile = object(version.document),
      metadata = object(profile.metadata)
    if (
      profile.kind !== 'RoleProfile' ||
      profile.apiVersion !== 'harness.nova/v1' ||
      metadata.id !== id ||
      typeof version.published !== 'boolean'
    )
      throw new HubError('HUB_RESPONSE_INVALID')
    return {
      id,
      name: text(row.displayName, 128),
      description: text(row.description ?? ''),
      version: text(metadata.version, 128),
      selectable: row.published && version.published,
    }
  })
}

/**
 * 生成固定 DeepSeek Runtime 的单角色或多角色解析请求；拒绝客户端夹带配置和秘密。
 * @param document 界面提交的 {roles:string[]}，角色必须来自最新已发布列表。
 * @param available 本次重新从 Hub 取得并准入的角色列表。
 * @returns 当前 Hub /resolve 接受的请求，显式 runtime 和 user 作用域。
 */
export function roleRequest(document: unknown, available: RoleSummary[]): ResolveRequest {
  const input = object(document)
  if (
    Object.keys(input).some(key => !['roles', 'add', 'remove', 'disable', 'includeOptional'].includes(key)) ||
    !Array.isArray(input.roles) ||
    input.roles.length < 1 ||
    input.roles.length > 20
  )
    throw new HubError('HUB_ROLE_SELECTION_INVALID')
  const overrides: Record<string, string[]> = {}
  for (const key of ['add', 'remove', 'disable', 'includeOptional']) {
    if (input[key] === undefined) continue
    if (!Array.isArray(input[key]) || input[key].length > 100) throw new HubError('HUB_ROLE_SELECTION_INVALID')
    const ids = input[key].map(capabilityId)
    if (new Set(ids).size !== ids.length) throw new HubError('HUB_ROLE_SELECTION_INVALID')
    overrides[key] = ids
  }
  const roles = input.roles.map(capabilityId)
  if (
    new Set(roles).size !== roles.length ||
    roles.some(id => !available.some(role => role.id === id && role.selectable))
  )
    throw new HubError('HUB_ROLE_SELECTION_INVALID')
  return {
    runtime: 'deepseek-harness',
    scope: 'user',
    role: capabilityId(roles[0]),
    roles,
    ...overrides,
  }
}

/**
 * 校验并脱敏 Hub 解析结果：只保留精确版本、顺序、权限说明及所需配置键名。
 * 丢弃原始 configuration、defaults 和权限 conditions，避免误把秘密回传或执行。
 * @param document POST /resolve 返回的期望状态；绑定存在不等于 SDK 已兼容。
 * @returns 安装前预览，applied 固定 false；必须另经制品、兼容及权限执行器验收。
 */
export function rolePlan(document: unknown) {
  const plan = object(document),
    profile = object(plan.role),
    metadata = object(profile.metadata)
  if (profile.kind !== 'RoleProfile' || profile.apiVersion !== 'harness.nova/v1')
    throw new HubError('HUB_RESPONSE_INVALID')
  const versions = object(plan.versions),
    compatibility = object(plan.compatibility),
    seen = new Set()
  const optionalCapabilities =
    plan.optionalCapabilities === undefined ? [] : list(plan.optionalCapabilities).map(capabilityId)
  const capabilities = list(plan.capabilities).map((value) => {
    const item = object(value),
      id = capabilityId(item.id),
      version = text(item.version, 128)
    const hasRuntimeBinding = compatibility[id]
    if (
      seen.has(id) ||
      versions[id] !== version ||
      typeof item.enabled !== 'boolean' ||
      typeof hasRuntimeBinding !== 'boolean'
    )
      throw new HubError('HUB_RESPONSE_INVALID')
    seen.add(id)
    return {
      id,
      version,
      enabled: item.enabled,
      hasRuntimeBinding,
      reason: list(item.reason).map(value => text(value, 1000)),
    }
  })
  const installationOrder = list(plan.installationOrder).map(capabilityId)
  if (
    installationOrder.length !== seen.size ||
    new Set(installationOrder).size !== seen.size ||
    installationOrder.some(id => !seen.has(id))
  )
    throw new HubError('HUB_RESPONSE_INVALID')
  const permissions: RolePermission[] = list(plan.permissions).map((value) => {
    const rule = object(value)
    if (
      (rule.effect !== 'allow' && rule.effect !== 'deny' && rule.effect !== 'requireApproval') ||
      typeof rule.enforced !== 'boolean'
    )
      throw new HubError('HUB_RESPONSE_INVALID')
    return {
      id: capabilityId(rule.id),
      effect: rule.effect,
      action: text(rule.action, 500),
      resource: text(rule.resource, 500),
      enforced: rule.enforced,
    }
  })
  if (list(plan.conflicts).length) throw new HubError('HUB_ROLE_PLAN_CONFLICT')
  const checksum = text(plan.checksum, 64)
  if (!/^[a-f0-9]{64}$/i.test(checksum)) throw new HubError('HUB_RESPONSE_INVALID')
  return {
    role: {
      id: capabilityId(metadata.id),
      name: text(metadata.displayName, 128),
      version: text(metadata.version, 128),
    },
    capabilities,
    optionalCapabilities,
    installationOrder,
    permissions,
    checksum,
    requiredSecrets: list(plan.requiredSecrets).map(value => text(value, 256)),
    requiredConfiguration: list(plan.requiredConfiguration).map(value => text(value, 256)),
    warningCount: list(plan.warnings).length,
    unsupportedConditions: list(plan.permissions).some(
      rule => Object.keys(object(object(rule).conditions ?? {})).length > 0,
    ),
    missingRuntimeBindings: capabilities
      .filter(item => item.enabled && !item.hasRuntimeBinding)
      .map(item => item.id),
    applied: false,
  }
}
