/** 企业默认 MCP 清单准入；清单只指定资源坐标，不接受命令、下载地址或凭据。 */
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { capabilityId, object } from './catalog.ts'
import { HubError } from './hub-client.ts'

/** 首次安装可选择 Hub 推荐版本；安装成功后由本地 desired state 固定实际版本。 */
export interface DefaultMcpPlan {
  revision: string
  signature: string
  mcp: { id: string; version?: string }[]
}
/** 默认清单的持久化处理记录；运行状态必须重新观察，不持久化 active 声明。 */
export interface DefaultMcpJournal {
  revision: string
  signature: string
  dismissed: boolean
  errors: Record<string, string>
}

/** @param raw 部署人员维护的 JSON。 @returns 经准入的清单；拒绝重复 ID、范围版本和未知字段。 */
export function defaultMcpPlan(raw: unknown): DefaultMcpPlan {
  const value = object(raw, 'HUB_DEFAULT_MCP_INVALID')
  if (typeof value.revision !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(value.revision) ||
    !Array.isArray(value.mcp) || value.mcp.length > 100 ||
    Object.keys(value).some(key => !['revision', 'mcp'].includes(key))) throw new HubError('HUB_DEFAULT_MCP_INVALID')
  const seen = new Set<string>()
  const mcp = value.mcp.map((raw: unknown) => {
    const row = object(raw, 'HUB_DEFAULT_MCP_INVALID'), id = capabilityId(row.id)
    if (seen.has(id) || Object.keys(row).some(key => !['id', 'version'].includes(key)) ||
      (row.version !== undefined && (typeof row.version !== 'string' ||
        !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?(?:\+[A-Za-z0-9.-]+)?$/.test(row.version))))
      throw new HubError('HUB_DEFAULT_MCP_INVALID')
    seen.add(id)
    return { id, ...(typeof row.version === 'string' ? { version: row.version } : {}) }
  })
  return { revision: value.revision, signature: createHash('sha256').update(JSON.stringify([value.revision, mcp])).digest('hex'), mcp }
}

/** @param file 部署配置指定的清单路径；空路径明确禁用初始化。 @returns 清单或 undefined；文件错误以稳定码报告。 */
export async function readDefaultMcpPlan(file: string): Promise<DefaultMcpPlan | undefined> {
  if (!file) return undefined
  let raw: unknown
  try {
    const content = await readFile(file, 'utf8')
    if (Buffer.byteLength(content) > 65536) throw new HubError('HUB_DEFAULT_MCP_INVALID')
    raw = JSON.parse(content)
  } catch (_error) { throw new HubError('HUB_DEFAULT_MCP_INVALID') }
  return defaultMcpPlan(raw)
}

/** @param raw 官方凭据记录中的清单处理记录。 @returns 校验后的非秘密记录，旧记录缺失时保持兼容。 */
export function defaultMcpJournal(raw: unknown): DefaultMcpJournal | undefined {
  if (raw === undefined) return undefined
  const row = object(raw, 'HUB_LOCAL_STATE_INVALID'), errors = object(row.errors, 'HUB_LOCAL_STATE_INVALID')
  if (typeof row.revision !== 'string' || typeof row.signature !== 'string' ||
    !/^[a-f0-9]{64}$/.test(row.signature) || typeof row.dismissed !== 'boolean' ||
    Object.keys(row).some(key => !['revision', 'signature', 'dismissed', 'errors'].includes(key)))
    throw new HubError('HUB_LOCAL_STATE_INVALID')
  const admitted: Record<string, string> = {}
  for (const [id, code] of Object.entries(errors)) {
    if (typeof code !== 'string' || !/^HUB_[A-Z0-9_]{1,80}$/.test(code)) throw new HubError('HUB_LOCAL_STATE_INVALID')
    admitted[capabilityId(id)] = code
  }
  return { revision: row.revision, signature: row.signature, dismissed: row.dismissed, errors: admitted }
}
