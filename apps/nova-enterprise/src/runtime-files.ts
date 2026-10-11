/** MCP 配置文件只包含公开参数；密钥使用子进程环境引用，文件不写入不可变 Store。 */
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { capabilityId, object } from './catalog.ts'
import { HubError } from './hub-client.ts'
import type { SavedConfiguration } from './types.ts'

/**
 * @param home 桌面资源根。 @param id 能力 ID。 @param workspace 项目 ID。
 * @param raw 声明式文件列表。 @param saved 配置分区。
 * @returns 受管文件占位符；只清理本次 mkdtemp 的配置文件，保留 MCP 自己的数据。
 */
export async function runtimeFiles(
  home: string,
  id: string,
  workspace: string,
  raw: unknown,
  saved: SavedConfiguration,
) {
  if (!isAbsolute(home)) throw new HubError('HUB_RUNTIME_UNSUPPORTED')
  const files = raw ?? []
  if (!Array.isArray(files) || files.length > 10 || (workspace && !/^ws-[a-f0-9]{32}$/.test(workspace)))
    throw new HubError('HUB_BINDING_INVALID')
  const prepared = files.map((value) => {
    const file = object(value)
    if (
      typeof file.name !== 'string' ||
      !/^[A-Z][A-Z0-9_]{0,63}$/.test(file.name) ||
      typeof file.field !== 'string' ||
      !['json', 'text'].includes(String(file.format)) ||
      Object.keys(file).some(key => !['name', 'field', 'format'].includes(key)) ||
      Object.hasOwn(saved.secrets, file.field)
    )
      throw new HubError('HUB_BINDING_INVALID')
    const content = saved.values[file.field]
    if (typeof content !== 'string') throw new HubError('HUB_CONFIGURATION_REQUIRED')
    if (Buffer.byteLength(content) > 1024 * 1024) throw new HubError('HUB_REQUEST_TOO_LARGE')
    try {
      return {
        name: file.name,
        content: file.format === 'json' ? JSON.stringify(JSON.parse(content), null, 2) : content,
      }
    } catch (_error) {
      throw new HubError('HUB_CONFIGURATION_INVALID')
    }
  })
  if (new Set(prepared.map(file => file.name)).size !== prepared.length) throw new HubError('HUB_BINDING_INVALID')
  const root = resolve(home, 'runtime-data', workspace || 'user', capabilityId(id))
  await mkdir(root, { recursive: true })
  const directory = await mkdtemp(join(root, 'launch-'))
  const values: Record<string, string> = { INSTANCE_HOME: root }
  const close = () => rm(directory, { recursive: true, force: true })
  try {
    for (const file of prepared) {
      const path = join(directory, `${file.name}.config`)
      await writeFile(path, file.content, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
      values[`FILE_${file.name}`] = path
    }
    return { values, close }
  } catch (error) {
    await close()
    throw error
  }
}
