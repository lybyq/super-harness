/** 来源凭据只在 Host 解析；复用 Harness CLI 的引用规范，不传给客户端或写入资源包。 */

/** @param reference 部署 authRef。 @param environment Host 环境；测试可传隔离字典。 @returns 原引用优先，其次 NOVA_SECRET_ 规范化键；缺失不回退匿名写入。 */
export function sourceCredential(reference: string | undefined, environment: NodeJS.ProcessEnv = process.env): string | undefined {
  if (!reference) return undefined
  const normalized = `NOVA_SECRET_${reference.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}`
  return environment[reference] ?? environment[normalized]
}
