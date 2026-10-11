/** Hub 领域数据准入：将不可信 JSON 转为可展示目录与可校验表单，不授予执行权限。 */
import { HubError } from './hub-client.ts'
import type { ConfigurationField, ConfigurationValue, FieldSchema, SavedConfiguration } from './types.ts'

const ID = /^[a-z0-9][a-z0-9._-]{0,127}$/
const TYPES = ['mcp', 'skill', 'plugin', 'agent', 'hook', 'policy', 'pack']
const SCHEMA_KEYS = new Set([
  'type',
  'title',
  'description',
  'default',
  'enum',
  'minimum',
  'maximum',
  'minLength',
  'maxLength',
  'format',
  'items',
  'minItems',
  'maxItems',
  'uniqueItems',
])

/**
 * 接受普通 JSON 对象，拒绝数组和 null；后续仍需逐字段校验。
 * @param value 网络或持久化层返回的值。
 * @param code 所属操作的稳定结构错误码；默认用于 Hub 响应。
 * @returns 未完成领域校验的对象。
 * @throws 结构不合法时返回稳定错误码。
 */
export function object(value: unknown, code = 'HUB_RESPONSE_INVALID'): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new HubError(code)
  return value as Record<string, unknown>
}

/**
 * 在拼接 API 路径前验证能力标识，阻止路径穿越与控制字符。
 * @param value Hub 能力标识。
 * @returns 已校验、但不代表具备安装权限的能力标识。
 */
export function capabilityId(value: unknown): string {
  if (typeof value !== 'string' || !ID.test(value)) throw new HubError('HUB_CAPABILITY_ID_INVALID')
  return value
}

/**
 * 校验有长度上限的显示文本；可选字段缺失时返回空字符串。
 * @param value 输入值。
 * @param max 最大字符数。
 * @param [optional=false] 是否允许 undefined。
 * @returns 供 React 文本节点使用的内容，不能作为 HTML 执行。
 */
function text(value: unknown, max: number, optional = false): string {
  if (optional && value === undefined) return ''
  if (typeof value !== 'string' || value.length > max) throw new HubError('HUB_RESPONSE_INVALID')
  return value
}

/**
 * 提取能力展示摘要，优先展示推荐版本；绑定存在不等于已安装、已兼容或已授权。
 * @param document Hub 能力文档。
 * @returns 不含配置密钥的目录元数据；默认未安装，由 Host 合并真实本机收据，不能把绑定声明当作安装证明。
 */
export function summary(document: unknown) {
  const cap = object(document)
  if (typeof cap.type !== 'string' || !TYPES.includes(cap.type) || !Array.isArray(cap.versions))
    throw new HubError('HUB_RESPONSE_INVALID')
  const source = object(cap.source)
  if (typeof source.kind !== 'string' || !['gitlab', 'npm', 'local'].includes(source.kind))
    throw new HubError('HUB_RESPONSE_INVALID')
  const versions = cap.versions.map((value: unknown) => {
    const version = object(value)
    const bindings = object(version.runtimeBindings)
    return {
      version: text(version.version, 128),
      recommended: version.recommended === true,
      hasBinding: Object.hasOwn(bindings, 'deepseek-harness'),
    }
  })
  const selected = versions.find(version => version.recommended) ?? versions[0]
  return {
    id: capabilityId(cap.id),
    type: cap.type,
    name: text(cap.displayName, 256),
    description: text(cap.description, 10000, true),
    source: source.kind,
    version: selected?.version ?? '',
    hasRuntimeBinding: selected?.hasBinding ?? false,
    installed: false,
  }
}

/**
 * 校验当前 Hub 的分页目录响应。
 * @param document 形如 {data,total} 的响应。
 * @returns 已准入的目录摘要。
 */
export function catalog(document: unknown) {
  const page = object(document)
  if (
    !Array.isArray(page.data) ||
    typeof page.total !== 'number' ||
    !Number.isSafeInteger(page.total) ||
    page.total < 0
  )
    throw new HubError('HUB_RESPONSE_INVALID')
  return { data: page.data.map(summary), total: page.total }
}

/**
 * 将受支持的 JSON Schema 子集编译为表单约束；未知约束一律拒绝，不能静默忽略。
 * 支持标量、绝对 URI 和字符串数组；不复制 default，避免密钥默认值进入浏览器。
 * @param value Hub 配置项声明。
 * @param [depth=0] 当前数组成员嵌套深度；只接受一层字符串数组，避免深递归耗尽调用栈。
 * @returns Host 和界面共用的精简约束。
 * @throws 不支持的类型、作用域或校验关键字必须由维护人处理。
 */
function schema(value: unknown, depth = 0): FieldSchema {
  if (depth > 1) throw new HubError('HUB_CONFIG_SCHEMA_UNSUPPORTED')
  const source = object(value)
  if (Object.keys(source).some(key => !SCHEMA_KEYS.has(key))) throw new HubError('HUB_CONFIG_SCHEMA_UNSUPPORTED')
  const type = source.type ?? 'string'
  if (type !== 'string' && type !== 'number' && type !== 'integer' && type !== 'boolean' && type !== 'array')
    throw new HubError('HUB_CONFIG_SCHEMA_UNSUPPORTED')
  const result: FieldSchema = { type }
  if (source.format !== undefined) {
    if (type !== 'string' || source.format !== 'uri') throw new HubError('HUB_CONFIG_SCHEMA_UNSUPPORTED')
    result.format = 'uri'
  }
  if (type === 'array') {
    if (source.enum !== undefined || source.items === undefined) throw new HubError('HUB_CONFIG_SCHEMA_UNSUPPORTED')
    result.items = schema(source.items, depth + 1)
    if (result.items.type !== 'string') throw new HubError('HUB_CONFIG_SCHEMA_UNSUPPORTED')
    for (const key of ['minItems', 'maxItems'] as const) {
      if (source[key] === undefined) continue
      if (typeof source[key] !== 'number' || !Number.isSafeInteger(source[key]) || source[key] < 0)
        throw new HubError('HUB_RESPONSE_INVALID')
      result[key] = source[key]
    }
    if (source.uniqueItems !== undefined) {
      if (typeof source.uniqueItems !== 'boolean') throw new HubError('HUB_RESPONSE_INVALID')
      result.uniqueItems = source.uniqueItems
    }
    if (result.minItems !== undefined && result.maxItems !== undefined && result.minItems > result.maxItems)
      throw new HubError('HUB_RESPONSE_INVALID')
  } else if (['items', 'minItems', 'maxItems', 'uniqueItems'].some(key => source[key] !== undefined))
    throw new HubError('HUB_CONFIG_SCHEMA_UNSUPPORTED')
  for (const key of ['minimum', 'maximum', 'minLength', 'maxLength'] as const) {
    if (source[key] === undefined) continue
    if (
      typeof source[key] !== 'number' ||
      !Number.isFinite(source[key]) ||
      (key.endsWith('Length') && (!Number.isSafeInteger(source[key]) || source[key] < 0))
    )
      throw new HubError('HUB_RESPONSE_INVALID')
    result[key] = source[key]
  }
  if (
    (result.minimum !== undefined && result.maximum !== undefined && result.minimum > result.maximum) ||
    (result.minLength !== undefined && result.maxLength !== undefined && result.minLength > result.maxLength)
  )
    throw new HubError('HUB_RESPONSE_INVALID')
  if (source.enum !== undefined) {
    if (!Array.isArray(source.enum) || source.enum.length === 0) throw new HubError('HUB_RESPONSE_INVALID')
    result.enum = source.enum.map((value: unknown) => {
      if (!validValue({ type }, value)) throw new HubError('HUB_RESPONSE_INVALID')
      return value
    })
  }
  // 不复制 default：秘密字段的默认值可能就是账号密码或访问令牌。
  return result
}

/**
 * 按已准入的约束检查单个值；URI 语法校验不是出站网络权限控制。
 * @param spec schema() 产生的可信约束。
 * @param value 用户提交或已保存的值。
 * @returns 类型、边界、数组成员和 URI 格式是否满足要求。
 */
function validValue(spec: FieldSchema, value: unknown): value is ConfigurationValue {
  if (spec.type === 'array') {
    const items = spec.items
    return (
      items !== undefined &&
      Array.isArray(value) &&
      (spec.minItems === undefined || value.length >= spec.minItems) &&
      (spec.maxItems === undefined || value.length <= spec.maxItems) &&
      (!spec.uniqueItems || new Set(value).size === value.length) &&
      value.every((item: unknown) => validValue(items, item) && (!items.enum || items.enum.includes(item)))
    )
  }
  if (spec.format === 'uri') {
    if (typeof value !== 'string' || /[\u0000-\u0020]/.test(value)) return false
    try {
      new URL(value)
    } catch (_error) {
      return false
    }
  }
  if (spec.type === 'string')
    return (
      typeof value === 'string' &&
      (spec.minLength === undefined || value.length >= spec.minLength) &&
      (spec.maxLength === undefined || value.length <= spec.maxLength)
    )
  if (spec.type === 'boolean') return typeof value === 'boolean'
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    (spec.type !== 'integer' || Number.isSafeInteger(value)) &&
    (spec.minimum === undefined || value >= spec.minimum) &&
    (spec.maximum === undefined || value <= spec.maximum)
  )
}

/**
 * 合并公开配置项和用户级密钥声明，生成无重复键的界面字段列表。
 * @param document Hub 权威能力文档。
 * @returns 可安全生成表单的字段；项目、会话、部署级密钥当前拒绝代配。
 */
export function fields(document: unknown): ConfigurationField[] {
  const cap = object(document)
  if (!Array.isArray(cap.configuration) || !Array.isArray(cap.secrets)) throw new HubError('HUB_RESPONSE_INVALID')
  const result: ConfigurationField[] = cap.configuration.map((value: unknown) => {
    const field = object(value)
    if (typeof field.required !== 'boolean' || typeof field.secret !== 'boolean')
      throw new HubError('HUB_RESPONSE_INVALID')
    const spec = schema(field.schema)
    if (field.secret && spec.type === 'array') throw new HubError('HUB_CONFIG_SCHEMA_UNSUPPORTED')
    return {
      key: text(field.key, 256),
      description: text(field.description, 500, true),
      required: field.required,
      secret: field.secret,
      schema: spec,
    }
  })
  for (const value of cap.secrets) {
    const field = object(value)
    // 项目、部署及会话凭据必须有明确的作用域拥有者，不能冒充用户级配置。
    if (field.scope !== 'user') throw new HubError('HUB_CONFIG_SCOPE_UNSUPPORTED')
    if (typeof field.required !== 'boolean') throw new HubError('HUB_RESPONSE_INVALID')
    result.push({
      key: text(field.key, 256),
      description: text(field.description, 500, true),
      required: field.required,
      secret: true,
      schema: { type: 'string' },
    })
  }
  const keys = new Set()
  for (const field of result) {
    if (!field.key || ['__proto__', 'constructor', 'prototype'].includes(field.key) || keys.has(field.key))
      throw new HubError('HUB_RESPONSE_INVALID')
    keys.add(field.key)
  }
  return result
}

/**
 * 依据权威字段验证提交内容，分离公开值与秘密值，并保留本次未替换的历史密钥。
 * @param definitions fields() 产生的字段定义，不能取自浏览器。
 * @param inputValues 用户提交的公开参数。
 * @param inputSecrets 用户本次明确提交的密钥。
 * @param [inputRetainedSecrets={}] 同一 Hub、同一能力的历史密钥。
 * @returns 供 Host 原子保存的配置；禁止直接作为 API 响应。
 * @throws 未知键、错分区、缺少必填值或约束不满足时拒绝整个提交。
 */
export function configuration(
  definitions: ConfigurationField[],
  inputValues: unknown,
  inputSecrets: unknown,
  inputRetainedSecrets: unknown = {},
): SavedConfiguration {
  const values = object(inputValues),
    secrets = object(inputSecrets),
    retainedSecrets = object(inputRetainedSecrets)
  const allowed = new Set(definitions.map(field => field.key))
  if ([...Object.keys(values), ...Object.keys(secrets)].some(key => !allowed.has(key)))
    throw new HubError('HUB_CONFIGURATION_INVALID')
  const nextValues: Record<string, ConfigurationValue> = {},
    nextSecrets: Record<string, ConfigurationValue> = {}
  for (const field of definitions) {
    if (Object.hasOwn(field.secret ? values : secrets, field.key)) throw new HubError('HUB_CONFIGURATION_INVALID')
    const value = field.secret ? (secrets[field.key] ?? retainedSecrets[field.key]) : values[field.key]
    if (value === undefined || value === '') {
      if (field.required) throw new HubError('HUB_CONFIGURATION_REQUIRED')
      continue
    }
    if (!validValue(field.schema, value) || (field.schema.enum && !field.schema.enum.includes(value)))
      throw new HubError('HUB_CONFIGURATION_INVALID')
    ;(field.secret ? nextSecrets : nextValues)[field.key] = value
  }
  return { values: nextValues, secrets: nextSecrets }
}
