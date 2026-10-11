---
description: "连接企业 Hub，安装并配置内网能力，应用角色职责和启动官方 Agent 团队。"
kind: "package-reference"
---

# @deepseek-ai/dsh-nova-enterprise

[English](README.md) | 中文

## 概述

打开 AI Hub（人工智能能力中心），以自适应卡片搜索、安装、配置和发布能力。用户无需填写 Hub 地址或令牌。MCP、skill（技能）、原生插件及带参数 Bundle 通过官方扩展点加载；密钥由 Host 持有。角色限制会话工具和 skill 发现范围；官方 Agent Teams 为各成员应用各自角色计划。有效的缓存元数据与产物支持 Hub 断网后的重启恢复。真实内网包和签名离线安装器仍需验收。

能力目录不设发布审批。本机下载、配置、兼容性和启用检查与原生工具权限分别处理。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与待办](#known-limitations-and-deferred-work)
- [开发说明](#dev-note)

<a id="use-this-package"></a>
## 使用此包

Nova Desktop Host 的部署补丁将此包挂载在官方界面旁。

### 选择条件

需要对接当前 Nova Hub 协议时选择此包；已有官方 Bundle 继续使用官方插件管理器。这是普通 Cordis 插件，不是 Bundle：它没有 `dsh.bundle.patch`，不要用 `dsh plugin add` 将它安装为 Profile 层。

### 最小配置

在组合中，最小挂载配置如下：

```yaml
- id: nova-enterprise
  name: '@deepseek-ai/dsh-nova-enterprise'
```

必须先提供官方已鉴权的 `connection` 与 `credentials` 服务。接受的配置由 [Config](src/index.ts) 定义；这个新增应用插件尚无生成的配置目录条目。

| 字段 | 默认值 | 含义 |
|---|---|---|
| apiBaseUrl | 空 | 管理员提供的 API 地址，末尾为 `/api/v1`；为空时提示尚未部署，不发送网络请求 |
| secretProtection | none | 插件默认保留原 Provider；Windows Desktop 默认 windows-dpapi，绑定当前 Windows 用户 |
| authentication | none | 显式选择 `none` 或 `bearer`；认证失败不会自动降级为免认证 |
| tokenEnvironmentVariable | NOVA_HUB_TOKEN | 保存 Bearer 令牌的 Host 环境变量名称；`none` 模式不读取、不发送令牌 |
| allowInsecureHttp | false | 允许显式配置的 HTTP Hub；HTTP 不保护传输中的令牌 |
| timeoutMs | 15000 | Hub 网络请求超时，正整数，最多 120000 毫秒 |
| maxResponseBytes | 2097152 | 响应字节上限，正整数，最多 16777216 |
| maxRequestBytes | 65536 | 配置请求字节上限，正整数，最多 1048576 |
| engineEntry | 空 | 为空使用内置 `lib/engine.js` 和 npm CLI（命令行界面）；可选开发入口用于定位共享包，不执行 CLI |
| deploymentFile | 空 | 可信源 DeploymentProfile；Hub URL 和 Runtime 必须与桌面一致 |
| resourceHome | 空 | 桌面专属 Store 根目录，不与 CLI 状态共用 |
| seedBuiltinThemes | false | 初始化缺失的离线主题；Desktop Host 默认开启，不改变当前皮肤 |
| maxHistory | 10 | 最多保留的能力变更历史，范围 1–100 |
| offlineMaxEntries | 200 | 每个 Hub 的已校验读取缓存数量，范围 1–1000 |
| offlineMaxBytes | 16777216 | 读取缓存总字节数，范围 1–67108864 |
| offlineMaxAgeMs | 86400000 | 缓存有效期，单位毫秒，范围 1–2592000000 |
| activationTimeoutMs | 30000 | 原生插件启动等待，范围 1–120000 毫秒 |
| allowPublishing | false | 部署明确开启来源写入，不是发布审批工作流 |
| publishingTimeoutMs | 120000 | npm 发布超时，范围 1000–600000 毫秒 |
| teamProvider | spawn | 官方可继续运行的子 Agent Provider |
| teamStartupTimeoutMs | 60000 | 单个队友启动上限，范围 1000–120000 毫秒 |

Desktop Host 补丁读取 `NOVA_HUB_API_URL`、`NOVA_HUB_AUTH_MODE`（默认 `none`）和 `NOVA_HUB_ALLOW_HTTP`（显式设为 `true` 才允许 HTTP）。管理员在桌面启动环境中提供这些值并重启桌面。`bearer` 模式通过企业启动环境注入 `NOVA_HUB_TOKEN`；它不会返回 Client 或发送给模型。HTTP 不保护传输中的凭据。禁止将地址或令牌提交到公开仓库。真实内网连通性须在目标网络验证。

### 离线桌面主题

Desktop Host 在 `$DSH_HOME/skins` 初始化六套配对的明暗色板：曜石、深海、松林、极地、暖纸和雾青。打开社区皮肤中心预览并应用；官方外观设置选择浅色、深色或跟随系统。样式与 SVG 预览由随包数据在本地生成，不发送网络请求、不依赖字体或图片下载、不执行钩子。已有同 ID 条目与当前选择均不覆盖。初始化开启时，删除的随包主题在下次启动恢复；关闭初始化不删除已有文件。目录失败会输出启动警告，不停用 Hub。真实桌面的视觉验收仍需人工完成。

### 在桌面配置能力

Windows Desktop 默认 `windows-dpapi`，可用 `HARNESS_SECRET_PROTECTION` 显式选择。旧企业配置首次读取时在官方凭据锁内迁移，不遍历未读取记录。失败保留原值并拒绝后续操作；关闭保护也不能读取已有密文。保护对象是能力参数和会话资源草稿，不是整个官方凭据库；详见 [升级说明](../../docs/upgrade-guide/v0.2.1-alpha.2/harness-windows-credential-protection/guide.zh.md)。

面板顶部选择用户级或已打开的项目。项目 ID 来自官方根会话 cwd；参数、凭据、安装状态和 MCP 进程独立保存。团队工作树继承 Lead 项目身份。Host Plugin／Bundle 必须用户级安装，因为它们贡献全局服务。用户级能力仍是全局能力，不被项目能力隐式覆盖。

1. 打开 **AI Hub**，企业目录自动加载，无需填写 Hub 连接表单。
2. 按文字和能力类型搜索。未部署时提示联系管理员；连接失败时检查企业网络或 VPN 后点击 **重新加载**。只有成功取得响应才显示空目录结果。
3. 点击 **详情** 默认读取 README，切到 **配置参数** 查看每项字段的说明、类型与必填标记。选择精确版本，点击 **安装**；缺少账号参数会保留下载并显示待配置，不冒充可用。
4. 保存配置会重载已安装能力；秘密字段留空保留原值，可单独清除。**已安装** 中可以更新、启停、卸载、回滚。这里显示的是本机运行结果，不是 Hub 发布审核状态。

支持字符串、数值、整数、布尔值、标量枚举、绝对 URI，以及带成员约束、数量限制和去重要求的字符串数组。数组通过 JSON 文本框填写，例如 `["NOVA", "PLATFORM"]`。Host 会重新读取 Hub 声明，校验必填项和受支持的范围限制。URI 校验只验证语法，不是出站网络权限策略。

未知约束、嵌套对象、引用、密钥数组、重复键及非用户级密钥作用域会被拒绝。Schema 默认值不返回浏览器、不自动注入。stdio MCP 的合法环境变量键直接映射，其他键使用绑定的 `env`／`args` 显式 `${KEY}` 引用；HTTP MCP 用 `url`／`headers`。原生 Host Plugin 的绑定配置按相同占位符注入。Skill 公开参数附到模型可见正文，秘密必须配置在它调用的 MCP 上。

安装需要部署提供 `NOVA_DEPLOYMENT_CONFIG` 和 `HARNESS_DESKTOP_RESOURCE_HOME`，`HARNESS_ENGINE_ENTRY` 可不填。桌面包包含共享 core／installer／contracts 库、YAML 解析器及 npm CLI。npm 使用桌面专属临时目录和缓存，默认禁用脚本。部署文件列出 GitLab／npm 源、可信下载主机及独立 `authRef` 环境变量。安装按 npm 包名＋精确版本＋integrity、GitLab SHA＋entryPath 定位，拒绝已变缓存。可选开发入口要求共享包已构建；最终用户交付不需要 Hub 源码目录。

带参数 Bundle 在原生运行时绑定中声明 `configuration.bundleRows: [{ id, name, configuration }]`。每项必须匹配官方 Bundle 清单中自己拥有的普通插件行，不得覆盖核心行。行配置使用 `${KEY}` 引用，每项已保存参数都必须映射。适配器先以停用状态安装，校验归属后由官方插件管理器启用。绑定密钥只进入最终内存配置，不写 Bundle patch 或不可变 Store。配置保存在官方凭据中，每次启用重新注入；需重启不等同于已启用。

网络不可达或超时可在有效期内复用已校验的搜索结果、能力文档、README 和角色计划。认证失败、资源删除、非法响应或取消均不会回退。离线搜索复用完全相同的已缓存查询，不是完整 Hub 镜像。重启恢复会重新校验缓存产物；来源不可达时不能下载缺失产物。已运行 MCP 仍需要连接自身业务服务。

### 创建与发布资源

聊天工具 `harness_prepare_resource` 保存有界 UTF-8 草稿，不执行代码或发布。用户导入检查当前项目草稿，也可删除。目录导入保留相对路径，排除 `.git`、`node_modules` 和 `.env`，最终准入由 Host 执行。原生插件模板使用 `ctx.harnessCapabilities.registerTool` 并声明 `inject: ['harnessCapabilities']`。本包导出的作者 SDK 支持后续动态工具归属和卸载，不需另装社区 SDK。

MCP 绑定可声明 `configuration.files: [{ name: 'CONFIG', field: 'CONFIG_JSON', format: 'json' }]`，字段必须为公开文本，`format: 'text'` 支持 TOML。Host 在 Store 外生成文件并注入 `${FILE_CONFIG}`；停用只删除本次启动文件，不删除 MCP 数据。内容中的环境引用保留给 MCP 自行解析，不替换成 Host 密钥。`${INSTANCE_HOME}` 是稳定实例数据目录，`${WORKSPACE_CWD}` 是 Lead cwd，用户级回退到 Host cwd。需要项目文件访问的能力建议项目级安装。Hub 的 `manifests/mcp-adapters/desktop.json` 和 `scripts/prepare-mcp-manifest.ts` 准备六个准确 npm 适配声明；GitLab MCP 尚需确认真实坐标。

打开 **AI Hub → 开发与发布**，选择部署来源，生成 skill／MCP／插件模板或导入 UTF-8 文本文件，编辑后校验。发布需要新鲜摘要，并明确确认目标和版本。GitLab 项目必须已存在且位于部署允许的组内；发布向默认分支写入文件，并创建指向返回 commit 的不可变 `v<version>` 标签。npm 使用精确包名／版本和配置的私有源，禁用脚本，凭据文件置于上传包之外。随后 Host 请求同步来源，验证 Hub 索引同一版本／commit。接口依据 [GitLab commit API](https://docs.gitlab.com/api/commits/) 和 [tag API](https://docs.gitlab.com/api/tags/)。

部署通过 `HARNESS_ALLOW_PUBLISHING=true` 和独立来源凭据开启写入；普通用户不在此面板填写仓库令牌。不设发布审批状态。已有版本、草稿变更或非法目标会阻止发布。提交成功但标签失败返回 `source-partial`；来源写入成功但未被索引返回 `published-not-indexed`。回执显示精确坐标及可取得的 commit。不确定结果不会自动重试。导入支持请求预算内的文本文件，不支持任意二进制压缩包或创建 GitLab 项目。

### 预览角色

打开 **AI Hub → 角色组合 → 加载角色**，选择已发布角色，再点击 **解析组合**。Host 向现有 Hub 解析器发送 `runtime: deepseek-harness`、所选角色 ID 和 `scope: user`，不发送已保存密钥、配置覆盖或权限覆盖。

预览展示精确版本、依赖顺序、权限声明及缺少的参数，不回传密钥。右侧可保存、修改和删除个人角色／团队模板，填写职责说明，并明确选择一个空闲根会话。**应用角色** 会确保所需能力已启用，然后通过官方 `Agent.inject` 入队；下一次用户任务才消费职责并记入会话事件，不隐式请求模型。**启动团队** 需要填写任务并确认费用，通过官方 `spawn` Provider 创建各角色独立队友；部分失败会返回已创建结果，不重复启动。

角色安装使用当前用户／项目范围，不卸载其他能力。Host 将 Hub MCP 工具、已追踪原生插件工具及 skill 发现范围限制到所选会话的角色。成员首次请求前取得独立计划；子会话继承所有者限制，保存的分配在启动时恢复。原生权限不升权。只有无条件 `deny` 且 `resource: '*'`、`action: 'tool:<工具名或末尾通配前缀*>'` 映射为执行拦截；条件、抽象资源及审批规则均拒绝。Hub RoleProfile 的职责取描述，个人说明存于模板。

桌面使用 `roles?view=published`，新草稿不会隐藏已有发布角色。Hub 的 `scripts/import-desktop-roles.ts` 在写入前验证整套默认角色继承图和显式能力 ID 映射，`--apply` 才按继承顺序发布新版本；部分成功逐项输出，不冒充整体迁移事务。

团队模板定义成员 Provider／Model、单次输出 `maxTokens`、持久步骤上限 `maxSteps` 和独立 Git 工作树。步骤在模型准入前提交，重启不重置；不是金额或总 Token 预算。工作树从已提交 HEAD 创建，不复制脏文件。任务 JSON 定义 `id/subject/description/member/dependsOn/writeScopes`，Host 校验 DAG 后通过官方 Team 持久化；写范围仅协作声明。界面读取真实任务、成员、预算和收据；用户审阅有界工作树 diff／最近提交，再明确 cherry-pick 单个提交。主项目必须干净、HEAD 未变且无运行成员；冲突／不确定结果保留现场，不重置、不重试。工作树保留，用户通过 Git 管理归档。

模板字段 `add/remove/disable/includeOptional` 定义基础角色之外的自由组合，Host 应用前重新解析；团队可选项只分配给继承后声明该能力的成员。新版 Hub 返回 `optionalCapabilities`，旧 API 应先升级再使用团队可选项。禁用只排除当前角色能力，不卸载其他项目的能力。

**开发与发布 → Plugin** 提供 Jira／GitLab 任务板 Provider 模板。在用户范围安装，配置页填写地址／项目／账户，然后通过**开发与发布 → 刷新集成列表**及手动拉取按钮使用。它们消费固定社区任务板公开 API v1，不启用公网 GitHub 集成。首屏最多 100 个未关闭事项导入 backlog，绝不自动运行、轮询或回写远端状态。Jira 使用 REST v2 和 PAT／Bearer 或 Basic 认证，真实版本及账号权限留内网验收。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节 — 点击展开</summary>

Host 业务源码和源码测试使用 TypeScript，Client 使用 TS／TSX。Host 与 Client 分别继承仓库严格类型检查。生产入口加载 `lib/index.js`，声明位于 `lib/types/host`，不加载原始源码或依赖 TS Loader。Client 贡献官方侧栏／主面板插槽，请求走已鉴权连接。Host effect 拥有传输、凭据、准入与运行实例清理。

| 源文件 | 职责 |
|---|---|
| [index.ts](src/index.ts) | 部署限制、鉴权路由、原子凭据修改、脱敏错误 |
| [hub-client.ts](src/hub-client.ts) | 有上限的 Hub HTTP 请求、取消、超时与重定向拒绝 |
| [offline-client.ts](src/offline-client.ts) | 已校验、有预算且按部署隔离的读取缓存 |
| [catalog.ts](src/catalog.ts) | 不可信目录及表单准入、配置校验 |
| [roles.ts](src/roles.ts) | 已发布角色选择、脱敏精确版本预览 |
| [capability-engine.ts](src/capability-engine.ts) | 共享库准入、可信部署与下载器 |
| [lifecycle.ts](src/lifecycle.ts) | 串行变更、收据、缺参状态、恢复与回滚 |
| [runtime-provider.ts](src/runtime-provider.ts) | 官方 MCP／Skill／Plugin 生命周期与参数绑定 |
| [bundle-configuration.ts](src/bundle-configuration.ts) | 自有 Bundle 行参数注入最终内存配置 |
| [role-access.ts](src/role-access.ts) | 会话工具可见范围、最终执行拦截及 skill 发现限制 |
| [role-runtime.ts](src/role-runtime.ts) | 本机模板 CRUD、职责入队、官方团队启动 |
| [publication.ts](src/publication.ts) | 资源模板、校验、显式来源发布与 Hub 索引确认 |
| [workspace.ts](src/workspace.ts)、[credential-protection.ts](src/credential-protection.ts) | 项目身份与 Windows 凭据保护 |
| [capability-tools.ts](src/capability-tools.ts)、[resource-drafts.ts](src/resource-drafts.ts) | 动态工具作者 SDK 与待检查会话草稿 |
| [runtime-files.ts](src/runtime-files.ts)、[team-worktrees.ts](src/team-worktrees.ts) | 公开配置文件生命周期及审阅／确认合并 |
| [Client 入口](src/client/index.ts) | 官方插槽和双语语言贡献 |
| [HubPanel](src/client/HubPanel.tsx) | 自动加载目录、重试、搜索、能力配置及角色请求控制 |
| [RolePanel](src/client/RolePanel.tsx) | 纯角色组合展示，不访问凭据和服务 |
| [AuthoringPanel](src/client/AuthoringPanel.tsx) | 文本草稿、摘要校验、目标确认与发布回执 |

能力记录使用官方凭据 Provider，可启用 Windows DPAPI 保护。连接路由只读；旧的用户 Hub 连接记录不再使用，也不会被删除。连接配置与 Host 令牌注入由管理员统一管理。来源仓库认证须与 Hub 令牌分离，Hub 令牌不等于 GitLab／npm 凭据。

</details>

<a id="further-exploration"></a>
## 进一步探索

- [Nova 开发](../../nova/README.zh.md) — 基线、社区层和验证边界。
- [能力开发规范](../../docs/nova-capability-development.zh.md) — MCP／Skill／Plugin／模块扩展、配置、角色与 Agent 发布闭环。
- [社区模块清单](../../docs/nova-community-integration.zh.md) — 全部固定模块和默认开关。
- [官方桌面](../desktop/README.zh.md) — 内置运行时和交付约定。
- [Client 包组](../../packages/client/README.zh.md) — 共享浏览器模块加载器构建。

<a id="model-experience"></a>
## 模型体验

安装并启用 MCP 后，官方工具注册表向模型暴露 `mcp__hub_<id摘要>__<tool>` 工具；停用和卸载撤销贡献。Skill 由官方注册表发现并按需读取正文与公开配置。角色职责是模型可见用户上下文，调用 `Agent.inject` 后在下一次任务中进入可回放事件日志。原生 Plugin 可自行贡献工具或提示词。Hub 令牌不进入模型；账号密钥只绑定给执行能力，不拼到角色说明或 Skill 正文。工具结果仍可能含业务敏感信息，需要各 MCP 自己约束。

#### KV Cache effect

MCP 增删和角色能力限制会改动工具目录，可能影响缓存命中。角色职责追加用户上下文，不改固定系统前缀；旧角色消息仍保留在历史中。skill 正文只在被读取时进入任务上下文。团队成员使用独立会话，因此不能假设共享 Lead 的上下文缓存。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与待办

以下是当前明确边界，不能据本地隔离测试认定所有内网资源已适配。

- GitLab Host 插件必须提供已构建、自包含入口；无原生绑定的 Claude 插件拒绝加载。Bundle 需要官方插件管理器，有参时须声明行映射。角色应用可能安装部分能力，并非整体事务。
- 角色限制不是系统沙箱。使用作者 SDK 的原生插件和 Bundle 自有行支持动态工具归属；绕过 SDK 的旧插件后续工具及核心覆盖行不保证归属。
- 参数按用户／项目实例保存，但秘密声明仍使用已支持的 user 类型。尚无条件策略执行器或 SSO 登录流，免登录部署不依赖 SSO。Windows DPAPI 无跨用户导出或其他系统钥匙串。缓存会过期，首次断网启动不能发现未缓存资源。
- 真实内网访问与断网安装包启动尚未验证。桌面打包流水线已显式包含此私有插件并检查必需文件，但尚未验收签名离线安装器。

<a id="dev-note"></a>
### 开发说明

<details>
<summary>维护者工作背景 — 点击展开</summary>

核心新增代码使用中文 JSDoc 说明职责、参数、结果和安全边界。不要修改 Agent Loop，不要静默执行安装脚本，不要由能力 ID 猜测命令入口，也不要将 `hasRuntimeBinding` 当成兼容批准。来源适配配置必须放在现有 Hub Runtime Binding 的 `configuration` 对象内；放在同级的自定义字段会被当前 Schema 剥离。

打包桌面前，从已构建的共享源码目录生成安装引擎产物：

```sh
node apps/nova-enterprise/scripts/bundle-engine.mjs --from ../nova-harness
```

构建记录共享入口的版本和摘要，并将 npm 依赖树与许可证文件纳入 `lib/npm`。`lib/` 是被忽略的构建输出：只传 Git 源码不会传递这些产物。内网打包前应传入已准备的包／payload，或重新生成。`engineEntry` 为空时，运行时不会解析外部源码目录。

桌面开发启动器与目标打包器把临时文件和 npm 缓存放到项目所在盘的 `.desktop-build/scratch`，可用 `DSH_DESKTOP_SCRATCH_DIR` 覆盖。开发参数 `--skip-build --reuse-runtime` 校验并复用已有产物／运行时，不重建运行时；已有运行时必须含 `runtime.json`。这不会移动或删除 C 盘原有文件，未由这些启动器启动的外部工具仍自行管理落盘配置。

修改此插件后可进行增量验证，不必重跑已有全量构建：

```sh
node node_modules/typescript/bin/tsc -b apps/nova-enterprise/tsconfig.host.json apps/nova-enterprise/tsconfig.client.json
```

在本包目录增量打包 Host 与 Client：

```sh
node ../../node_modules/tsdown/dist/run.mjs --config-loader native
```

然后在仓库根目录执行：

```sh
node --import tsx/esm --test --test-concurrency=1 nova/tests/*.test.mjs apps/nova-enterprise/tests/*.test.ts
node --test --test-concurrency=1 apps/nova-enterprise/tests/*.built.test.mjs
```

源码测试通过 TS Loader 运行；`.built.test.mjs` 测试不使用它，只加载生产产物。独立构建脚本和可执行 npm／插件 fixture（测试前置数据）有意保留 ESM JavaScript。`tests/composition.test.ts` 可选联调需要 `HARNESS_TEST_HUB_URL`、`HARNESS_TEST_DEPLOYMENT_FILE` 以及已索引的 `mock-mcp`／`mock-nested-skill` fixture，可选 `HARNESS_TEST_ENGINE_ENTRY`；它验证 Hub／产物端点关闭后的重启恢复。角色测试使用无 Key 模型，Bundle 测试验证应用前绑定，发布测试使用临时回环私有源。这些检查不代表生产凭据或签名安装器已验收。

剩余部署验收与扩展：

| 工作 | 具体实现位置／方式 | 完成判据 |
|---|---|---|
| 内网资源适配清单 | Hub 每个 MCP 的 schema、binding.env/headers/bin；GitLab SHA、Skill entryPath | yapi、memory、nova-ui-plus、markitdown、jira、dbhub、gitlab 各完成真实 tools/list、调用、重载和卸载 |
| 签名离线桌面交付 | 现有 Desktop package-set 与各目标平台签名 | 在目标 Windows 机器验证安装包断网冷启动，不依赖任一开发源码目录 |
| 部署安全 | Windows 账户 DPAPI 迁移、私有源授权、可信插件代码审查 | 更换身份重新配置、不导出秘密；免登录 Hub 使用网络控制，不依赖 SSO |

[内网交接清单](../../docs/nova-intranet-acceptance.zh.md)记录已实现功能、准确适配命令及尚未勾选的目标环境验收项。条件权限语言在缺少权威策略引擎时继续拒绝。

</details>
