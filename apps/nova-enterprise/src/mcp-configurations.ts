/** 统一 MCP 配置服务：整批校验、逐记录保存、一次协调加载；响应只包含保存结果和稳定错误码。 */
import { capabilityId, configuration, fields, object, summary } from './catalog.ts'
import { HubError } from './hub-client.ts'
import type { CredentialKey, CredentialRecord } from '@deepseek-ai/dsh-credentials'
import type { CapabilityLifecycle } from './lifecycle.ts'
import type { HubClient } from './hub-client.ts'
import type { StoredConfiguration } from './types.ts'
import type { protectedCredentials } from './credential-protection.ts'

/** @param record Host 内部凭据记录。 @returns 不回传界面的公开值与密钥分区。 */
export function storedMcpConfiguration(record: CredentialRecord | undefined): StoredConfiguration {
  if (!record) return { values: {}, secrets: {} }
  if (record.kind !== 'grant') throw new HubError('HUB_CREDENTIAL_UNAVAILABLE')
  const payload = object(record.payload, 'HUB_CREDENTIAL_UNAVAILABLE')
  return { values: object(payload.values), secrets: object(payload.secrets), saved: true }
}

/**
 * @param raw 不可信批量请求，不能提供字段定义或本地执行路径。
 * @param lifecycle 当前作用域的串行管理器。
 * @param client 权威资源目录。
 * @param credentials 经过部署保护器的 Host 凭据服务。
 * @param key 当前 Hub 与作用域隔离的资源键。
 * @returns 每个资源的保存结果；存储部分失败不会被描述成整批成功或整批回滚。
 */
export async function saveMcpConfigurations(
  raw: unknown,
  lifecycle: Pick<CapabilityLifecycle, 'list' | 'configureMany'>,
  client: Pick<HubClient, 'capability'>,
  credentials: ReturnType<typeof protectedCredentials>,
  key: (id: string) => CredentialKey,
) {
  const input = object(raw, 'HUB_REQUEST_INVALID')
  if (!Array.isArray(input.configurations) || !input.configurations.length || input.configurations.length > 100 ||
    Object.keys(input).some(name => name !== 'configurations')) throw new HubError('HUB_REQUEST_INVALID')
  const seen = new Set<string>()
  const rows = input.configurations.map((raw: unknown) => {
    const row = object(raw, 'HUB_REQUEST_INVALID'), id = capabilityId(row.id)
    if (seen.has(id) || Object.keys(row).some(name => !['id', 'values', 'secrets'].includes(name)))
      throw new HubError('HUB_REQUEST_INVALID')
    seen.add(id)
    return { id, values: row.values, secrets: row.secrets }
  })
  // 校验发生在关闭实例前；不合法的一项不能让其他 MCP 被无谓重启或保存。
  const prepared: { id: string; values: unknown; secrets: unknown; definitions: ReturnType<typeof fields> }[] = []
  for (const row of rows) {
    const document = await client.capability(row.id)
    if (summary(document).id !== row.id || summary(document).type !== 'mcp') throw new HubError('HUB_REQUEST_INVALID')
    const spec = fields(document)
    const previous = storedMcpConfiguration(await credentials.readRecord(key(row.id)))
    configuration(spec, row.values, row.secrets, previous.secrets)
    prepared.push({ ...row, definitions: spec })
  }
  const results = await lifecycle.configureMany(rows.map(row => row.id), async () => {
    const results: { id: string; saved: boolean; error?: string }[] = []
    for (const row of prepared) {
      try {
        await credentials.modifyRecord(key(row.id), current => Promise.resolve({ kind: 'grant', payload:
          configuration(row.definitions, row.values, row.secrets, storedMcpConfiguration(current).secrets) }))
        results.push({ id: row.id, saved: true })
      } catch (error) {
        results.push({ id: row.id, saved: false, error: error instanceof HubError ? error.code : 'HUB_CONFIGURATION_STORE_FAILED' })
      }
    }
    return results
  })
  const installed = await lifecycle.list()
  return { results: results.map(row => ({ ...row, activation: installed.find(item => item.id === row.id)?.activation ?? 'not-installed' })) }
}
