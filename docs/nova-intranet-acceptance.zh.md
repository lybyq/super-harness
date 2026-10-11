# Harness 桌面实施与内网交接

[English](nova-intranet-acceptance.md) | 中文

## 实施边界

实现位于 `super-harness` 桌面分支，基于 `nova/upstream.json` 的官方 `dsh-v0.2.1-alpha.2` 基线；社区二十个包固定 `0.4.5`，十二份客户端依赖补丁关闭自动公网心跳。继续复用官方 Agent Loop、Session、Tool、Skill、MCP 和 Permission。企业业务代码位于 `apps/nova-enterprise/src`，统一 TypeScript 与中文 JSDoc；`.mjs` 仅保留构建引导、测试及可执行 fixture。

配套 `nova-harness` 负责 Hub 索引、私有源下载契约、发布与角色解析；不是再造一个 Agent 引擎。本地已完成类型检查、真实 Loader 和回环私有源测试，但不能代替真实内网或签名安装器验收。

## 已落地功能

| 能力 | 实现与使用入口 |
|---|---|
| 桌面 AI Hub | 自适应卡片、README 详情、搜索、精确版本安装、更新、停用／启用、回滚、卸载 |
| 配置表单 | AI Hub → 已安装 → 详情 → 配置参数；类型、注释、必填校验、掩码秘密、保存／清除／重载；安装缺参数直接打开配置页 |
| 用户／项目账户 | AI Hub 顶部选择范围；项目由官方活会话的绝对 cwd 标识，不接受客户端任意路径；实例、运行文件和工具可见集隔离 |
| MCP 启动文件 | `binding.configuration.files` 从公开 JSON／TOML／文本表单生成临时配置；秘密只经环境变量或显式绑定传入，`${TOKEN}` 保留给 MCP 自己解析 |
| 凭据保护 | Windows 默认 DPAPI，原子迁移读取到的旧记录；错误保留原记录，不把秘密输出到日志、命令行或 Hub |
| 自定义角色 | 基础角色加 `add/remove/disable/includeOptional`，职责说明、模板 CRUD、真实 Hub 解析和官方 Agent.inject；下一条任务才消耗模型 |
| 角色团队 | 官方 continuable teammate、独立模型、maxTokens、持久 maxSteps、任务 DAG、独立 Git 工作树、结果读取、显式审阅和单提交 cherry-pick |
| 开放作者入口 | 对话工具 `harness_prepare_resource` 生成待检查草稿；开发与发布页导入目录／文件、创建模板、校验、显式发布至指定 GitLab 或 npm |
| 插件 SDK | `ctx.harnessCapabilities.registerTool` 精确归属动态工具与 effect 撤销；原生 Plugin／Bundle 配置在应用前绑定，不改官方核心 |
| 社区私有任务来源 | Plugin 模板选择 Jira／GitLab Provider，安装后配置，开发与发布页手动刷新；首屏最多 100 个事项、去重、只读、不自动执行或回写 |
| Hub 直接发布 | 上传／同步即进入资源索引，无资源审批流程；角色发布表示不可变版本提交，不是管理员审批 |
| 角色迁移 | 默认角色八份改为真实 MCP ID 与 DeepSeek Runtime；启动 seed 不覆盖既有角色，缺失模板不未经验证发布；显式迁移验证后直接发布 |

项目范围只支持 MCP／Skill，Host Plugin／Bundle 必须用户范围：它们是进程级可信代码，并非项目沙箱。用户级同名能力不会被项目实例偷偷替换。`writeScopes` 是协作提示，不是文件访问控制；`maxSteps` 是请求步骤上限，不是金额或累计 Token 预算。条件／抽象资源策略仍明确拒绝，原生执行权限不能被角色提权。

## 带入代码与编译产物

同时带入 `super-harness` 与 `nova-harness` 的本次修改，按文件三方合并，不覆盖内网已经修改的整棵目录。记录各仓库 commit 和本地 diff，保留上游 MIT／社区 Apache-2.0 许可。没有替你 commit 或 push，也没有重装依赖或做全量 build。

六个本地 MCP 的 package.json 已加入 `novaHarness` 声明，也必须带入：`yapi-mcp`、`memory-mcp`、`mcp/nova-ui-plus-mcp`、`markitdown`、`jira-mcp`、`dbhub`。保留当前版本号便于三方合并，不声称已发布；内网发布前选择未使用的新版本。下面的准备命令用于检查或适配其他内网 checkout，当前六份声明不需要重复写入。

桌面需要企业 `lib/index.js`、`lib/client.js`、`lib/engine.js`、`lib/npm` 以及官方 package-set、社区依赖补丁和 primary-runtime。仅复制源码／根 lockfile／前端 bundle 不能构成离线桌面。已有 Profile 不会自动获取新插件，先使用独立 E 盘测试 home，再通过官方 Profile／补丁 API 增加企业和社区层，禁止直接覆盖真实用户 Profile。

Jira MCP 还需带入 `jira-mcp/src/config/config.ts`、`test/config.test.ts`、`README.md` 的变更：`JIRA_CONFIG_MODE=env-only` 禁止回退用户旧配置，否则桌面可能误用本机另一套 Jira 账号。发布包含该变更的新 npm 版本。

## 部署人员填写的位置

桌面复制 [部署环境示例](../nova/deployment-env.example.ps1)，先创建其中 E 盘目录，将 Hub URL／部署 YAML 路径改为内网值。普通用户不填写 Hub 地址或令牌。Hub 配置 `NOVA_HUB_AUTH_ENABLED=false`，桌面 `NOVA_HUB_AUTH_MODE=none`；免登录只用于受控内网，并不让来源发布权限匿名开放。

Hub 复制 `manifests/deployments/desktop-intranet.example.yaml`，填写真实 GitLab Group、npm registry／staticIndexUrl、CA 和下载主机白名单。来源 `authRef` 的密钥由 Host 环境安全注入，依据现有环境凭据适配器映射，不提交 `.env`、`.npmrc` 或实际密码。npm 标签和 GitLab 分支不作为安装锁：索引保留精确版本、GitLab commit SHA／entryPath，以及 npm integrity／归档哈希。

官方 Electron 更新器独立于社区更新器。内网包应明确设置 `DSH_DESKTOP_AUTO_UPDATE_ENV=test`、`DOWNLOAD_TEST_ORIGIN` 为内网 HTTPS origin、`DOWNLOAD_TEST_RELEASE_ID` 为 32 位小写十六进制部署 ID，并在打包前验证 feed／bin 路径；不要把默认公网 production feed 当成企业更新地址。公开上传脚本针对上游 COS，不能直接作为内网静态源上传器。真实签名证书、更新服务器、统计及账户请求需按下面清单验收。

## 六个 MCP 的准确适配

在 Hub 仓库运行（命令默认只检查，`--apply` 才修改目标 package.json）：

```powershell
node --import tsx/esm scripts/prepare-mcp-manifest.ts --package E:/ai/yapi-mcp/package.json
# After checking the receipt, apply; bump and publish a new immutable version.
node --import tsx/esm scripts/prepare-mcp-manifest.ts --package E:/ai/yapi-mcp/package.json --apply
```

同一命令分别替换以下 package.json。适配定义来自 `manifests/mcp-adapters/desktop.json`，校验真实包名／bin，不猜测标签或路径。

| 来源目录 | 桌面参数 | 内网必须核实 |
|---|---|---|
| yapi-mcp | REGISTRY_JSON；YAPI_MCP_TOKEN、可选 YAPI_MCP_UID | registry 项目结构、授权 token、HTTP 服务可达；临时 registry 通过 REGISTRY_PATH／FILE_REGISTRY 注入 |
| memory-mcp | 无必填参数；INSTANCE_HOME 下独立 JSONL | 按项目隔离、不得存敏感账号内容；依赖闭包必须锁定并镜像 |
| mcp/nova-ui-plus-mcp | CONFIG_JSON；可选 GITLAB_TOKEN | 内网包实际名称／bin、UI 资产仓库、缓存／压缩资源、本地原生依赖 |
| markitdown | CONFIG_JSON | Office／Python／OCR／二进制在目标机可用；工作区读取采用项目范围和 WORKSPACE_CWD |
| jira-mcp | JIRA_BASE_URL、JIRA_USERNAME、JIRA_API_TOKEN | 此适配默认 Bearer PAT；若真实服务要求密码，需另加对应秘密字段／绑定，并发布独立适配版本，不能拿密码冒充 PAT |
| dbhub | CONFIG_TOML、DB_DSN | TOML 使用 `${DB_DSN}`，`--transport stdio --config FILE_CONFIG`；仅授予测试数据库最小权限，验证驱动、SSH、TLS 与网络 |

GitLab MCP 的实际源码目录、包名、bin、传参、协议和认证未提供，不能假造“已适配”。带入后照六个声明新增一条，完成下面验收。任意需要配置的 Skill／Plugin 使用同一 configuration／secrets 声明和表单；无参数则安装即加载。不是所有 Claude Plugin 都兼容官方 Host SDK，必须有 DeepSeek 原生绑定或使用明确的转换适配。

## 默认角色映射迁移

先同步发布六个真实包到 Hub，复制能力 ID 映射 JSON（如内网仍使用 `jira-mcp`，映射 `{ "jira": "jira-mcp" }`），再在 Hub 仓库执行：

```powershell
node --import tsx/esm scripts/import-desktop-roles.ts --hub https://harness.example.internal/api/v1 --mapping E:/harness/deployment/role-id-map.json
# Only after dependency, binding, inheritance and version checks pass:
node --import tsx/esm scripts/import-desktop-roles.ts --hub https://harness.example.internal/api/v1 --mapping E:/harness/deployment/role-id-map.json --apply
```

相同已发布版本不可改内容；脚本拒绝降级，有必要时显式 `--version 1.2.0`。新模板按父角色优先发布，逐项回执，部分成功不是事务。重新执行不会修改内容相同的已发布版本。升级 Hub API 之后桌面读取 `roles?view=published`；新草稿不隐藏旧角色。角色只有能力真实激活后才注入，不把“下载完成”显示成“可用”。

## 本地回归命令

先将 TEMP／TMP 指向 E 盘。桌面仓库增量校验与打包（不是完整桌面 build）：

```powershell
node node_modules/typescript/bin/tsc -b apps/nova-enterprise/tsconfig.host.json apps/nova-enterprise/tsconfig.client.json
node --import tsx/esm --test --test-concurrency=1 nova/tests/*.test.mjs apps/nova-enterprise/tests/*.test.ts
node node_modules/vitest/vitest.mjs run apps/nova-enterprise/tests/role-runtime.spec.ts apps/nova-enterprise/tests/RolePanel.spec.tsx apps/nova-enterprise/tests/HubPanel.spec.tsx apps/nova-enterprise/tests/RoleWorkspace.spec.tsx --maxWorkers=1 --no-file-parallelism
# Run scoped enterprise Host/Client bundling from apps/nova-enterprise:
node ../../node_modules/tsdown/dist/run.mjs --config-loader native
# Return to the desktop root; artifact tests do not use the TS loader:
node --test --test-concurrency=1 apps/nova-enterprise/tests/*.built.test.mjs
```

真实回环安装恢复测试需本地 Hub／mock 源运行，额外设置 `HARNESS_TEST_HUB_URL=http://localhost:3200/api/v1` 与 `HARNESS_TEST_DEPLOYMENT_FILE` 指向 Hub 的 `manifests/deployments/mock-host.yaml`；否则该项会明确 skip。不能把 skip 算作通过。Hub、Jira MCP 的针对性测试命令分别记录在其 tests 和 package scripts；本次未调用真实生产模型、发布端点或用户数据库。

## 2026-10-11 本地验证记录

| 范围 | 结果 |
|---|---|
| Hub 全部本地测试 | 26 个文件、92 项通过 |
| 企业源码／Loader／私有源／恢复测试 | 71 项通过、0 跳过；显式开启回环 Hub 联调 |
| 桌面／社区／Profile／包集／隐私测试 | 73 项通过；Windows 文件复制测试超时设置为 30 秒 |
| 角色运行与 React 面板／工作区测试 | 21 项通过 |
| 编译 Host／Client／独立引擎产物 | 4 项通过，不使用 TS Loader |
| Jira env-only 配置 | 3 项通过 |

Host／Client、Hub／脚本类型检查、针对性源码 lint、六包精确包名／bin 校验、Git 空白检查及六对中英文文档一致性均通过。仅增量编译企业 Host／Client 和 Hub API。以上 264 项分组回归不覆盖签名安装器、真实内网源、GUI 截图或目标机完整离线冷启动。桌面需重启才能加载新的 Host 产物。

## 内网待验收清单

下面留空的不是实现承诺，而是必须在真实环境记录回执／日志／截图后才能勾选的验收项。不要把个人秘密、数据库内容或带 Authorization 的抓包带回外网。

- [ ] 部署地址／CA／白名单：免登录浏览与搜索，普通用户无需管理员审批或填 Hub 令牌；错误证书、非法重定向、未允许下载主机必须拒绝。
- [ ] 逐个七类 MCP：精确下载，新必填表单、错误／有效账号、tools/list、至少一次最小只读工具调用、重载、停用、升级／回滚、卸载；两个项目不同账户不能串用。
- [ ] 私有依赖闭包：npm 完整传递依赖／integrity、GitLab SHA／嵌套 Skill、原生平台包／Python／Office／OCR／主题／宠物静态素材均有内网镜像；默认生命周期脚本禁止，不能为修复单包开启全局任意脚本。
- [ ] 发布闭环：创建测试 GitLab 项目／私有 npm 包，界面生成或导入 → 校验 → 确认 → 上传 → 同步 → 精确安装；重复版本拒绝；tag 失败／源已成功但索引未成功的部分回执可恢复而不重复上传。
- [ ] 作者扩展：真实内网 Skill、Plugin、Bundle 无参数即加载，有参数统一表单；SDK 延迟注册工具、停用、角色拒绝、重启恢复；可信 Host 代码审查单独记录。
- [ ] 默认角色／团队：八角色映射迁移、自由组合、下一条任务日志可见职责；实际模型 provider／model、DAG 依赖、预算耗尽恢复、独立工作树互不覆盖、冲突保留和人工合并。
- [ ] Jira／GitLab Provider：真实 REST 版本、PAT／Basic、项目权限、只读首屏 100 项、去重和内容冻结错误；不自动执行，停用中请求取消，远端无写操作。
- [ ] Windows DPAPI：同用户旧记录迁移、密文不可跨用户读、故障不破坏旧记录；不要将用户凭据打进安装包。升级前备份权限受控的原始 store。
- [ ] 完整安装器：真实 Windows 签名、干净机器断公网冷启动、无开发源码依赖、E 盘路径、许可证；GUI 卡片／表单／团队／看板截图验收。源码测试不等同此项。
- [ ] 出站网络审查：防火墙只允许 Hub／GitLab／npm／模型适配器／内网更新源；审查官方账号／统计／更新及社区素材；被禁社区市场、远程隧道、GitHub Provider 不应访问公网。
- [ ] 内网更新／故障回退：TLS feed、SHA-512、发布者签名、活动任务不被静默中断、用户确认、升级后 Profile／角色／配置保留；坏包拒绝、旧包重装及用户数据备份还原，不声称已具备一键数据降级。

## 已知非目标

免登录部署不引入 SSO／审批后台。任意条件策略没有权威执行器，继续 fail-closed；可信 Host 插件不提供 OS 沙箱。无需将这些故意的边界当成“缺一块未接线”，也不能据此绕过官方权限。真实 GitLab MCP 坐标、生产发布授权、Windows 证书与内网实测是唯一不能在外网替你填好的材料。
