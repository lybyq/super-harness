/** Environment variable that supplies the Electron application identifier. */
export const DESKTOP_APP_ID_ENV: 'DSH_DESKTOP_APP_ID'

/** Environment variable that supplies electron-builder's macOS certificate qualifier. */
export const MACOS_SIGNING_IDENTITY_ENV: 'DSH_DESKTOP_MACOS_SIGNING_IDENTITY'

/** Environment variable that supplies the expected Apple Developer Team ID. */
export const MACOS_TEAM_ID_ENV: 'DSH_DESKTOP_MACOS_TEAM_ID'

/** Environment variable that selects the npm registry used for the bundled runtime install. */
export const NPM_REGISTRY_ENV: 'DSH_DESKTOP_NPM_REGISTRY'

/** Public identity expected on a macOS release. */
export interface MacOSSigningEnvironment {
  readonly signingIdentity: string
  readonly teamId: string
}

/** Apple ID credentials accepted by notarytool. */
export interface MacOSAppleIdNotarizationEnvironment {
  readonly appleId: string
  readonly appleIdPassword: string
  readonly teamId: string
}

/** App Store Connect API credentials accepted by notarytool. */
export interface MacOSApiKeyNotarizationEnvironment {
  readonly appleApiKey: string
  readonly appleApiKeyId: string
  readonly appleApiIssuer: string
}

/** Keychain profile accepted by notarytool. */
export interface MacOSKeychainNotarizationEnvironment {
  readonly keychainProfile: string
  readonly keychain?: string
}

/** One complete credential strategy accepted by notarytool. */
export type MacOSNotarizationEnvironment =
  | MacOSAppleIdNotarizationEnvironment
  | MacOSApiKeyNotarizationEnvironment
  | MacOSKeychainNotarizationEnvironment

/**
 * Resolve and validate the application identifier shared by every platform target.
 * @param env - Packaging environment.
 * @returns Reverse-DNS application identifier.
 */
export function resolveDesktopAppId(env: NodeJS.ProcessEnv): string

/**
 * 解析桌面生产依赖的 npm 源；HTTP 须通过 DSH_DESKTOP_NPM_ALLOW_HTTP=true 明确允许。
 * @param env - 打包环境；非法地址或 HTTP 许可值在下载前抛出异常。
 * @returns 规范化源站；未配置时使用公网 npm 源。
 */
export function resolveNpmRegistry(env: NodeJS.ProcessEnv): string

/**
 * Resolve and validate the public identity expected on a macOS release.
 * @param env - Packaging environment.
 * @returns Expected certificate qualifier and Team ID.
 */
export function resolveMacOSSigningEnvironment(env: NodeJS.ProcessEnv): MacOSSigningEnvironment

/**
 * Resolve one complete credential set accepted by Apple's notary service.
 * @param env - Packaging environment.
 * @returns Notary credentials without the submitted artifact path.
 */
export function resolveMacOSNotarizationEnvironment(env: NodeJS.ProcessEnv): MacOSNotarizationEnvironment
