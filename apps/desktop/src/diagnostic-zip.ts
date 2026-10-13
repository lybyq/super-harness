/** 诊断 ZIP 采用允许字段清单；不读取原始日志、会话内容、凭据或用户源码。 */
import { open, lstat, readFile, readdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import type { DesktopWatchdogConfig } from './host-watchdog.ts'

/** 由主进程提供的无敏感信息运行状态。 */
export interface DesktopDiagnosticStatus {
  readonly applicationVersion: string
  readonly platform: string
  readonly architecture: string
  readonly electronVersion: string
  readonly nodeVersion: string
  readonly hostPhase: string
  readonly updatePhase: string
  readonly watchdog: DesktopWatchdogConfig | null
}

/**
 * 从受限 Profile 清单读取插件坐标；URL、路径及任意用户配置不进入诊断包。
 * @param profile 当前桌面拥有的 Profile 目录。
 * @returns 最多 500 个安全坐标；清单不可读时仅返回可读性标记。
 */
export async function diagnosticPluginInventory(profile: string): Promise<object> {
  try {
    const path = join(profile, 'package.json')
    const stat = await lstat(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 512 * 1024) return { readable: false }
    const manifest: unknown = JSON.parse(await readFile(path, 'utf8'))
    if (typeof manifest !== 'object' || manifest === null || !('dependencies' in manifest)
      || typeof manifest.dependencies !== 'object' || manifest.dependencies === null || Array.isArray(manifest.dependencies)) {
      return { readable: true, packages: [] }
    }
    const packages = Object.entries(manifest.dependencies).slice(0, 500).flatMap(([name, value]) => {
      if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/u.test(name) || name.length > 214) return []
      return [{ name, version: typeof value === 'string' && /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/u.test(value)
        ? value : '[source omitted]' }]
    })
    return { readable: true, packages }
  } catch (_error) { return { readable: false } }
}

/**
 * 导出结构化诊断，不自动上传；目标已存在时拒绝覆盖。
 * @param destination 用户通过保存对话框选择的新 ZIP 路径。
 * @param status 允许字段组成的主进程状态，不接受原始环境或异常文本。
 * @param profile 当前 Profile，仅提取插件坐标。
 * @param logs 日志目录，仅统计文件数与总大小，不读取内容或文件名。
 * @returns ZIP 写入和关闭完成；写入失败尝试移除本次独占创建文件，清理失败保留原始异常一起报告。
 */
export async function exportDesktopDiagnosticZip(destination: string, status: DesktopDiagnosticStatus,
  profile: string, logs: string): Promise<void> {
  let count = 0
  let bytes = 0
  let logsReadable = true
  try {
    const names = (await readdir(logs)).slice(0, 1000)
    for (const name of names) {
      const stat = await lstat(join(logs, name))
      if (!stat.isFile() || stat.isSymbolicLink()) continue
      count += 1
      bytes += stat.size
    }
  } catch (_error) { logsReadable = false }
  const summary = { schemaVersion: 1, createdAt: new Date().toISOString(), ...status,
    plugins: await diagnosticPluginInventory(profile), logs: { readable: logsReadable, count, bytes } }
  const archive = zipSync({
    'diagnostics.json': strToU8(`${JSON.stringify(summary, null, 2)}\n`),
    'PRIVACY.txt': strToU8('Local export only. No credentials, environment, raw logs, conversation text, URLs, or source files are included.\n'),
  })
  const file = await open(destination, 'wx', 0o600)
  try { await file.writeFile(archive); await file.sync() }
  catch (error) {
    const failures: unknown[] = [error]
    try { await file.close() } catch (failure) { failures.push(failure) }
    try { await unlink(destination) } catch (failure) { failures.push(failure) }
    if (failures.length > 1) throw new AggregateError(failures, 'desktop diagnostics: write and cleanup failed')
    throw error
  }
  await file.close()
}
