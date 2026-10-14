/** Nova Host API 的界面准入层；密钥只作为明确写入的请求发送，不接受密钥回填。 */
export type Scalar = string | number | boolean
export type ConfigurationValue = Scalar | string[]
/** 能力元数据与 Host 已提交收据；installed 不等于已成功启动。 */
export interface Capability {
  id: string
  type: string
  name: string
  description: string
  source: string
  version: string
  hasRuntimeBinding: boolean
  installed: boolean
  enabled?: boolean
  activation?: string
}
/** Host 已准入的配置字段；不能由界面自行放宽约束或改变秘密分区。 */
export interface Field {
  key: string
  description: string
  required: boolean
  secret: boolean
  schema: {
    type: string
    enum?: Scalar[]
    minimum?: number
    maximum?: number
    minLength?: number
    maxLength?: number
    format?: string
    minItems?: number
    maxItems?: number
    uniqueItems?: boolean
    items?: { type: string }
  }
}
/** 脱敏表单：values 只含公开参数，configuredSecrets 只含已配置密钥的名称。 */
export interface Form {
  capability: Capability
  fields: Field[]
  values: Record<string, ConfigurationValue>
  configuredSecrets: string[]
  configurationSaved: boolean
  versions: { version: string; hasRuntimeBinding: boolean }[]
}
/** 已准入的 Hub 角色摘要；selectable 仅表示当前展示版本已发布，不表示角色已应用。 */
export interface Role {
  id: string
  name: string
  description: string
  version: string
  selectable: boolean
}
/** 角色解析预览；权限仅作说明，真正应用必须通过安装器和权限执行器。 */
export interface RolePlan {
  role: { id: string; name: string; version: string }
  capabilities: { id: string; version: string; enabled: boolean; hasRuntimeBinding: boolean; reason: string[] }[]
  installationOrder: string[]
  permissions: { id: string; effect: string; action: string; resource: string; enforced: boolean }[]
  requiredSecrets: string[]
  requiredConfiguration: string[]
  missingRuntimeBindings: string[]
  warningCount: number
  checksum: string
  applied: false
}
/** 界面错误只保留稳定码，不记录可能含账号密码的响应体或原始异常。 */
export class HubUiError extends Error {
  /**
   * @param code 用于本地化的稳定错误标识，不传入密钥或远端异常消息。
   */
  constructor(readonly code: string) {
    super(code)
  }
}
/**
 * @param value 不可信响应片段。
 * @returns 排除 null 和数组的对象；具体字段仍需校验。
 */
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new HubUiError('HUB_RESPONSE_INVALID')
  return value as Record<string, unknown>
}
/**
 * @param value 不可信字段。
 * @returns 已确认类型的文本，不作为 HTML 执行。
 */
function text(value: unknown): string {
  if (typeof value !== 'string') throw new HubUiError('HUB_RESPONSE_INVALID')
  return value
}
/**
 * @param value 不可信字段。
 * @returns 严格布尔值，不把字符串等隐式转成 true。
 */
function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new HubUiError('HUB_RESPONSE_INVALID')
  return value
}
/**
 * @param value 不可信字段。
 * @returns 尚需逐项准入的数组。
 */
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new HubUiError('HUB_RESPONSE_INVALID')
  return value
}
/**
 * @param value 不可信参数。
 * @returns 字符串、有限数值或布尔值；拒绝对象及非有限数值。
 */
function scalar(value: unknown): Scalar {
  if (typeof value !== 'string' && typeof value !== 'boolean' && (typeof value !== 'number' || !Number.isFinite(value)))
    throw new HubUiError('HUB_RESPONSE_INVALID')
  return value
}
/**
 * @param value 不可信公开参数。
 * @returns 支持的标量或字符串数组，不包含秘密分区。
 */
function configurationValue(value: unknown): ConfigurationValue {
  if (Array.isArray(value)) return value.map(text)
  return scalar(value)
}
/**
 * @param value Host 目录项。
 * @returns 经字段准入的摘要与本进程运行状态。
 */
function capability(value: unknown): Capability {
  const item = object(value)
  return {
    id: text(item.id),
    type: text(item.type),
    name: text(item.name),
    description: text(item.description),
    source: text(item.source),
    version: text(item.version),
    hasRuntimeBinding: boolean(item.hasRuntimeBinding),
    installed: boolean(item.installed),
    ...(item.enabled === undefined ? {} : { enabled: boolean(item.enabled) }),
    ...(item.activation === undefined ? {} : { activation: text(item.activation) }),
  }
}
/**
 * 调用当前桌面的官方鉴权 Host 路由，不能直接访问私有 npm 或 GitLab。
 * @param path 本模块调用方构造的 Nova 相对路由。
 * @param signal 面板提供的取消信号。
 * @param payload 可选 JSON 写入体；不写入错误、日志或持久化界面状态。
 * @returns 成功响应的 value；仍需交给 connection、catalog 或 form 准入。
 */
export async function invoke(path: string, signal: AbortSignal, payload?: object, workspace = ''): Promise<unknown> {
  let response: Response
  try {
    const suffix = workspace ? `${path.includes('?') ? '&' : '?'}workspace=${encodeURIComponent(workspace)}` : ''
    response = await fetch(`api/nova-hub/${path}${suffix}`, {
      method: payload === undefined ? 'GET' : 'POST',
      signal,
      ...(payload === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
    })
  } catch {
    throw new HubUiError('HUB_UNAVAILABLE')
  }
  let json: unknown
  try {
    json = await response.json()
  } catch {
    throw new HubUiError('HUB_RESPONSE_INVALID')
  }
  const envelope = object(json)
  if (envelope.ok !== true || !response.ok) throw new HubUiError(text(object(envelope.error).code))
  return envelope.value
}
/**
 * @param value Host 响应值。
 * @returns 管理员连接配置状态，不暴露 Hub 地址或令牌，也不代表网络连通。
 */
export function connection(value: unknown): {
  configured: boolean
  authentication: 'none' | 'bearer'
  workspaces: { id: string; cwd: string }[]
  defaultMcpEnabled?: boolean
} {
  const item = object(value)
  if (item.authentication !== 'none' && item.authentication !== 'bearer') throw new HubUiError('HUB_RESPONSE_INVALID')
  return {
    configured: boolean(item.configured),
    authentication: item.authentication,
    ...(item.defaultMcpEnabled === undefined ? {} : { defaultMcpEnabled: boolean(item.defaultMcpEnabled) }),
    workspaces:
      item.workspaces === undefined
        ? []
        : array(item.workspaces).map((value) => {
          const row = object(value)
          return { id: text(row.id), cwd: text(row.cwd) }
        }),
  }
}

/** 默认安装处理记录只显示资源、固定版本和状态，不接收下载地址或秘密。 */
export interface DefaultMcpStatus {
  configured: boolean
  revision: string
  dismissed: boolean
  items: { id: string; installed: boolean; enabled: boolean; version: string; activation: string; error?: string }[]
}
/** @param value Host 默认安装状态。 @returns 经字段校验的脱敏结果。 */
export function defaultMcpStatus(value: unknown): DefaultMcpStatus {
  const item = object(value)
  return { configured: boolean(item.configured), revision: text(item.revision), dismissed: boolean(item.dismissed),
    items: array(item.items).map((value) => {
      const row = object(value)
      return { id: text(row.id), installed: boolean(row.installed), enabled: boolean(row.enabled),
        version: text(row.version), activation: text(row.activation),
        ...(row.error === undefined ? {} : { error: text(row.error) }) }
    }) }
}
/** @param value Host 所有已安装 MCP 的动态表单。 @returns 每项独立解析；错误只包含稳定码。 */
export function mcpForms(value: unknown): { data: Form[]; errors: { id: string; code: string }[] } {
  const item = object(value)
  return { data: array(item.data).map(form), errors: array(item.errors).map((value) => {
    const row = object(value)
    return { id: text(row.id), code: text(row.code) }
  }) }
}
/** @param value 批量配置的逐项结果。 @returns 保存与激活分开呈现，不把部分失败当作成功。 */
export function mcpSaveResults(value: unknown): { id: string; saved: boolean; activation: string; error?: string }[] {
  return array(object(value).results).map((value) => {
    const row = object(value)
    return { id: text(row.id), saved: boolean(row.saved), activation: text(row.activation),
      ...(row.error === undefined ? {} : { error: text(row.error) }) }
  })
}
/**
 * @param value Host 响应值。
 * @returns 经准入的能力摘要和非负整数总数。
 */
export function catalog(value: unknown): { data: Capability[]; total: number; offline: boolean } {
  const item = object(value)
  if (typeof item.total !== 'number' || !Number.isSafeInteger(item.total) || item.total < 0)
    throw new HubUiError('HUB_RESPONSE_INVALID')
  return {
    data: array(item.data).map(capability),
    total: item.total,
    offline: item.offline === undefined ? false : boolean(item.offline),
  }
}
/**
 * 准入脱敏配置表单，拒绝不支持的值结构。
 * @param value Host 响应值，不能包含历史密钥明文。
 * @returns 可用于受控 React 表单的配置字段、公开值和密钥键名。
 */
export function form(value: unknown): Form {
  const item = object(value)
  const values = Object.fromEntries(
    Object.entries(object(item.values)).map(([key, value]) => [key, configurationValue(value)]),
  )
  const fields = array(item.fields).map((value) => {
    const entry = object(value),
      spec = object(entry.schema)
    const schema: Field['schema'] = { type: text(spec.type) }
    if (spec.enum !== undefined) schema.enum = array(spec.enum).map(scalar)
    for (const key of ['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems'] as const) {
      if (spec[key] === undefined) continue
      if (typeof spec[key] !== 'number' || !Number.isFinite(spec[key])) throw new HubUiError('HUB_RESPONSE_INVALID')
      schema[key] = spec[key]
    }
    if (spec.format !== undefined) schema.format = text(spec.format)
    if (spec.uniqueItems !== undefined) schema.uniqueItems = boolean(spec.uniqueItems)
    if (spec.items !== undefined) schema.items = { type: text(object(spec.items).type) }
    return {
      key: text(entry.key),
      description: text(entry.description),
      required: boolean(entry.required),
      secret: boolean(entry.secret),
      schema,
    }
  })
  return {
    capability: capability(item.capability),
    fields,
    values,
    configuredSecrets: array(item.configuredSecrets).map(text),
    configurationSaved: boolean(item.configurationSaved),
    versions:
      item.versions === undefined
        ? []
        : array(item.versions).map((value) => {
          const row = object(value)
          return { version: text(row.version), hasRuntimeBinding: boolean(row.hasRuntimeBinding) }
        }),
  }
}

/**
 * @param value Host 角色列表响应。
 * @returns 仅含可展示元数据的角色列表，不含草稿内容或默认配置。
 */
export function roles(value: unknown): Role[] {
  return array(value).map((value) => {
    const row = object(value)
    return {
      id: text(row.id),
      name: text(row.name),
      description: text(row.description),
      version: text(row.version),
      selectable: boolean(row.selectable),
    }
  })
}

/**
 * 准入角色解析预览，不允许 Host 或界面在没有安装证据时声称 applied:true。
 * @param value Host 已脱敏的解析结果。
 * @returns 精确能力版本、顺序和权限说明；不包含秘密值、配置值或可执行指令。
 */
export function rolePlan(value: unknown): RolePlan {
  const plan = object(value),
    role = object(plan.role)
  if (
    plan.applied !== false ||
    typeof plan.warningCount !== 'number' ||
    !Number.isSafeInteger(plan.warningCount) ||
    plan.warningCount < 0
  )
    throw new HubUiError('HUB_RESPONSE_INVALID')
  return {
    role: { id: text(role.id), name: text(role.name), version: text(role.version) },
    capabilities: array(plan.capabilities).map((value) => {
      const item = object(value)
      return {
        id: text(item.id),
        version: text(item.version),
        enabled: boolean(item.enabled),
        hasRuntimeBinding: boolean(item.hasRuntimeBinding),
        reason: array(item.reason).map(text),
      }
    }),
    permissions: array(plan.permissions).map((value) => {
      const rule = object(value)
      return {
        id: text(rule.id),
        effect: text(rule.effect),
        action: text(rule.action),
        resource: text(rule.resource),
        enforced: boolean(rule.enforced),
      }
    }),
    installationOrder: array(plan.installationOrder).map(text),
    requiredSecrets: array(plan.requiredSecrets).map(text),
    requiredConfiguration: array(plan.requiredConfiguration).map(text),
    missingRuntimeBindings: array(plan.missingRuntimeBindings).map(text),
    checksum: text(plan.checksum),
    warningCount: plan.warningCount,
    applied: false,
  }
}

/** 用户保存的模型职责模板；团队模板还需明确任务才会启动成员。 */
export interface TeamMemberSettings {
  role: string
  provider?: string | undefined
  model?: string | undefined
  maxTokens?: number | undefined
  maxSteps?: number | undefined
  worktree?: boolean
}
export interface TeamTaskSettings {
  id: string
  subject: string
  description: string
  member: string
  dependsOn: string[]
  writeScopes: string[]
}
export interface RoleTemplate {
  id: string
  kind: 'role' | 'team'
  name: string
  instructions: string
  roles: string[]
  members?: TeamMemberSettings[]
  tasks?: TeamTaskSettings[]
  add?: string[]
  remove?: string[]
  disable?: string[]
  includeOptional?: string[]
}
/** 明确选择的官方存活会话，不用最后活跃会话猜测目标。 */
export interface HubSession {
  id: string
  cwd: string
  status: string
}
/** @param value Host 模板列表。 @returns 已准入的用户模板。 */
export function templates(value: unknown): RoleTemplate[] {
  return array(value).map((value) => {
    const row = object(value)
    if (row.kind !== 'role' && row.kind !== 'team') throw new HubUiError('HUB_RESPONSE_INVALID')
    return {
      id: text(row.id),
      kind: row.kind,
      name: text(row.name),
      instructions: text(row.instructions),
      roles: array(row.roles).map(text),
      ...Object.fromEntries(
        ['add', 'remove', 'disable', 'includeOptional']
          .filter(key => row[key] !== undefined)
          .map(key => [key, array(row[key]).map(text)]),
      ),
      ...(row.members === undefined
        ? {}
        : {
          members: array(row.members).map((value) => {
            const member = object(value)
            return {
              role: text(member.role),
              ...(member.provider === undefined
                ? {}
                : { provider: text(member.provider), model: text(member.model) }),
              ...(member.maxTokens === undefined ? {} : { maxTokens: Number(member.maxTokens) }),
              ...(member.maxSteps === undefined ? {} : { maxSteps: Number(member.maxSteps) }),
              ...(member.worktree === undefined ? {} : { worktree: boolean(member.worktree) }),
            }
          }),
        }),
      ...(row.tasks === undefined
        ? {}
        : {
          tasks: array(row.tasks).map((value) => {
            const task = object(value)
            return {
              id: text(task.id),
              subject: text(task.subject),
              description: text(task.description),
              member: text(task.member),
              dependsOn: array(task.dependsOn).map(text),
              writeScopes: array(task.writeScopes).map(text),
            }
          }),
        }),
    }
  })
}
/** @param value Host 存活会话列表。 @returns 已准入的目标会话。 */
export function sessions(value: unknown): HubSession[] {
  return array(value).map((value) => {
    const row = object(value)
    return { id: text(row.id), cwd: text(row.cwd), status: text(row.status) }
  })
}
/** @param value Host 安装列表。 @returns 已准入的能力，不含 Store 路径或秘密。 */
export function installed(value: unknown): Capability[] {
  return array(object(value).data).map(capability)
}
/** @param value Host README 响应。 @returns 以安全文本节点呈现的 Markdown。 */
export function readme(value: unknown): string {
  return text(object(value).content)
}
/** @param value Host 应用结果。 @returns 明确的注入或团队启动结果。 */
export function applied(value: unknown): 'queued' | 'team-started' | 'team-partial' {
  const outcome = object(value).outcome
  if (outcome !== 'queued' && outcome !== 'team-started' && outcome !== 'team-partial')
    throw new HubUiError('HUB_RESPONSE_INVALID')
  return outcome
}
