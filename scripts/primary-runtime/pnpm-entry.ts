/** 为内置 pnpm 10 提供桌面约定的稳定 ESM 入口，不下载或切换包管理器。 */
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * @param directory 已验证并复制到运行时的 pnpm 分发目录。
 * @returns 供 Electron、独立 Node 和工作区工具统一执行的入口路径。
 * @throws 分发包缺少可执行入口时失败，不创建无效包装文件。
 */
export function ensureRuntimePnpmEntry(directory: string): string {
  const entry = join(directory, 'bin', 'pnpm.mjs')
  if (existsSync(entry)) return entry
  if (!existsSync(join(directory, 'bin', 'pnpm.cjs'))) {
    throw new Error('primary runtime: pnpm distribution has neither bin/pnpm.mjs nor bin/pnpm.cjs')
  }
  writeFileSync(entry, "/** 桌面稳定入口：执行随包 pnpm 10，不调用 Corepack。 */\nimport './pnpm.cjs'\n", { flag: 'wx' })
  return entry
}
