/** Bundle 参数在官方配置解析前注入内存，密钥不写入 Bundle patch、Store 或 Profile 文件。 */
import { HubError } from './hub-client.ts'
import { bindValue } from './runtime-provider.ts'
import { object } from './catalog.ts'
import type { Context } from '@deepseek-ai/cordis'
import type { StoredConfiguration } from './types.ts'
import type { BundleInfo } from '@deepseek-ai/dsh-plugin-manager'

/**
 * 在 Cordis internal/config 原生扩展点安装参数映射，原始配置保持不变。
 * @param ctx 官方 Host 上下文。
 * @returns prepare/release 接口；只能映射 Bundle 自己声明的普通插件行。
 */
export function bundleConfiguration(ctx: Context) {
  const mappings = new Map<string, { owner: string; name: string; configuration: Record<string, unknown> }>()
  ctx.on(
    'internal/config',
    function (_raw, next) {
      const config: unknown = next()
      const entry: unknown = this.entry
      if (entry === undefined) return config
      const rawRow = object(entry).options
      if (!rawRow) return config
      const row = object(rawRow, 'HUB_BINDING_INVALID')
      if (typeof row.id !== 'string' || typeof row.name !== 'string') throw new HubError('HUB_BINDING_INVALID')
      const mapping = mappings.get(row.id)
      if (!mapping) return config
      if (row.name !== mapping.name || row.group) throw new HubError('HUB_BINDING_INVALID')
      Object.defineProperty(this.ctx, 'harnessCapabilityOwner', {
        value: { id: mapping.owner, workspace: '' },
        configurable: true,
      })
      if (config !== undefined && (config === null || typeof config !== 'object' || Array.isArray(config)))
        throw new HubError('HUB_BINDING_INVALID')
      return { ...(config ?? {}), ...mapping.configuration }
    },
    { global: true },
  )
  return {
    /**
     * @param id Hub 能力标识。
     * @param bundle 官方 Manager 返回的 Bundle inventory。
     * @param binding runtimeBinding.configuration；有参 Bundle 必须显式声明 bundleRows。
     * @param saved Host 已验证参数与密钥。
     * @returns 映射先准入再提交；只引用内存，不输出密钥。
     */
    prepare(
      id: string,
      bundle: Pick<BundleInfo, 'rows' | 'overrides'>,
      binding: Record<string, unknown>,
      saved: StoredConfiguration,
    ) {
      const rows = binding.bundleRows ?? []
      if (!Array.isArray(rows) || rows.length > 100 || Object.keys(binding).some(key => key !== 'bundleRows'))
        throw new HubError('HUB_BUNDLE_CONFIGURATION_UNSUPPORTED')
      const prepared: {
          id: string
          name: string
          configuration: Record<string, unknown>
        }[] = [],
        seen = new Set()
      for (const input of rows) {
        const row = object(input, 'HUB_BINDING_INVALID')
        if (
          typeof row.id !== 'string' ||
          seen.has(row.id) ||
          typeof row.name !== 'string' ||
          !row.configuration ||
          typeof row.configuration !== 'object' ||
          Array.isArray(row.configuration) ||
          Object.keys(row).some(key => !['id', 'name', 'configuration'].includes(key))
        )
          throw new HubError('HUB_BINDING_INVALID')
        const owned = bundle.rows.filter(item => item.rowId === row.id && item.moduleName === row.name)
        if (
          owned.length !== 1 ||
          bundle.overrides.includes(row.id) ||
          (mappings.has(row.id) && mappings.get(row.id)?.owner !== id)
        )
          throw new HubError('HUB_BINDING_INVALID')
        seen.add(row.id)
        prepared.push({
          id: row.id,
          name: row.name,
          configuration: object(bindValue(row.configuration, { ...saved.values, ...saved.secrets })),
        })
      }
      // 每个配置键必须至少被映射一次；声明参数却不使用不能报告配置已生效。
      const text = JSON.stringify(rows)
      if (Object.keys({ ...saved.values, ...saved.secrets }).some(key => !text.includes(`\${${key}}`)))
        throw new HubError('HUB_BINDING_INVALID')
      for (const row of bundle.rows) {
        if (bundle.overrides.includes(row.rowId)) continue
        if (mappings.has(row.rowId) && mappings.get(row.rowId)?.owner !== id) throw new HubError('HUB_BINDING_INVALID')
      }
      this.release(id)
      for (const row of bundle.rows) {
        if (!bundle.overrides.includes(row.rowId))
          mappings.set(row.rowId, {
            owner: id,
            name: row.moduleName,
            configuration: prepared.find(item => item.id === row.rowId)?.configuration ?? {},
          })
      }
    },
    /** @param id 能力 ID。 @returns 已停用 Bundle 后释放内存中的密钥映射。 */
    release(id: string) {
      for (const [row, value] of mappings) if (value.owner === id) mappings.delete(row)
    },
  }
}
