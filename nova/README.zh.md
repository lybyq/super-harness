# Nova 企业开发

[English](README.md) | 中文

## 概述

日常开发、内网交付与角色／团队使用，从[桌面操作手册总览](../docs/nova-desktop-handbook.zh.md)开始。

本目录保存 Nova 自有企业集成代码。桌面应用继续使用官方 [Electron 应用](../apps/desktop/README.zh.md)，现有 Nova Hub 仍是独立服务。[upstream.json](upstream.json) 固定官方源码基线。凭据和实际内网部署地址不得进入这个公开仓库。

## Hub 网络连接

[HubClient](hub-client.mjs) 调用现有 Hub 的目录搜索、能力详情、角色列表和解析接口。调用方提供包含 `/api/v1` 的完整 API 基址、宿主侧凭据读取函数、网络超时和响应字节上限。默认要求 HTTPS，只有部署显式允许时才接受 HTTP。凭据读取先于网络超时，读取函数负责自己的取消机制和时间预算。

客户端只通过 Authorization 请求头发送 Bearer 凭据，拒绝重定向，限制响应字节数，不自动重试操作。错误只包含稳定错误码和 HTTP 状态，不复制服务端响应正文或底层凭据／网络错误。角色解析必须显式指定 Runtime，避免 Hub 静默使用现有默认 Runtime。

成功返回的 JSON 仍是不可信领域文档。消费方必须验证能力、角色版本、配置声明、制品完整性和执行策略，才能安装或激活能力。本模块只是 HTTP 库，不是 Cordis 插件、安装器、权限执行器或桌面 UI，也不会自行挂入桌面。测试使用本地 HTTP 模拟服务，不代表已经接通内网 Hub。

[Nova 企业插件](../apps/nova-enterprise/README.zh.md) 负责桌面 **AI Hub**、内网能力生命周期、配置、角色及资源发布。当前行为与验收边界以该包参考文档为准。业务源码使用 TypeScript 和中文 JSDoc，生产环境加载编译产物。

## 社区桌面组合

桌面 Host 将 `@linxin666/dsh-web-all@0.4.5` 声明为生产依赖。[桌面组合](../apps/desktop/src/nova-community.ts) 依次加载官方基础与 Web Bundle、已发布的社区 Bundle、Host 的[内网默认配置](../apps/desktop-host/nova.enterprise.patch.yml)。工作区与生产准备流程都将社区各模块固定在同一发布版本。不修改 agent loop（智能体循环）、会话格式、MCP 协议或普通 CLI（命令行界面）Profile。

桌面通过官方 Profile API 启动，以桌面 Host 的 package manifest 作为安装依赖入口。社区聚合包自身的插件导出因此进入安装依赖图；仅通过 CLI 的依赖入口解析它的 Bundle 补丁不足以完成挂载。

选定的社区版本包含任务看板、Git 图、用量视图、会话归档、模型能力设置、预设、主题、宠物和插件设置。社区自身默认关闭 SSH、梁深和 skill（技能）浏览器。Nova 额外关闭公网市场、公网社区目录、远程 Web 隧道、社区更新器和 GitHub 看板集成。关闭的包仍在依赖集合中，验证通过后可通过配置覆盖启用。这些默认配置不是防火墙，也不是企业授权策略。

[完整社区清单](../docs/nova-community-integration.zh.md) 说明全部二十个固定包、独立工坊条目、旧 SDK 插件和离线素材边界。Nova 私有插件与桌面 Host 一起显式打包，包集准备会拒绝缺失的 Host 或 Client 文件；这不代表签名离线安装器已经验收。

新桌面 Profile 无需运行包管理器便会选择社区层。已有 Profile 与用户补丁保持不变，已有纯官方 Profile 不会自动增加新层。原生故障恢复会移除社区层，仅保留官方基础与 Web Bundle；再次启动不会重新启用已移除的层。独立企业插件提供内网 AI Hub 和角色团队，社区公网市场继续保持关闭。

下面的开发启动命令跳过已有 build。纯官方对照使用独立的默认 home 和 Electron 用户数据目录。显式设置的 `DSH_HOME` 仍然优先，启动器不会替换已有 Profile。在全新机器上，上游启动器仍会先下载 Electron 并准备固定版本的 Node／Python／Office 运行时，再打开窗口。

```sh
pnpm run start:desktop:official
pnpm run start:desktop
```

生产准备流程把社区 npm 依赖装入最终运行时，而不是在最终用户首次启动时安装。带入内网需要携带完整运行时与 primary-runtime 资源，不能只复制源码或根目录 lockfile。当前代码已有 Profile 组合、缺失交付文件拒绝、故障恢复和类型检查证据；GUI 渲染、每项社区功能和断网安装包启动仍需分别验收。官方 Electron 更新器、账户服务与分析统计也需要按部署环境审查出站网络行为。

社区代码作为来自 [dsh-web](https://github.com/zhu1090093659/dsh-web)、独立管理版本的 Apache-2.0 依赖保留，官方 Harness 仍使用 MIT。交付制品必须保留上游许可证及适用声明。包版本固定与依赖完整性元数据不能替代对插件执行和传递依赖的安全审查。

Nova 的依赖补丁在十二份已发布客户端制品中禁用自动发送到公网的使用心跳。聚合客户端无法从 Host 获取模块状态时，会保持子模块 UI 关闭并记录可操作的错误，不会退回到挂载所有子模块。[生产补丁选择](../apps/desktop/scripts/runtime-patch-policy.ts) 会把相同补丁装入交付依赖树，并核对工作区 lockfile 中的补丁哈希。这些修改不会拦截所有出站连接、关闭官方统计或授予工具使用权限。

## 验证

在仓库根目录执行：

```sh
npm run test:nova
node --check nova/hub-client.mjs
```

测试通过真实本地 HTTP 请求验证行为和资源清理，不使用生产凭据。这些测试不代表桌面构建、社区插件或私有 npm／GitLab 下载已经通过验收。
