/** Resolve the required policy service from the same deployment as updater publication. */
import { resolveDesktopAutoUpdateEnvironment } from './desktop-auto-update-environment.mjs'

function origin(value, name) {
  let url
  try { url = new URL(value) } catch { throw new Error(`desktop package: ${name} requires an HTTPS origin`) }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`desktop package: ${name} requires an HTTPS origin without credentials, path, query, or fragment`)
  }
  return url.origin
}

/**
 * 解析部署文件中的强更策略；明确指定的未签名离线测试包不携带更新服务元数据。
 * @param {NodeJS.ProcessEnv} environment 打包环境；OFFLINE_TEST=true 必须同时处于 UNSIGNED=1 模式。
 * @returns {{ origin: string, allowedPageOrigins: string[], authentication: 'anonymous' | 'feishu-test', [key: string]: unknown } | undefined} 已校验策略；离线测试包返回 undefined。
 * @throws {Error} 配置非法、签名发布使用离线测试选项或选定更新源缺失时，在打包前终止。
 */
export function resolveDesktopPolicyEnvironment(environment) {
  const offlineTest = environment.DSH_DESKTOP_OFFLINE_TEST?.trim() ?? ''
  if (offlineTest !== '' && offlineTest !== 'true' && offlineTest !== 'false') {
    throw new Error('desktop package: DSH_DESKTOP_OFFLINE_TEST must be true or false')
  }
  if (offlineTest === 'true') {
    if (environment.DSH_DESKTOP_UNSIGNED !== '1') {
      throw new Error('desktop package: DSH_DESKTOP_OFFLINE_TEST=true requires an unsigned test build')
    }
    return undefined
  }
  const deployment = resolveDesktopAutoUpdateEnvironment(environment)
  const name = deployment === 'test' ? 'DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN' : 'DSH_DESKTOP_MANDATORY_UPDATE_PROD_ORIGIN'
  const selected = origin(environment[name], name)
  let settings = {}
  if (environment.DSH_DESKTOP_MANDATORY_UPDATE_CONFIG !== undefined) {
    try { settings = JSON.parse(environment.DSH_DESKTOP_MANDATORY_UPDATE_CONFIG) }
    catch { throw new Error('desktop package: DSH_DESKTOP_MANDATORY_UPDATE_CONFIG must be valid JSON') }
  }
  if (typeof settings !== 'object' || settings === null || Array.isArray(settings)
    || 'origin' in settings || 'authentication' in settings) {
    throw new Error('desktop package: policy options must be an object without origin or authentication; use the deployment origin settings')
  }
  const pages = settings.allowedPageOrigins ?? [selected]
  if (!Array.isArray(pages) || pages.length === 0) throw new Error('desktop package: allowedPageOrigins must be a nonempty array')
  const authOrigins = settings.allowedAuthOrigins
  if (deployment === 'test' && (!Array.isArray(authOrigins) || authOrigins.length === 0)) {
    throw new Error('desktop package: test policy requires nonempty allowedAuthOrigins')
  }
  if (deployment === 'production' && authOrigins !== undefined) {
    throw new Error('desktop package: production policy must not configure allowedAuthOrigins')
  }
  return { ...settings, origin: selected,
    allowedPageOrigins: pages.map(value => origin(value, 'allowedPageOrigins')),
    ...(deployment === 'test' ? { allowedAuthOrigins: authOrigins.map(value => origin(value, 'allowedAuthOrigins')) } : {}),
    authentication: deployment === 'test' ? 'feishu-test' : 'anonymous' }
}
