/** Nova 桌面发布组合：复用官方基础并叠加锁定社区版本，不改变普通 CLI Profile。 */

import { PROFILE_TEMPLATES, type ProfileTemplate } from '@deepseek-ai/dsh-app-boot'
import { DESKTOP_HOST_PACKAGE } from './core-package-set.ts'

/** 桌面 Host 生产依赖提供的社区聚合包；版本固定在 NOVA_COMMUNITY_PINS 中。 */
export const NOVA_COMMUNITY_PACKAGE = '@linxin666/dsh-web-all'

/** 私有 Nova 企业插件包；随桌面交付，不要求终端用户访问公网 npm。 */
export const NOVA_ENTERPRISE_PACKAGE = '@deepseek-ai/dsh-nova-enterprise'

/** 已审查的上下文洞察插件；发布制品同时应用内网余额请求禁用补丁。 */
export const NOVA_CONTEXT_PACKAGE = 'dsh-context'

/** 上下文插件精确版本；依赖升级必须重新验证官方 API 和离线补丁。 */
export const NOVA_CONTEXT_VERSION = '0.69.1'

/** Nova 包启动及界面挂载所需文件；发布准备阶段缺少任一项都必须拒绝继续。 */
export const NOVA_ENTERPRISE_RUNTIME_FILES = [
  'lib/index.js', 'lib/index.js.map', 'lib/types/host/index.d.ts',
  'lib/client.js', 'lib/client.js.map', 'lib/engine.js',
  'lib/npm/package.json', 'lib/npm/bin/npm-cli.js',
] as const

/** 已审查并移除公网使用心跳的社区客户端制品；打包阶段必须应用相同补丁。 */
export const NOVA_COMMUNITY_PATCH_PACKAGES: readonly string[] = [
  '@linxin666/dsh-client-ui-git-graph',
  '@linxin666/dsh-client-ui-market',
  '@linxin666/dsh-client-ui-plugin-manager',
  '@linxin666/dsh-client-ui-skill-explorer',
  '@linxin666/dsh-client-ui-skin-center',
  '@linxin666/dsh-client-ui-task-board',
  '@linxin666/dsh-client-ui-web-ui-settings',
  '@linxin666/dsh-pet',
  '@linxin666/dsh-remote-web-ui',
  '@linxin666/dsh-ssh',
  '@linxin666/dsh-update',
  '@linxin666/dsh-web-all',
]

/** 首次启动的 Bundle 加载顺序；原生故障恢复只保留官方 Web 层，不自动重启社区层。 */
export const NOVA_DESKTOP_BUNDLES: readonly string[] = [
  ...(PROFILE_TEMPLATES.web as ProfileTemplate).bundles,
  NOVA_COMMUNITY_PACKAGE,
  NOVA_CONTEXT_PACKAGE,
  DESKTOP_HOST_PACKAGE,
]

/** 全部社区模块的精确版本约束；生产打包与工作区使用同一发布版本，不能混装 latest。 */
export const NOVA_COMMUNITY_PINS: Readonly<Record<string, string>> = Object.fromEntries([
  NOVA_COMMUNITY_PACKAGE,
  '@linxin666/dsh-client-ui-plugin-manager',
  '@linxin666/dsh-client-ui-market',
  '@linxin666/dsh-client-ui-task-board',
  '@linxin666/dsh-client-ui-task-board-github',
  '@linxin666/dsh-client-ui-git-graph',
  '@linxin666/dsh-remote-web-ui',
  '@linxin666/dsh-update',
  '@linxin666/dsh-ssh',
  '@linxin666/dsh-liangshen',
  '@linxin666/dsh-client-ui-skill-explorer',
  '@linxin666/dsh-usage',
  '@linxin666/dsh-session-archive',
  '@linxin666/dsh-client-ui-model-capabilities',
  '@linxin666/dsh-client-ui-web-ui-settings',
  '@linxin666/dsh-i18n',
  '@linxin666/dsh-client-ui-community-plugins',
  '@linxin666/dsh-client-ui-preset-center',
  '@linxin666/dsh-client-ui-skin-center',
  '@linxin666/dsh-pet',
].map(name => [name, '0.4.5']))
