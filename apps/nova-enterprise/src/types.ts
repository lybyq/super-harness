/** Host 领域契约；网络与凭据输入必须先经过对应准入函数，类型本身不代表授权。 */
export type Scalar = string | number | boolean
/** 界面支持的公开参数与秘密参数值；数组仅用于公开参数。 */
export type ConfigurationValue = Scalar | string[]
/** Host 内部配置分区，secrets 不得进入界面响应或模型上下文。 */
export interface SavedConfiguration {
  values: Record<string, ConfigurationValue>
  secrets: Record<string, ConfigurationValue>
}
/** 持久记录尚未完成字段准入；只能在 configuration() 校验后用于运行配置。 */
export interface StoredConfiguration {
  values: Record<string, unknown>
  secrets: Record<string, unknown>
  saved?: boolean
}
/** 已准入的 JSON Schema 子集；未知关键字在 catalog 中拒绝。 */
export interface FieldSchema {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array'
  format?: 'uri'
  items?: FieldSchema
  enum?: ConfigurationValue[]
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  minItems?: number
  maxItems?: number
  uniqueItems?: boolean
}
/** 可生成表单的字段定义；secret 字段不提供默认值。 */
export interface ConfigurationField {
  key: string
  description: string
  required: boolean
  secret: boolean
  schema: FieldSchema
}
/** 角色列表准入后的公开摘要。 */
export interface RoleSummary {
  id: string
  name: string
  description: string
  version: string
  selectable: boolean
}
/** 权限声明；只有明确支持的拒绝规则才能映射到官方工具限制。 */
export interface RolePermission {
  id?: string
  effect: 'allow' | 'deny' | 'requireApproval'
  action: string
  resource: string
  enforced?: boolean
}
/** 权威角色解析中用于安装和范围控制的最小计划；不含配置值。 */
export interface ApplicationPlan {
  capabilities: { id: string; version: string; enabled: boolean }[]
  permissions: RolePermission[]
  missingRuntimeBindings: string[]
  checksum?: string
  unsupportedConditions?: boolean
  role?: { id: string; name: string; version: string }
}
/** 用户角色和团队职责；instructions 是用户明确选择注入模型的内容。 */
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
/** 团队成员模型和调用次数上限；maxTokens 是单次输出上限，不是费用预算。 */
export interface TeamMemberSettings {
  role: string
  provider?: string
  model?: string
  maxTokens?: number
  maxSteps?: number
  worktree?: boolean
}
/** 持久化共享任务定义；依赖先于任务创建，writeScopes 是协作声明而非文件沙箱。 */
export interface TeamTaskSettings {
  id: string
  subject: string
  description: string
  member: string
  dependsOn: string[]
  writeScopes: string[]
}
/** 会话的脱敏能力范围，不包含凭据或可执行绑定。 */
export interface RoleScope {
  capabilities: string[]
  denied: string[]
}
/** 真实安装收据与本进程观测结果；installed 与 active 分开表示。 */
export interface InstalledCapability {
  id: string
  version: string
  enabled: boolean
  installed: boolean
  activation: string
}
