/** Windows 打包 Fuse 写入的有限重试类型；不改变配置或签名顺序。 */
import type { AfterPackContext } from 'app-builder-lib'

/**
 * 保留原操作结果；只有同一文件 open 失败且摘要不变时允许重试。
 * @param file 构建流程拥有的 EXE。
 * @param operation 原 Fuse 操作。
 * @param options 平台与测试依赖；默认使用真实文件及四次有限等待。
 * @returns 原操作的异步结果；部分写入、内容变化和预算耗尽时拒绝。
 */
export function retryWindowsFuseOpen<T>(file: string, operation: () => Promise<T>, options?: {
  platform?: string
  inspect?: () => Promise<string>
  wait?: (milliseconds: number) => Promise<void>
  delays?: readonly number[]
}): Promise<T>

/**
 * 包装当前 Windows Packager 的公开 Fuse 入口，重复调用不重复包装。
 * @param packager 本次 Builder 实例。
 * @returns 不返回结果；不支持的 Builder 入口立即抛错。
 */
export function guardWindowsFuseWrites(packager: AfterPackContext['packager']): void
