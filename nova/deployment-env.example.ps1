# 仅设置当前进程的桌面部署环境；由部署人员复制到内网修改，不包含账号或密码。
# 配置后在已有桌面开发环境执行 pnpm run start:desktop；生产启动使用已安装的桌面程序。
# 不执行依赖安装、不执行 build、不重写已有 Profile，也不取消原生工具权限。
$env:NOVA_HUB_API_URL = 'https://harness.example.internal/api/v1'
$env:NOVA_HUB_AUTH_MODE = 'none'
$env:NOVA_HUB_ALLOW_HTTP = 'false'
$env:NOVA_DEPLOYMENT_CONFIG = 'E:/harness/deployment/desktop-intranet.yaml'
$env:NOVA_DEFAULT_MCP_FILE = 'E:/harness/deployment/default-mcp.json'
$env:NODE_EXTRA_CA_CERTS = 'E:/harness/deployment/company-ca.pem'
$env:HARNESS_DESKTOP_RESOURCE_HOME = 'E:/harness/resources'
$env:HARNESS_ALLOW_PUBLISHING = 'true'
$env:HARNESS_SECRET_PROTECTION = 'windows-dpapi'
$env:DSH_HOME = 'E:/harness/user-home'
$env:TEMP = 'E:/harness/temp'
$env:TMP = $env:TEMP
$env:npm_config_cache = 'E:/harness/npm-cache'
# 启动前创建上述资源／用户／临时／缓存目录。正式部署留空 HARNESS_ENGINE_ENTRY，使用随包 engine.js。
# HARNESS_ENGINE_ENTRY 仅供开发定位共享库所在 checkout，不是 engine.js 文件路径。
# 只在 Host 安全环境注入来源凭据，不放进源文件；名称与部署 authRef 对应。
# 来源账号应限定目标 GitLab Group 与 npm scope；免登录 Hub 不表示来源仓库匿名可写。
# INTERNAL/GITLAB_SYNC_TOKEN 对应 NOVA_SECRET_INTERNAL_GITLAB_SYNC_TOKEN。
# INTERNAL/NPM_TOKEN 对应 NOVA_SECRET_INTERNAL_NPM_TOKEN；实际值由安全环境提供，不写进此文件。
