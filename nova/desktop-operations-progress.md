# Nova 桌面运维能力续作检查点

这是本次开发的临时检查点，不替代操作手册。实际桌面仓库是 `E:/ai/super-harness`，保留全部未提交改动，不自动提交、推送或上传私有源。

## 当前任务

- 用户已要求生成 Windows 安装包；独立打包工作目录为 `D:/nova-package/workspace`，不在 C/E 盘生成大型产物。
- 内置 `dsh-context`，锁定已审查版本，确认官方当前 API 兼容、无运行时公网依赖，并验证实际加载。
- 用户已说明恢复 checkpoint、健康看门狗、系统代理、回合完成通知、诊断 ZIP、多 Profile 托盘切换无需继续检查；本轮到此聚焦 `dsh-context`。
- 保留本工作区原有未提交修改，不提交、推送或上传私有源。

## 已确认

- 当前桌面基于官方 `0.2.1-alpha.2`，社区聚合锁定 `0.4.5`。
- 已内置 `dsh-context@0.69.1` 并补丁禁用余额请求；真实桌面已出现上下文洞察入口，余额接口返回 200 且 value=null。官方账号的其他公网请求不在该补丁范围内。
- 已增加 Host IPC 健康看门狗（默认 30 秒探测、15 秒超时、连续三次失败），后台回合完成／停止通知，允许字段清单的诊断 ZIP；不自动回放工具。
- 已增加 Windows 托盘多 Profile 注册和切换；独立 Harness Home、Electron userData，锁定准入、复用确认、要求干净停止再重启；原环境账号不复制。
- 官方会话持久化和恢复已经存在；不能把它当成文件回滚 checkpoint。
- 官方会话持久化、HTTP 代理环境变量和桌面运维能力已在此前的会话检查中确认；没有修改 Agent Loop。
- 最终 11 个定向测试文件共 214 项通过；其中主进程 127 项包含托盘切换取消、准入锁及等待停止后重启。受影响 Host 类型检查、打包和实现文件的定向 lint 通过。
- 最新真实桌面已重新启动，协议代数为 5；Context 入口和余额 200/value=null 再次验证。运行会话为 exec session 3828，启动时的桌面主进程 PID 26828（后续操作前重新查询验证）。
- `test:docs` 全部 21 项通过；四份双语配对校验及 Markdown 换行校验通过。全量 43 gate `doc-sync` 最终为 41 passed、2 failed、0 skipped（761.99 秒）：`documentation build` 运行 111.92 秒后失败，esbuild service 在构建期间因内存压力退出；`CLI help reference` 在 39.18 秒后超时退出。其余 gate（包括耗时 493.60 秒的 repository references）通过。未重跑全量构建，避免加重当前机器内存／磁盘压力。
- 新源码副本 `D:/harness-transfer/source-snapshot-2f270294-1730-4957-aed3-181c9c9580ce` 已使用固定 Node/pnpm 对全部 355 个 workspace 完成 frozen/offline 安装，未复制 node_modules，npm downloaded=0；本机验证目录不带入内网。
- 已导出并验证 1751 个原始 npm tarball；三份新的 `*-20261012-operations.zip/7z` 已生成，7-Zip CRC 校验通过。旧版归档保留，不用于本次带入。
- 已按用户收窄范围暂停自动续作，automation id `nova`。

## 尚未完成

- dsh-context 已内置并完成实际桌面加载验证；已生成未签名 Windows 安装器，内网实际安装验收和正式签名发布仍待目标环境验证。
- 用户授权收尾内网交付后，已补齐打包对 HTTP npm 源的显式部署配置：`DSH_DESKTOP_NPM_ALLOW_HTTP=true`；不接受带凭据、路径、查询或片段的源 URL，父进程中的许可不能代替部署文件。52 项相关测试通过。
- Windows Builder 材料已落 D 盘：NSIS、资源插件、7-Zip、Windows 资源编辑工具。不可用网络代理下能从缓存解析并执行 NSIS／rcedit；不把它当成完整离线安装器验收。下载工具附带的 macOS 符号链接解压警告不影响已验证的 Windows 工具，此材料仅用于 Windows x64。
- 原 `doc-sync` 的 CLI help reference 已单独重跑通过（7 页均为当前结果）。文档站构建仍受本机资源影响未通过；完整 `doc-sync` 没有重新运行，不能将单项成功写成全量成功。
- 新交接使用 `nova-desktop-source-20261012-handoff.zip`，加上原 `*-operations` 开发／npm 材料与新增 Builder 材料。当前依赖未变化，开发 store 与 npm tarball 包不用重建；清单和哈希见 `D:/harness-transfer/README-内网导入.md` 与 `transfer-sha256.json`。
- 内网模型、Hub、真实 MCP、私有源导入、更新源和员工安装验收依赖内网环境；源码构建机仍需 Git、MSVC C++ Build Tools 与 Windows SDK，单纯使用桌面的员工电脑不需要这些开发工具。Python Office 材料不包含所有业务 MCP 的浏览器、OCR、索引及转换器。

## 安全约束

- 不改 Agent Loop，不在恢复时重放有副作用的工具调用。
- 诊断材料不包含账号、密钥、原始会话、源代码及未经脱敏日志。
- 不提交、推送或上传私有源；保留当前工作区未提交改动。
- Profile 切换不合并凭据，不绕过活跃任务退出确认。
- C/E 盘空间紧张，大型下载、缓存、转移材料落 D 盘。禁止遍历 `.offline/pnpm-store/v10/projects` 的循环 Junction。
- 之前启动时附带 Hub 环境变量的命令被工具策略拒绝，不尝试换形式绕过；普通桌面启动成功，但 Hub 仍需用户按文档部署配置。

## Windows 安装包准备检查点

- 当前源码在 D 盘全新副本完成 355 个 workspace 的冻结锁离线安装（下载 0），完整 `build:official` 已通过；原 E 盘仓库未提交、未推送。D 盘副本的本地 Git 快照仅用于构建版本记录。
- 新增文件拥有的 `DSH_DESKTOP_OFFLINE_TEST=true`：仅未签名 Windows 测试包可省略强更策略，Builder 不配置更新发布；签名模式拒绝。相关 4 个测试文件 66 项通过，定向 lint 通过。
- 真实打包修正了 pnpm 10 不支持的 `--trust-lockfile` 参数；生产安装保留 `--frozen-lockfile`，当前依赖锁未改变。
- `HARNESS_OFFLINE_BUILD=1` 时 Electron 从 `.offline/assets/electron/dist` 准备，校验备份包版本、实际 Electron 版本、平台和架构；不匹配或缺失即失败，不回退公网。实际离线准备、Office 运行时和文档 round trip 已通过。生产 npm 解析仍需可访问的 registry。
- 332 个公开 dsh 制品、私有 Host、Nova、vendor 和 native entry 已打包并生成生产闭包；`prepare:dsh` 完成物化、文件哈希、原生库／PTY／grep／glob、CLI 离线插件安装卸载、真实 Host 启动与 Office 转 PDF 检查。生产树中 `dsh-context=0.69.1`、Nova `0.2.1-alpha.2` 及余额禁用补丁已确认。
- 完整桌面双语文档配对及 `git diff --check` 通过；`test:docs` 本次 21 passed、0 failed、0 skipped。最后一次补充的离线 Electron 说明另行通过配对校验。未重新运行全量 `doc-sync`，不声称文档站构建已通过。
- 实际运行 `D:/nova-package/build-installer.ps1` 的工具链检查仍失败：Visual Studio C++ build tools 未安装。微软签名有效的引导程序已下载到 `D:/nova-toolchains/vs_BuildTools.exe`；管理员安装请求被用户取消，没有再次尝试。用户明确表示将手动安装 C++ x64/x86 工具与 Windows SDK，完成后回复。
- 最终 EXE 尚未生成。编译工具完成后运行 `D:/nova-package/build-installer.ps1`：重新检查工具链 → Builder 原生安装器钩子 → 验证组装后的 ASAR／Office／Host；保留日志在 `D:/nova-package/logs`，成功输出目录为 `workspace/apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts`。不重做已通过的源码构建和生产载荷准备，不跳过工具链或运行时检查。
- Hub 地址在运行时通过 `NOVA_HUB_API_URL` 注入，并须与部署 YAML 的 `hub.url` 一致；模板为 `nova/deployment-env.example.ps1`。IP 改变无需重新编译，完全退出含托盘后从配置环境启动。普通用户不需要填写 API 地址。
- 用户随后明确授权由代理安装编译工具并生成安装包；已重新验证微软引导程序签名并发起管理员安装。安装／共享组件／缓存／临时目录均指定 D 盘，禁止自动重启。本次系统 UAC 最终返回“操作已被用户取消”，引导程序未启动，session `33066` 已结束；无法取得安装退出码，不能视为工具链安装成功，也没有生成 EXE。不得重复请求提权，需用户处理系统确认后才能继续。

## Windows 安装包完成检查点（2026-10-13）

- 用户手动安装后，已确认 Visual Studio 2022 Build Tools 17.14.41 位于 `D:/zhuomian/vs`，包含 C++ x64/x86 编译工具；Windows SDK 10.0.26100.0 可用。原生安装器 helper DLL 已实际编译，前述工具链阻塞已解除。
- `D:/nova-package/build-installer.ps1` 完整结束，退出码 0；打包预检、electron-builder 与组装后运行时 smoke 均通过。没有提交、推送、上传或启用更新发布。
- 交付文件为 `D:/nova-package/delivery/Nova-Desktop-0.2.1-alpha.2-win-x64-unsigned.exe`，304,585,896 字节，SHA256 为 `96766FEB1D621E9E0FC1E035FB49F42B5D00C2355241921F8459F3E181432D69`；签名状态 `NotSigned`。说明及校验文件位于同目录。内部 EXE 仍为 `DeepSeek Harness.exe`，运行界面品牌为 Nova。
- Windows Fuse 写入遇到同路径 EXE 的临时 open/UNKNOWN 错误。新增受限重试：只处理 Windows 同路径 open 的 UNKNOWN/EBUSY，最多四次，重试前验证文件身份、大小与 SHA256；文件变化或其他错误立即失败，不取消任何 Fuse 配置。实际 Builder 重试一次后成功；未确认临时占用的具体进程，不归因于某个安全软件。
- Builder 的 `icons@1.2.3` 是 CommonJS 工具。缓存放在 ESM 工作区下会继承模块类型；已在独立缓存根目录加入 `package.json` 的 `type: commonjs`，不改第三方工具字节。更新的 Builder 材料携带该配置与图标工具，保留其目录结构。
- 本次新增重试和原有安装器测试共 17 项通过；Host 类型检查、受影响脚本定向 oxlint、桌面 README 双语配对校验及 Markdown 换行检查通过。未重跑全量构建和完整 doc-sync。
- 最终生产应用验证通过：Node 24.21.0、koffi/sharp/html、PTY、pnpm、grep/glob、CLI 离线插件安装与卸载、真实 Host 启动，以及 DOCX/XLSX/PPTX 转 PDF。生产载荷包含 Nova 与 `dsh-context@0.69.1` 及其内网补丁。
- 尚未实际安装此安装器或验证真实内网模型／Hub／MCP。正式员工发放需内网干净电脑验收，并根据公司政策完成代码签名；未签名包不代表已完成正式签名发布。
- 源码迁移使用 `nova-desktop-source-20261013-installer.zip`，Builder 材料使用 `nova-desktop-builder-20261013-installer.7z`；发送目录中的简短文件名更新为本次版本。依赖锁未变化，开发 store 与 npm 原始包不重建，旧归档保留。
