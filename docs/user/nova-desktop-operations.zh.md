# Nova 桌面运维与环境切换

[English](nova-desktop-operations.md) | 中文

## 概述

查看上下文用量、接收后台回合通知、导出本地诊断元数据，并切换隔离的桌面环境。会话恢复使用官方持久化 checkpoint，不会自动重放工具副作用或回滚项目文件。

## 目录

- [上下文洞察](#context-insights)
- [恢复与健康检测](#recovery-and-health)
- [通知与诊断](#notifications-and-diagnostics)
- [桌面环境](#desktop-environments)
- [代理配置](#proxy-configuration)
- [内网验证](#intranet-verification)
- [开发备注](#dev-note)

## 上下文洞察

<a id="context-insights"></a>

`dsh-context@0.69.1` 随桌面 Host 内置。打开侧栏的**上下文洞察**、聊天里的 **Context / Fleet**，或输入 `/context`。偏好设置可调位置、图表及可选提示词前后缀，两项提示词默认均为空。图表使用本地会话投影和随包价格目录；公网标价估算不是公司内部计费。

Nova 审查后的补丁使插件余额接口直接返回不可用，不解析凭据、不发起余额请求；这不禁用官方账号、埋点或更新流量。请结合内网模型部署分别验收其他服务。

已有 Nova 组合只补入一次 Context Bundle，不替换插件或 patch，之后主动移除会被尊重。官方纯净恢复组合与自定义组合不变。版本与补丁摘要纳入锁文件和桌面运行时，用户启动时不从公网 npm 安装。请保留 Apache-2.0 许可证及随包声明。

## 恢复与健康检测

<a id="recovery-and-health"></a>

官方请求／工具 checkpoint 在模型请求或顶层工具派发前持久化已记录的输入。崩溃后打开原聊天，明确发起继续。中断的远程操作可能已经执行，应先核对 Jira、GitLab 等目标系统，再重试。恢复不会撤销外部写入或还原项目文件。

Host 就绪后，每 30 秒进行一次不重叠的健康探测；单次 15 秒超时，连续三次失败进入原生恢复并停止受影响的 Host。重启由用户明确选择，不回放任务。IPC 事件循环可响应不代表模型、MCP 或某个工具健康。

部署变量 `NOVA_DESKTOP_HEALTH_INTERVAL_MS`、`NOVA_DESKTOP_HEALTH_TIMEOUT_MS`、`NOVA_DESKTOP_HEALTH_MISS_LIMIT` 可调整这些值，`NOVA_DESKTOP_HEALTH_ENABLED=false` 关闭监测。数值必须是最大 3600000 的正整数，非法配置会停止启动。

## 通知与诊断

<a id="notifications-and-diagnostics"></a>

桌面在后台时，顶层会话的实时回合结束产生静音原生通知。完成与停止／错误／阻塞使用不同通用文案，不含提示词、回复、工具输出或会话标题。子 agent（智能体）及历史恢复的结束事件不通知。点击仅返回桌面，不重试工作。`NOVA_DESKTOP_TURN_NOTIFICATIONS=false` 可关闭，Windows 也可能屏蔽通知。

Windows 下右键托盘，选择**导出诊断 ZIP…**，应用菜单也提供同一入口。请选择新文件，已有文件不会覆盖。ZIP 包含版本元数据、Host／更新状态、看门狗参数、去除来源信息的插件坐标及日志数量／大小；不含原始日志、聊天、环境变量值、URL、凭据和源码，导出不上传。定位具体异常时，仍可能需要管理员审查、单独脱敏的 crash report。

## 桌面环境

<a id="desktop-environments"></a>

Windows 下打开托盘的**环境 / Profile → 添加环境…**，选择空间充足盘上的非根目录空文件夹。Nova 注册独立的 `harness-home` 与 `electron-user-data` 子目录。原环境仍是默认环境，不复制旧凭据、会话或插件。

在同一子菜单选择已注册环境。Nova 锁定新请求准入、检查活跃工作、中断前询问、等待 Host 干净停止、记住所选环境并重启。取消则原环境继续使用，停止失败则拒绝切换。新环境需要自己的模型／账号配置。角色用于聊天，不是桌面环境。

清单始终位于原始 Electron userData 的 `desktop/profiles.json`。数据目录必须是互不重叠的绝对路径，不能指向磁盘根目录，比较前解析目录别名。Windows 有 Profile 托盘入口，macOS／Linux 没有。随包运行时代码只读共享，可写 Profile、cookie 和数据隔离；部署变量及明确共享的 agent 技能目录仍可能共享，需要部署侧另行隔离。

## 代理配置

<a id="proxy-configuration"></a>

浏览器使用 Electron／Chromium 网络栈；官方 Node 启动器另行从分层环境解析 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY`、`NO_PROXY` 并安装共享 HTTP dispatcher。本机回环直连；内网域名后缀写入 `NO_PROXY`，该匹配器不支持 IP CIDR。

Windows 系统代理／PAC 不会自动转换为 Host 环境变量，浏览器代理不等于完整 Agent／MCP 系统代理支持。纯内网部署应清除不需要的代理变量，或配置经过批准的内网代理及绕过名单。使用独立网络栈的 MCP 子进程和工具需要自己的配置。不要关闭 TLS 校验来解决公司证书问题。

## 内网验证

<a id="intranet-verification"></a>

验证真实内网模型回合的 Context 图表、Windows 通知策略、挂起 Host 后恢复且不重复外部写入、切换取消与干净停止、ZIP 隐私，以及模型／Hub／MCP 地址的代理与直连路由。本地构建和测试不能代替企业网络及策略验收。

锁文件改变后，先更新便携 store 与原始 npm tarball 清单，再更新转移压缩包。按[离线开发手册](../cookbook/nova-offline-development.zh.md)操作，不复制正在使用的账号目录。

## 开发备注

<a id="dev-note"></a>

文件回滚 checkpoint 与 Windows PAC 到 Host 的同步是独立能力，不由本页的恢复或环境功能提供。
