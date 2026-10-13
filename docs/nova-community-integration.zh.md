# Nova 社区集成完整清单

[English](nova-community-integration.md) | 中文

## 发布依据

已核对的社区发布组合是 [dsh-web v0.4.5](https://github.com/zhu1090093659/dsh-web/releases/tag/v0.4.5)，发布时间为 2026-10-05。本清单依据该版本的发布包声明、默认配置和[聚合清单](https://github.com/zhu1090093659/dsh-web/blob/v0.4.5/packages/dsh-web-all/aggregate.yml)，不以未固定的开发分支或旧截图为依据。

Nova 保留 [upstream.json](../nova/upstream.json) 中的官方源码基线，以经过审查的依赖及补丁接入社区模块。社区组合声明适配官方 0.2.0-rc.2 及之后的版本；这个声明不代表所有功能都已在 Nova 固定的 0.2.1-alpha.2 基线上验收。

## 完整依赖清单

下列包全部使用 `@linxin666/` scope，在 [nova-community.ts](../apps/desktop/src/nova-community.ts) 中固定为 **0.4.5**。总计 **20 个包：1 个聚合包和 19 个模块**，不只是前面重点展示的几个界面扩展。已包含在依赖闭包、配置已启用、挂载成功和功能已验收，是不同状态。

| 包名后缀 | 能力 | Nova 默认状态 |
|---|---|---|
| dsh-web-all | 聚合 Bundle、默认配置、模块开关 | 启用 |
| dsh-client-ui-plugin-manager | 社区插件管理 | 启用 |
| dsh-client-ui-market | 公网市场 | Nova 关闭 |
| dsh-client-ui-task-board | 任务看板与执行集成 | 启用 |
| dsh-client-ui-task-board-github | GitHub Issues Provider 与受控回写 | Nova 关闭 |
| dsh-client-ui-git-graph | Git 历史及图谱 | 启用 |
| dsh-remote-web-ui | 远程 Web 访问 | Nova 关闭 |
| dsh-update | 社区更新器 | Nova 关闭 |
| dsh-ssh | SSH 能力 | 上游关闭 |
| dsh-liangshen | 梁神 Agent Preset 及配套运行行为 | 上游关闭 |
| dsh-client-ui-skill-explorer | Skill 浏览 | 上游关闭 |
| dsh-usage | 用量与历史视图 | 启用 |
| dsh-session-archive | 会话归档 | 启用 |
| dsh-client-ui-model-capabilities | 模型能力配置 | 启用 |
| dsh-client-ui-web-ui-settings | 扩展 UI 设置 | 启用 |
| dsh-i18n | 社区国际化 | 启用 |
| dsh-client-ui-community-plugins | 公网创意工坊索引 | Nova 关闭 |
| dsh-client-ui-preset-center | 预设中心 | 启用 |
| dsh-client-ui-skin-center | 主题中心 | 启用 |
| dsh-pet | 桌面宠物 | 启用 |

预设、主题、宠物和创意工坊模块也有独立社区仓库；它们已经是所选聚合包的依赖，不是另一个无关桌面 Fork。它们的远程目录及可下载素材不会因为 npm 版本已固定，就自动随代码离线交付。

## 不只是外观扩展

所选版本增强了看板 Provider 集成、执行验收门禁、受控 Issue 回写、标签和流程移动，也扩展了历史用量查看及批量插件更新。这些是在官方基座周围增加的社区功能，不是替换 Agent Loop。

梁神是可选 Agent Preset，包含 MCP 命名空间发现和分页、循环／停滞处理、持久事实登记等运行层能力，不只是人格提示词。它应与 Nova 企业角色分开管理，启用前需要适配验收；不能默认宣称存在性能优势。

SSH 和远程 Web 会增加执行或网络暴露面。打开界面不等于企业授权，内网替代方案仍须保留认证、作用域凭据、审计和明确部署批准。

## 创意工坊插件与废弃导出

公网创意工坊可能列出不属于聚合包依赖的第三方插件。不能承诺每个工坊条目都已集成或兼容。

- 当前聚合清单排除 `dsh-better-sidebar@0.19.1`，因为其 peer SDK 范围指向较旧的官方 0.1.5-rc.1 系列，而不是当前组合。
- 排除 `@mlgbnb/dsh-archive-manager@1.0.7`，因为它导入了已移除的 API；这与已包含的 session-archive 模块不是一回事。
- desktop-launcher、dsh-perf、describe-image 和 doctor 等兼容导出是空占位，并非可工作的增强功能。独立模块也保留了旧兼容路径，导入路径存在不能证明功能仍存在。

需要某项第三方功能时，应检查许可证、精确 SDK 导入、版本、网络行为和素材。将废弃 API 移植到官方扩展点，或维护经过审查的本地 Fork；不要通过放宽依赖检查强塞旧插件。

## 内网集成与策略

### 更多实时监测与图表插件

2026-10-12 核对的上游最新发布为 [0.4.6](https://github.com/zhu1090093659/dsh-web/releases/tag/v0.4.6)；Nova 仍固定 0.4.5，不自动替换已审查的依赖组合。下面是独立维护的插件，不在当前二十包集合中。上游介绍说明它们适合补充哪些能力，不代表 Nova 兼容性已验证。

| 插件 | 展示什么 | 内网验收 |
|---|---|---|
| [dsh-context](https://github.com/bowenliang123/dsh-context) | 上下文组成、趋势、活动热力图及 Fleet 实时 Agent 卡片 | 内置 0.69.1 并补丁禁用余额请求；验收真实内网会话，镜像自己的依赖闭包 |
| [dsh-system-monitor-plugin](https://github.com/JularDepick/dsh-system-monitor-plugin) | Host 与上报子进程的 CPU、内存曲线 | 验证 Windows 进程识别、采样开销和子进程生命周期 |
| [@bryan-cmf/dsh-infra-observability](https://github.com/Bryan-cmf/dsh-infra-observability) | 工具／Skill 成功率和实时执行轨迹 | 验证 projection 兼容性、事件含义及保留策略 |
| [@loongsuite/dsh-plugin](https://github.com/loongsuite/dsh-plugin) | 经 OTLP 输出的 turn／step／LLM／tool 链路与指标 | 需要内网采集器和监控面板，显式关闭内容采集并审查出口 |

Context 作为独立新增 Bundle 交付，用法与限制见[桌面运维手册](user/nova-desktop-operations.zh.md)。System Monitor 和两个导出器仍是候选，没有安装。OTLP 链路需要单独的企业部署，社区用量统计、会话归档和 Git 图谱保持独立。不要默认启用重叠导出器或公网采集地址，也不要把安装当成兼容性证明。

Nova 的[部署默认配置](../apps/desktop-host/nova.enterprise.patch.yml) 关闭表中五个面向公网的模块。加上上游默认关闭的三个模块，十九个模块中共有八个关闭。关闭模块仍包含在依赖闭包中，不是从仓库依赖里删除。

经过审查的依赖补丁移除了十二个客户端制品的自动公网使用心跳；聚合状态获取失败时，子模块界面保持关闭。[运行时补丁策略](../apps/desktop/scripts/runtime-patch-policy.ts) 在打包中应用相同补丁并校验 lockfile 哈希。这是有限修改，不是通用出站防火墙；官方账号、统计、更新服务、远端素材和手动外链仍须审查。

带入内网应携带实体化桌面运行时、固定 npm 依赖闭包、primary-runtime 资源、批准的素材、许可证及声明，不能依赖用户首次启动从公网下载包。Nova 私有插件已有显式桌面打包步骤和必需文件检查；断网安装与签名包尚未验收。

## Nova 功能边界

[Nova 企业插件](../apps/nova-enterprise/README.zh.md) 将桌面连接到部署管理的内网来源。安装、配置、角色组合、发布和验收边界由该包参考文档负责，社区清单不重复这些约定。

私有 npm 包必须按精确包名、版本、声明的 bin 和完整性摘要安装；GitLab 资源需要不可变提交／归档及校验摘要。Hub 令牌、来源下载令牌和 MCP 服务账号是三类独立凭据。现有 Claude Plugin 清单不自动等于 Cordis 插件。剩余执行适配器必须复用官方 Skill、MCP、Plugin、Preset 和权限扩展点。

## 验证状态

现有桌面预览已通过真实官方 Host 和 Client 挂载 Nova AI Hub 与社区聚合层。Nova HTTP、表单、凭据隔离、角色准入及 Client 制品测试使用本地模拟服务；包选择和编排测试验证交付规则，但不生成安装器。这里的任何陈述都不代表所有社区模块、真实私有源下载或断网启动已完成端到端验收。
