---
description: "Harness 企业能力开发参考：新增 MCP、Skill、原生 Plugin／Bundle、内网导入、参数配置、角色组合与 Agent 草稿发布流程。"
---

# Harness 能力开发规范

[English](nova-capability-development.md) | 中文

## 概述

本参考用于扩展当前桌面，不建立第二个 Agent 引擎。能力作者在独立仓库开发 MCP／Skill／Plugin，平台开发者在 `super-harness` 扩展官方服务和界面，`nova-harness` 负责发现、下载与角色解析。安装统一走 AI Hub；无参数直接加载，有必填参数先配置再激活。

Agent 已能创建文本草稿，用户检查后发布到指定内网源、同步 Hub、安装并加入角色。发布完成不表示生成代码已通过测试；当前没有自动执行任意草稿的构建沙箱，也没有替作者配置 GitLab CI。真实内网验证位置见[交接清单](nova-intranet-acceptance.zh.md)。

## 目录

- [选择扩展入口](#extension-entry)
- [源码与模块规范](#module-development)
- [新增与导入 MCP](#mcp-onboarding)
- [配置和权限](#configuration-permissions)
- [Skill 与原生 Plugin](#skill-plugin)
- [Agent 创建与发布闭环](#agent-authoring)
- [验收与失败恢复](#acceptance)
- [开发备注](#dev-note)

-----

<a id="extension-entry"></a>
## 选择扩展入口

优先使用能满足目标的最小扩展，不能把任何 npm 包或 Claude 插件都标成 Harness Plugin。

| 目标 | 类型与入口 | 发布位置 | 约束 |
|---|---|---|---|
| Jira／Wiki／代码图谱／浏览器等外部工具 | MCP；官方 MCP Client | 私有 npm，统一能力声明 | 当前 npm CLI 入口使用 Node；Python／原生二进制需明确包装适配或独立服务 |
| 工作步骤、领域约定、交付规范 | Skill；官方文件系统 Skill Provider | GitLab `skills` Group | 公开参数可进入模型；不支持 Skill 秘密参数 |
| 新 Host 服务、工具、事件监听、任务来源 | 原生 Cordis Plugin；`apply(ctx, config)` | GitLab `plugins` Group | 进程级可信代码，仅用户范围 |
| 多个官方／企业插件的可插拔组合 | Bundle；`package.json` 的 `dsh.bundle.patch` | GitLab `plugins` Group | 走官方 Plugin Manager；可能需要桌面重启 |
| 桌面面板、设置、渲染组件 | 官方 Client 插件或含 Client 的 Bundle | 桌面包集／经验证的 Bundle | 单独的 Client 包不能当 Host JS 动态 import |
| 模型路由、权限策略、存储后端替换 | 已有 Service Provider／Preset／Profile 扩展点 | 企业平台源码／Bundle | 不改 Agent Loop，不绕过官方权限 |

MCP 的工具、Skill 的流程和 Role 的职责是三层：角色只组合已存在能力，不生成工具实现；团队成员绑定各自角色与能力范围，不能因为 Lead 安装了工具就无条件共享。

-----

<a id="module-development"></a>
## 源码与模块规范

企业 Host 代码位于 `apps/nova-enterprise/src`，Client 代码位于其 `src/client`；入口分别为 `src/index.ts`、`src/client/index.ts`。新领域模块放在相应目录，不把功能全部塞进入口文件。新增可独立演化的官方服务包按[添加包](cookbook/adding-a-package.zh.md)与[架构](architecture.zh.md)办理；社区移植也是插件／Bundle，不修改其运行时身份后再冒充官方实现。

开发使用 TypeScript、ESM、strict 与中文 JSDoc。源码包遵循本仓库 `.ts` 相对 import 及编译器重写规则；独立 MCP 仓库遵循自己的构建配置。交付制品是编译好的 JS 与所需静态资产，不要求目标桌面加载原始 TS。模板中的 `index.js`／`server.mjs` 是可直接校验的运行制品，不代表业务源码应统一写 JS。

每个对外方法说明参数、返回值、拒绝条件、副作用与清理责任；错误采用结构化代码，界面给出可操作说明，不打印 Token、请求认证头或配置明文。可选服务通过 `ctx.get()` 判定；必要服务声明 `inject`，缺失时明确失败。事件与注册通过 `ctx.on()`／`ctx.effect()` 管理，撤销时取消请求、关闭子进程、移除工具和监听器。

新增工具遵循[添加工具](cookbook/adding-a-tool.zh.md)，使用稳定工具名、明确 JSON 参数与结果 schema，并设计结果展示。模型看见的职责、工具结果和上下文必须能从官方 Session 日志重建；不能只修改内存提示词。不得直接改写已发布 Session 数据格式。

Host 与 Client 编译项目分开；修改公共类型时同步所有消费者。UI 文案放进 typed locale 字典，不硬编码中文按钮。独立插件有自己的源代码、测试、构建与 README；发布内容不能带 `.env`、`.npmrc`、账号、开发缓存或本机路径。

开发验收至少覆盖成功与拒绝、动态注册与卸载、两个项目隔离、角色不允许时的实际执行拒绝、超时与取消、冷启动恢复。源码测试不替代编译制品的 Loader 测试。若新增能力改变模型可见输出，还需补仓库要求的无密钥回放；修改官方核心类型、Session 或 SDK 时采用其对应规范，不能只跑企业层测试。

-----

<a id="mcp-onboarding"></a>
## 新增与导入 MCP

桌面按声明加载，不维护 CodeGraph／Wiki 等名称的专用开关。准备工具现在支持 `--manifest` 自定义 JSON；Hub 根据源索引和包声明发现资源，新增包通常不需要修改桌面核心。通用工具默认只检查，`--apply` 才修改明确指定的 package.json，不下载、启动或发布。

下面是格式示例，不是任何真实 Wiki／CodeGraph 的参数。必须根据对应源码确认包名、版本、bin 和环境变量；`packageVersion` 可选，填写时要求准确匹配，适用于固定上游版本适配。

```json
{
  "packageName": "@internal/future-mcp",
  "packageVersion": "1.0.0",
  "manifest": {
    "id": "future-mcp",
    "displayName": "Future MCP",
    "configuration": [
      { "key": "BASE_URL", "required": true, "description": "服务根地址", "schema": { "type": "string", "format": "uri" } }
    ],
    "secrets": [
      { "key": "API_TOKEN", "required": true, "scope": "user", "description": "当前用户访问令牌" }
    ],
    "runtimeBindings": {
      "deepseek-harness": {
        "type": "mcp",
        "compatibility": ">=0.2.1-alpha.2",
        "configuration": { "transport": "stdio", "bin": "future-mcp", "args": [], "env": { "SERVICE_URL": "${BASE_URL}" } }
      }
    }
  }
}
```

`manifest` 内容写入 `package.json.novaHarness`，而外层包坐标不写入声明。`bin` 对象必须按准确键选择安全相对入口；字符串单入口应省略绑定里的 `bin`，与桌面下载器一致。包名／指定版本／入口不一致、缺少 stdio MCP 绑定、已有不同声明都会拒绝；定制声明不能被通用工具覆盖。

现有六包适配仍用内置声明；Playwright 新声明在 Hub 仓库的 `manifests/mcp-adapters/playwright.json`。下面在 Hub 仓库执行，第二条核对本机依赖，仅在当前开发 checkout 路径存在时适用；不会修改 `node_modules`。

```powershell
node --import tsx/esm scripts/prepare-mcp-manifest.ts --package E:/ai/yapi-mcp/package.json
node --import tsx/esm scripts/prepare-mcp-manifest.ts --package E:/ai/super-harness/packages/experimental/browser-use-playwright-mcp/node_modules/@playwright/mcp/package.json --manifest manifests/mcp-adapters/playwright.json
```

发布操作由包作者针对独立源码 checkout 执行：校验、构建并测试，选取未占用的私有版本，将编译入口／生产依赖锁／README／声明打包，发布私有 npm，更新 `seedPackages` 或静态索引，并使 `packagePatterns` 能匹配准确包名，再同步 Hub。不能只上传 tarball 却没有可发现的索引。若重打包导致内容改变，应记录原始上游版本／许可和新的私有坐标、integrity，不能冒充原始上游制品。

外网导入先固定源码或包版本，核查许可证、可执行脚本、网络请求、依赖与原生资产，再将完整依赖闭包镜像到内网。包含 `npm-shrinkwrap.json` 可锁定 npm 制品依赖；只有 pnpm 开发 lockfile 不保证安装器执行 npm 时版本固定。安装默认禁止生命周期脚本；需要构建的资产应在受控构建环境预制，不开启全局任意脚本。GitLab MCP 不能仅凭 Git 仓库类型走当前 Skill／Plugin 发布入口，需明确 MCP 制品入口。

CodeGraph 要核实索引命令、索引数据库／缓存路径、项目根目录、首次建图成本、Node／Python／原生依赖和扫描边界；Wiki 要核实产品类型及版本、REST 路径、账号认证、空间／项目限制、只读工具与正文敏感信息。两者在本机未找到源码，暂不能声明已适配；真实坐标和验证回执填写在[内网交接](nova-intranet-acceptance.zh.md)。

Playwright（用户写作 playwrite-mcp）有两个独立入口：官方 `experimental-browser-use-playwright-mcp` 按 Session 提供浏览器；AI Hub 安装 `@playwright/mcp` 则按能力实例提供通用 MCP。不要同时启用造成重复工具。当前新增声明按本机 `@playwright/mcp@0.0.80` 核对，使用独立无头浏览器、明确可执行路径、允许 origin 和实例输出目录；它不声明同一项目的每条聊天都有独立浏览器。官方 Session Provider 不自动成为 Hub 角色管理的能力。

Playwright 浏览器、其固定版本依赖及目标系统运行库需内网预置；`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` 不会替你安装浏览器。上游 `allowed-origins` 不限制重定向，最终网络控制由防火墙承担。网页登录／Cookie 等也不能写入 Hub 公开参数；当前模板不提供登录态导入。只有包／CLI 声明已验证，真实页面操作和图片模型路由仍待内网实测。

-----

<a id="configuration-permissions"></a>
## 配置和权限

用户入口是 AI Hub → 已安装 → 资源详情 → 配置参数；先选用户或项目范围。安装遇到缺少必填参数直接进入表单；保存且成功激活才是可用。Hub 地址／来源认证由部署人员配置，不要求普通用户填写 Hub Token。每个新 MCP 的特有字段由其清单决定，不强制所有 MCP 使用 URL＋Token。

公开字段使用 `configuration`，账号秘密使用 `secrets`。桌面支持 string／number／integer／boolean／字符串数组及规定的 enum、范围、长度、uri 等 schema；不要上传界面不支持的任意 JSON Schema。复杂 JSON／TOML 用带说明的字符串字段，`_JSON`／`_TOML` 表单显示多行文本。修改配置键名或认证方式是兼容性变更，必须提供迁移说明，不能静默拿旧密码当新 Token。

`${FIELD}` 精确替换保留 JSON 类型；stdio 中普通环境变量名字段会传入子进程，`env` 可显式映射服务要求的名字。临时公开文件采用 `configuration.files` 的 `{name, field, format}`，支持 json／text，`FILE_<name>`、`INSTANCE_HOME`、`WORKSPACE_CWD` 由 Host 生成；字段不得伪装同名保留值。MCP 进程 cwd 是制品 Store，不自动切换到项目目录，需项目路径的 MCP 应在明确参数中引用 `WORKSPACE_CWD`。

配置文件仅写公开内容，`${DB_DSN}` 等保留给 MCP 自己读取环境变量，不能把秘密插入生成文件。秘密留在 Host 凭据记录／运行内存，Windows 使用 DPAPI；不会通过正常配置读取返回界面、进入 Hub 或 Skill 文本。但 MCP 工具输出可能自行泄漏凭据，作者仍负责脱敏；平台不能把任意插件源码当作安全沙箱。

Role 控制可见能力和支持的实际工具拒绝；服务器账号 ACL、数据库只读账号、项目与文件访问限制仍是最终权限。源码生成、安装和角色组合都不提升这些权限。项目隔离由项目真实 cwd／归属确定，不接受 Client 任意路径；Host Plugin／Bundle 只允许用户范围。条件策略和抽象资源审批规则不支持时明确拒绝，不能默认为允许。

-----

<a id="skill-plugin"></a>
## Skill 与原生 Plugin

Skill 制品包含 `SKILL.md` 的 name／description frontmatter、流程说明、README 和 GitLab 的 `nova.manifest.yaml`，其 `metadata.id` 与能力 ID 一致，`runtimeBindings.deepseek-harness.type=skill`。配置项可附加到模型看到的 Skill 内容，因此只能放公开工作约定；秘密操作依赖对应 MCP／Plugin，不能把密码塞进 Skill。通过 Role 的 add／remove／disable／includeOptional 组合已有能力，不改原始默认角色。

原生 Plugin 制品包含 `package.json` 的 ESM／编译后 `main`／`dsh` 声明、JS 入口、README 与 `nova.manifest.yaml` 的 plugin 绑定。当前开发发布页给出了标准 Plugin、Jira／GitLab Board 模板；具体可执行文件由[模板实现](../apps/nova-enterprise/src/publication.ts)拥有，不复制一份漂移的 SDK 示例。

企业工具通过 `ctx.harnessCapabilities.registerTool(definition)` 注册，服务声明 `inject=['harnessCapabilities']`。SDK 使用安装实例注入的真实 owner，动态工具也受角色限制，返回异步撤销函数并由 effect 管理。不要手动伪造 `harnessCapabilityOwner`，也不要用普通工具注册器延迟注册来绕过归属。原生旧插件绕开此 SDK 的任意动态行为不在企业精确权限保证内。

Plugin 的运行配置在官方 Fiber 挂载前绑定 `${FIELD}`；Bundle 在启用前按声明映射自己所拥有的插件配置，不能映射其他 Bundle 或覆盖核心服务。含 Client 的独立 Plugin 不走 Host import；按官方 Client／Bundle 构建规范交付并验证 Loader。仅有 npm 包名、Claude manifest 或一个 JS 文件，不等于原生 Harness 插件。

Role 团队通过官方 Agent.inject 注入职责，按依赖图创建任务，成员可选择 provider／model、maxTokens／maxSteps 与独立 Git 工作树。新增能力安装后仍需加入相应成员角色，不自动扩大团队权限。`maxSteps` 不是金额限额；工作树不是 OS 文件沙箱。团队具体操作与内网验收仍由[交接文档](nova-intranet-acceptance.zh.md)记录。

-----

<a id="agent-authoring"></a>
## Agent 创建与发布闭环

当前闭环是用户掌握发布决定的工作流，不是资源审批系统。用户可让 Agent 创建 Skill／MCP／Plugin，模型通过 `harness_prepare_resource` 保存 UTF-8 文本文件草稿；工具不执行生成代码，也不读取发布凭据。每个草稿绑定实际会话／项目，当前最多保留 20 份、每份最多 100 个文件，字节预算来自部署 `maxRequestBytes`（默认 64 KiB、可配置到 1 MiB），不是大型制品仓库。

1. 在指定项目的聊天中描述能力、业务范围、只读要求、真实平台版本及参数名；不发送真实密码。Agent 生成 README、能力声明和必要的源码／运行制品，并保存草稿。
2. 用户打开 AI Hub → 开发与发布，加载并导入生成草稿，或导入自己的目录／文件，检查内容并选择准确源与版本。草稿可编辑／删除，删除不删除远端包。
3. 作者先在独立开发工作区完成构建和测试，再导入编译后制品。当前界面是文本文件编辑器，不会为任意 TypeScript／Python 源码自动补全依赖、执行构建或打包二进制。
4. 页面校验文件路径、清单、原生入口、准确版本、来源范围和内容摘要；Skill 秘密参数、敏感文件、npm 发布脚本及外部 publishConfig 会拒绝。此校验不是代码安全审查或 MCP 业务联调。
5. 用户明确确认相同摘要后上传：Skill／Plugin 写指定 GitLab 现有项目并创建固定 SHA 标签，MCP 发布指定私有 npm 精确版本。GitLab 不自动替你创建项目；账号权限和 Group／scope 由部署限制。
6. 上传后同步来源并确认 Hub 索引存在对应版本／SHA；然后在 Hub 安装该版本、填写参数、验证工具调用，加入个人角色／团队。最后一步使用正常安装入口，不在发布成功时自动运行生成代码。

因此现有功能覆盖“创建—检查—发布—发现—安装—使用”，而“自动构建—自动业务测试—自动上线”不在当前闭环。复杂 MCP 的持续交付应由其 GitLab CI／制品流水线负责，桌面只消费已构建制品；不要通过取消用户确认来代替缺少的测试环境。

-----

<a id="acceptance"></a>
## 验收与失败恢复

以精确 ID／包版本／SHA／manifestChecksum 记录结果，不以“下载成功”代替“工具可用”。源码修改需要针对性类型检查和测试；发布后需要通过实际桌面安装链验证。测试回执不含 Token、用户业务数据或认证头。

| 阶段 | 必须记录 | 不能推出的结论 |
|---|---|---|
| 声明校验 | 实际包名／bin／绑定／字段约束 | 协议或账号已经可用 |
| 本地集成 | 官方 Loader、MCP 握手、tools/list、最小只读调用 | 真实内网 ACL 已验证 |
| 生命周期 | 配置／重载／更新／回滚／停用／卸载、工具撤销 | 任意第三方代码自动沙箱化 |
| 权限 | 错误账号拒绝、两个项目隔离、角色拒绝最终执行 | 角色可以替代服务器权限 |
| 离线制品 | 依赖／原生资源／浏览器镜像、无公网冷启动 | 仅源码测试等于签名安装包 |
| 作者发布 | 确认摘要、源提交、Hub 可发现、再安装使用 | 声明有效等于生成代码安全 |

`source-partial` 保留 GitLab commit SHA：提交成功但 tag 未成功，需要核对后续动作，不能自动重传全部文件；`published-not-indexed` 表示源已成功而 Hub 同步／发现未成功，修复索引后同步，不能重新发布同一个 npm 版本。网络写入结果不确定也停止并核对远端，不静默重试；用户已有配置和安装回执必须保留。

工具清单变化可能使旧角色拒绝列表失效，更新能力时同时复查角色配置；原生工具的稳定命名由作者负责。公开配置／秘密键改名、所需平台依赖变化和 Bundle 重启要求需写入升级说明。未提供源码的 CodeGraph、Wiki、GitLab MCP 及真实浏览器／私有发布链路均留在内网验收，不能写成已通过。

## 开发备注

无。尚未执行的内网操作由交接清单管理，不在此参考中宣称已完成。
