/** Hub 读取缓存按部署隔离；仅无响应或超时可回退，认证、删除和文档错误不得被旧缓存掩盖。 */
import { createHash } from 'node:crypto'
import { HubError } from './hub-client.ts'
import { catalog, summary, fields, object } from './catalog.ts'
import { roleCatalog, rolePlan } from './roles.ts'
import type { Context } from '@deepseek-ai/cordis'
import type { CredentialKey } from '@deepseek-ai/dsh-credentials'
import type { HubClient, SearchQuery, ResolveRequest } from './hub-client.ts'
import type { Config } from './index.ts'

/** 已保存并按预算准入的原始 Hub 文档；读取后仍需执行领域校验。 */
interface CacheEntry {
  key: string
  date: number
  value: unknown
}

/**
 * 装饰只读 Hub 接口并持久保存已准入文档；缓存不包含本地配置、访问令牌和源认证凭据。
 * @param ctx 官方凭据服务上下文。
 * @param client 已配置的 Host 客户端。
 * @param key Hub 独立的缓存键。
 * @param options 缓存总字节数、条目数与有效期预算。
 * @returns 相同读取接口和脱敏状态；写入接口不能使用这个缓存代理。
 */
export function offlineClient(
  ctx: Context,
  client: HubClient,
  key: CredentialKey,
  options: Pick<Config, 'offlineMaxEntries' | 'offlineMaxBytes' | 'offlineMaxAgeMs' | 'maxResponseBytes'>,
) {
  let offline = false,
    cachedAt: string | undefined
  /** @param payload 持久化原始文档。 @returns 经过形状和预算校验的缓存条目。 */
  const entriesFrom = (payload: unknown): CacheEntry[] => {
    const entries = object(payload, 'HUB_LOCAL_STATE_INVALID').entries
    if (
      !Array.isArray(entries) ||
      entries.length > options.offlineMaxEntries ||
      Buffer.byteLength(JSON.stringify(entries)) > options.offlineMaxBytes
    )
      throw new HubError('HUB_LOCAL_STATE_INVALID')
    return entries.map((input: unknown) => {
      const item = object(input, 'HUB_LOCAL_STATE_INVALID')
      if (
        typeof item.key !== 'string' ||
        typeof item.date !== 'number' ||
        !Number.isSafeInteger(item.date) ||
        item.date < 0 ||
        item.value === undefined
      )
        throw new HubError('HUB_LOCAL_STATE_INVALID')
      return { key: item.key, date: item.date, value: item.value }
    })
  }
  const read = async () => {
    const record = await ctx.credentials.readRecord(key)
    if (!record) return []
    if (record.kind !== 'grant') throw new HubError('HUB_LOCAL_STATE_INVALID')
    return entriesFrom(record.payload)
  }
  const save = async (id: string, value: unknown) => {
    const date = Date.now()
    await ctx.credentials.modifyRecord(key, (record) => {
      if (record && record.kind !== 'grant') throw new HubError('HUB_LOCAL_STATE_INVALID')
      let entries = [
        ...(record ? entriesFrom(record.payload) : []).filter(item => item.key !== id),
        { key: id, date, value },
      ].slice(-options.offlineMaxEntries)
      while (entries.length && Buffer.byteLength(JSON.stringify(entries)) > options.offlineMaxBytes)
        entries = entries.slice(1)
      return Promise.resolve({ kind: 'grant', payload: { entries } })
    })
  }
  const request = async (
    name: string,
    args: unknown[],
    invoke: () => Promise<unknown>,
    validate: (value: unknown) => unknown,
  ): Promise<unknown> => {
    const id = createHash('sha256')
      .update(JSON.stringify([name, args.filter(item => !(item instanceof AbortSignal))]))
      .digest('hex')
    let value: unknown
    try {
      value = await invoke()
    } catch (error) {
      if (!(error instanceof HubError) || !['HUB_UNAVAILABLE', 'HUB_TIMEOUT'].includes(error.code)) throw error
      if (args.some(item => item instanceof AbortSignal && item.aborted)) throw new HubError('HUB_CANCELLED')
      const cached = (await read()).find(item => item.key === id)
      if (!cached || Date.now() - cached.date > options.offlineMaxAgeMs) throw new HubError('HUB_OFFLINE_CACHE_MISS')
      validate(cached.value)
      offline = true
      cachedAt = new Date(cached.date).toISOString()
      return structuredClone(cached.value)
    }
    validate(value)
    await save(id, value)
    offline = false
    cachedAt = undefined
    return value
  }
  return {
    capability: (id: string, signal?: AbortSignal) =>
      request(
        'capability',
        [id, signal],
        () => client.capability(id, signal),
        (document) => {
          if (summary(document).id !== id) throw new HubError('HUB_RESPONSE_INVALID')
          fields(document)
        },
      ),
    search: (query: SearchQuery = {}, signal?: AbortSignal) =>
      request('search', [query, signal], () => client.search(query, signal), catalog),
    roles: (signal?: AbortSignal) => request('roles', [signal], () => client.roles(signal), roleCatalog),
    resolve: (input: ResolveRequest, signal?: AbortSignal) =>
      request('resolve', [input, signal], () => client.resolve(input, signal), rolePlan),
    readme: (id: string, signal?: AbortSignal) =>
      request(
        'readme',
        [id, signal],
        () => client.readme(id, signal),
        (value) => {
          const content = object(value).content
          if (typeof content !== 'string' || content.length > options.maxResponseBytes)
            throw new HubError('HUB_RESPONSE_INVALID')
        },
      ),
    /** @returns 最近读取是否使用缓存，离线不代表运行中的 MCP 服务也可离线访问。 */
    status: () => ({ offline, cachedAt }),
  }
}
