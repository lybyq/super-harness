---
description: "Harness Desktop 操作手册总览：内网本地开发、离线转移、角色团队、能力配置、插件开发与 Windows 安装包。"
---

# Harness Desktop 操作手册总览

[English](nova-desktop-handbook.md) | 中文

## 先看这一页

这是企业定制桌面端的统一入口。`super-harness` 是用户使用的桌面与 Agent 工作台；`nova-harness` 是内网 Hub 服务与共享安装库。平时改界面、角色或桌面功能就在前者开发，改资源索引、私有源同步或 Hub API 就在后者开发。普通用户只安装 Desktop，不需要这两个源码仓库、pnpm 或数据库。

日常路径是：打开项目 → 创建聊天 → 到 AI Hub 安装所需能力并填写参数 → 应用角色 → 在聊天中开始工作。团队是另一种执行方式，会启动多个独立 Agent，不是给一个聊天多加几个标签。

## 按问题找手册

下面的每页都有明确用途，不需要从头读所有官方文档。

| 你现在要做什么 | 打开哪份文档 |
|---|---|
| 上下文图表、恢复、健康、通知、诊断和隔离环境 | [桌面运维手册](user/nova-desktop-operations.zh.md) |
| 外网准备依赖、压缩带入内网、离线安装 | [离线开发与交付手册](cookbook/nova-offline-development.zh.md) |
| 导出原始 npm 依赖并发布私有源 | [离线开发与交付手册](cookbook/nova-offline-development.zh.md) |
| 内网本地开发、构建、重启 Desktop、制作 Windows 安装包 | [离线开发与交付手册](cookbook/nova-offline-development.zh.md) |
| 角色组合与角色团队怎么选、怎么用 | [角色与团队操作教程](user/nova-roles.zh.md) |
| 桌面 AI Hub 安装／更新／停用／卸载与配置表单 | [企业插件使用说明](../apps/nova-enterprise/README.zh.md) |
| 写 MCP、Skill、Plugin、Bundle，或让 Agent 创建后发布 | [能力开发与发布规范](nova-capability-development.zh.md) |
| 二十个社区模块是什么、哪些默认关闭 | [社区集成清单](nova-community-integration.zh.md) |
| 部署人员要填哪些地址、认证、CA 和来源白名单 | [内网交接与验收](nova-intranet-acceptance.zh.md) |
| Electron、NSIS、签名、安装器与更新的具体行为 | [官方桌面参考](../apps/desktop/README.zh.md) |
| 开发一个官方原生模块／工具／界面扩展点 | [扩展开发入口](cookbook/extension-cookbook.zh.md) |
| 官方基础开发流程、类型检查与测试 | [开发指南](development.zh.md) |
| 升级时了解目录状态字段已经移除 | [目录状态升级说明](upgrade-guide/v0.2.1-alpha.2/nova-catalog-without-status/guide.zh.md) |

## 两个仓库如何协作

业务功能按责任拆开开发，不要求每次改动都同时修改两个仓库。

| 修改内容 | 所在位置 | 修改后做什么 |
|---|---|---|
| 桌面 AI Hub、参数界面、角色团队、主题 | `super-harness/apps/nova-enterprise` | 构建受影响产物，重启桌面 |
| Electron 启动、内置运行时、安装包 | `super-harness/apps/desktop` 与 `apps/desktop-host` | 桌面构建／打包测试 |
| Hub 目录、GitLab／npm 来源、角色解析 | `nova-harness/apps/hub-api` 与其共享包 | 构建并重启 Hub，验证 API |
| 能力下载、版本锁、安装器共享逻辑 | `nova-harness/packages/core`、`installer`、`contracts` | 构建共享包，重新生成桌面 `lib/engine.js` |
| 某个业务 MCP | 对应 MCP 自己的仓库 | 构建新版本，发布内网源，同步 Hub，再更新桌面实例 |

共享安装器已经随桌面交付，不要求最终用户在电脑上放一份 `nova-harness` 源码。只有安装器逻辑变化时才重新生成引擎。`NOVA_*` 环境变量和包内 `novaHarness` 字段是现有协议名称，不要为改显示品牌而随意改掉。

## 现在能否企业落地

代码已经具备企业工作台的主要功能：内网 Hub、精确版本安装与配置、账号保护、角色组合、团队协作、开发发布入口和离线主题。可以在受控内网开展完整部署验收；不能因为外网构建成功，就宣布所有公司账号、所有 MCP 和安装包都已经验收完成。

正式分发前，部署负责人必须完成[交接清单](nova-intranet-acceptance.zh.md)中的真实源下载、最小只读调用、两个项目账号隔离、角色工具拒绝、团队实际模型运行、干净电脑断公网安装与冷启动、更新源和出站审查。未勾选的项目是目标环境待验，不是隐藏的“已完成”。签名证书与实际来源凭据只能由内网提供。

不需要为了看起来功能更多而继续堆插件。已有原生工具能处理项目文件、终端、Git 和任务；业务能力按需装：代码图谱、Wiki、GitLab、Jira、YApi、数据库、文档转换、浏览器。现有六个本地 MCP 有适配材料；CodeGraph、Wiki 和 GitLab MCP 的真实包坐标与认证仍需要内网核实。缺少某项能力，可以导入兼容的外部制品，或者自己开发 MCP／原生 Plugin，但仍须验证入口、依赖、配置、权限、许可证和最小调用，不能把“npm 安装成功”当成“兼容”。

角色不等于权限沙箱：角色限制平台可见／可执行工具，服务器账号的项目 ACL、数据库只读权限及操作系统权限仍然有效。免登录 Hub 不需要 SSO 或审批系统，也不代表所有员工可以匿名发布私有 npm 包。可信 Host Plugin 会在宿主进程执行，必须审查代码。

## 主题与普通用户入口

主题由桌面本地初始化到 `$DSH_HOME/skins`，在社区皮肤中心预览、应用，明暗模式由官方外观设置控制。保留原有六套纯配色；背景主题也只使用随包本地素材。主题不会改变当前选择、安装执行权限、账号配置或模型能力。

安装时需要参数的能力会进入配置页；用户到 AI Hub → 已安装 → 详情 → 配置参数即可修改。没有参数的能力安装后加载，不要求用户手填 Hub 地址。Hub 不可达时的缓存不是整套离线市场：没有下载过的制品仍需访问内网源。

## 开发备注

内网验证由实际部署负责人记录结果；本手册中的目标机操作不能代替签名安装包与生产业务联调回执。
