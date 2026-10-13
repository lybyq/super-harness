/** 只在 Windows EXE 保持原样时重试 Fuse 的临时 open 失败；原配置与签名顺序不变。 */
import { createHash } from 'node:crypto'
import { lstat, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { setTimeout } from 'node:timers/promises'

const guarded = new WeakSet()

/** @param {string} file 本次打包的 EXE。 @returns {Promise<string>} 文件身份、大小与内容摘要；链接不是可重试目标。 */
async function fingerprint(file) {
  const entry = await lstat(file)
  if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('desktop fuses: executable must be a regular file')
  return `${entry.dev}:${entry.ino}:${entry.size}:${createHash('sha256').update(await readFile(file)).digest('hex')}`
}

/**
 * 对打开未修改 EXE 的临时失败做有限重试；写入失败、其他路径或内容变化立即停止。
 * @param {string} file 构建流程拥有的 EXE 路径。
 * @param {() => Promise<unknown>} operation 原有 Fuse 配置操作。
 * @param {object} options 平台及文件检查依赖，测试可替换等待与摘要；生产使用真实文件。
 * @returns {Promise<unknown>} 原操作结果；预算耗尽或状态不可信时拒绝。
 */
export async function retryWindowsFuseOpen(file, operation, options = {}) {
  const platform = options.platform ?? process.platform
  if (platform !== 'win32') return operation()
  const inspect = options.inspect ?? (() => fingerprint(file))
  const wait = options.wait ?? setTimeout
  const delays = options.delays ?? [500, 1500, 3000, 5000]
  const initial = await inspect()
  for (let attempt = 0; ; attempt++) {
    try { return await operation() } catch (error) {
      if (!(error instanceof Error) || !['UNKNOWN', 'EBUSY'].includes(error.code)
        || error.syscall !== 'open' || typeof error.path !== 'string'
        || resolve(error.path).toLowerCase() !== resolve(file).toLowerCase()
        || attempt >= delays.length) throw error
      await wait(delays[attempt])
      let current
      try { current = await inspect() } catch (inspectionError) {
        throw new AggregateError([error, inspectionError], 'desktop fuses: executable state cannot be verified; packaging stopped')
      }
      if (current !== initial) throw new Error('desktop fuses: executable changed after failure; packaging stopped', { cause: error })
      console.warn(`desktop fuses: unchanged executable open failed; retry ${attempt + 1}/${delays.length}`)
    }
  }
}

/**
 * 包装 Builder 的公开 Fuse 配置入口；仅作用于本次 Packager，不修改依赖或 Agent 运行时。
 * @param {object} packager 当前 Windows Packager。
 * @returns {void} 重复调用保持同一包装；Builder 入口变更时立即失败。
 */
export function guardWindowsFuseWrites(packager) {
  if (guarded.has(packager)) return
  if (typeof packager.addElectronFuses !== 'function') throw new Error('desktop fuses: pinned Builder fuse entry is unavailable')
  const original = packager.addElectronFuses
  packager.addElectronFuses = function (context, fuses) {
    return retryWindowsFuseOpen(join(context.appOutDir, `${this.appInfo.productFilename}.exe`),
      () => original.call(this, context, fuses), { platform: context.electronPlatformName })
  }
  guarded.add(packager)
}
