/** Required deployment-selected metadata for mandatory-update policy requests. */
export interface DesktopPolicyEnvironment {
  origin: string
  allowedPageOrigins: string[]
  allowedAuthOrigins?: string[]
  authentication: 'anonymous' | 'feishu-test'
  [key: string]: unknown
}

/**
 * 解析强更配置；明确指定的未签名离线测试包无需更新服务地址。
 * @param environment 打包环境；OFFLINE_TEST=true 只在 UNSIGNED=1 时接受。
 * @returns 已校验的部署策略；离线测试包返回 undefined，其他非法配置抛出异常。
 */
export function resolveDesktopPolicyEnvironment(environment: NodeJS.ProcessEnv): DesktopPolicyEnvironment | undefined
