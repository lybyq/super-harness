---
description: "Windows x64 Harness 离线开发与交付：准备 pnpm 10.34.6、store、Node 与 Electron，转移源码和材料，本地启动 Hub／Desktop 并打包员工安装器。"
---

# Harness 内网离线开发与桌面交付

[English](nova-offline-development.md) | 中文

## 要达到什么结果

这份教程按 Windows x64 编写：外网把依赖和运行时准备好，带到内网后不访问公网完成开发依赖安装、构建和桌面启动，再在有内网制品镜像的发布机器制作安装包。外网和内网都固定 pnpm 10.34.6。内网机器的实测由部署人员完成，不能用本文代替验收回执。

## 先把几件事讲明白

源码是你要改的代码；`node_modules` 是当前机器已经装好的链接与文件；pnpm store 是重新安装依赖所需的本地材料仓库；Electron、Python、浏览器和打包工具缓存是另外的运行材料。只带源码不够，只带 store 也不够。`--offline` 约束 pnpm 下载，不会自动约束任意安装脚本或第三方打包工具。

推荐“源码＋同版本 store＋工具链＋运行材料”，在内网重建 `node_modules`。不要把直接复制 `node_modules` 当作唯一方案：pnpm 链接、绝对路径、Windows 原生二进制和不同 Node 版本都可能让它失效。已经安装的完整 Desktop 安装包则是给普通员工的另一种交付，不需要他们安装开发依赖。

外网和内网保持相同操作系统、架构及开发 Node 版本。源码支持 Node 22.19+；Windows 安装包发布工具链以 Node 24 为准。原生包、Playwright 浏览器、Python wheel 不能用 macOS/Linux 的材料代替 Windows x64 材料。

## 一、外网准备

以下命令在 `E:/ai/super-harness` 的 PowerShell 执行。至少为依赖、运行时和归档预留额外磁盘空间；目录可以整体移到其他非系统盘。关闭旧桌面时用托盘菜单“退出”，只点窗口关闭可能仍保留后台进程并锁住 Electron 文件。

首次没有 pnpm 10 时，在外网安装便携副本，不修改内网全局环境：

```powershell
$env:npm_config_cache = 'E:/ai/tools/npm-cache'
npm.cmd install --prefix .offline/toolchain/pnpm --no-save --ignore-scripts --no-audit --no-fund pnpm@10.34.6
./nova/desktop.ps1 -Action check
./nova/desktop.ps1 -Action install
./nova/desktop.ps1 -Action fetch
./nova/desktop.ps1 -Action build
```

`install` 重建依赖，`fetch` 补齐 lockfile 对应的 store，`build` 生成 Host、Client 和 Web 产物。所有步骤都使用固定版本，不调用 npx/Corepack 下载另一版 pnpm。版本迁移后锁文件必须在外网更新并提交；内网继续使用 `--frozen-lockfile`，不要靠内网重新解析版本。命令失败先处理，不继续打包不完整材料。

准备一次桌面 primary-runtime，使其中也包含 pnpm 10，而不是复用旧 pnpm 11 运行时：

```powershell
node .offline/toolchain/pnpm/node_modules/pnpm/bin/pnpm.cjs --dir apps/desktop run prepare:primary-runtime
./nova/desktop.ps1 -Action prepare-materials
./nova/desktop.ps1 -Action start
```

第一次准备会使用锁定的下载资源；目标目录是 `apps/desktop/.desktop-build/targets/win-x64/runtime`。启动入口复用它，并拒绝 pnpm 版本不匹配的旧运行时。`prepare-materials` 把已准备的 Node（含许可证）与开发 Electron 复制到 `.offline`，不下载缺失材料。Electron executable 缺失时先在外网按当前 Electron 包提供的安装步骤补齐，不能等进入内网再下载。

共享安装器改变时，先在 `nova-harness` 构建 `core/installer/contracts`，再执行：

```powershell
./nova/desktop.ps1 -Action engine -HubRoot E:/ai/nova-harness
```

仅修改桌面样式或角色界面，不需要每次重新生成引擎。必须携带 `apps/nova-enterprise/lib/engine.js` 与 `lib/npm`；源码归档不包含被忽略的 `lib`，漏带它们会使安装引擎不可用。

## 二、需要带入哪些材料

建议按下表核对后再压缩，不能只勾选“有一个 node_modules”。

| 材料 | 位置／要求 | 为什么需要 |
|---|---|---|
| 当前源码 | 已提交的两个仓库，lockfile、workspace、patches 均保留 | 内网开发与三方合并 |
| pnpm 10 工具 | `.offline/toolchain/pnpm/node_modules/pnpm` | 内网不下载包管理器 |
| 开发 Node 与许可 | `.offline/toolchain/node/bin/node.exe` 与许可证；可从已准备的 Node 分发目录复制 | 相同版本可重复构建，不依赖 C 盘 Node |
| Desktop store | `.offline/pnpm-store/v10/files` 与 `v10/index`，排除机器级 `v10/projects` 链接 | 冻结锁离线安装 |
| Hub store | 在 Hub 仓库用相同 pnpm 单独 fetch 的 store | Desktop 的 store 不保证包含 Hub 的全部依赖 |
| primary-runtime 与 Office 资源 | `apps/desktop/.desktop-build/targets/win-x64/runtime` | 内置 Node、pnpm、Python、Office skill |
| primary-runtime 下载缓存 | `apps/desktop/.desktop-build/downloads` | 离线重新准备运行时 |
| Electron 下载缓存／可执行分发 | `.desktop-build/scratch/electron-cache`；`.offline/assets/electron` | `node_modules` 重建后恢复已备份的可执行文件 |
| 打包工具缓存 | `.desktop-build/scratch/builder-cache`，以及发布机实际使用的缓存 | NSIS、签名辅助和 Electron Builder 不都来自 npm |
| 企业安装引擎 | `apps/nova-enterprise/lib`，至少 `engine.js`、`npm` 及构建记录 | 含 Hub 共享库与 npm CLI |
| 业务能力与外部资产 | 内网 npm 完整依赖镜像、GitLab 制品、Playwright 浏览器、OCR／数据库驱动等 | 开发仓库 store 不是所有业务 MCP 的离线市场 |
| Hub 运行材料 | PostgreSQL、Prisma 引擎；用 Docker 时带已构建镜像与许可 | 内网 Hub 服务也必须能运行 |

推荐开发机器使用随包 Node 24，目录结构沿用 `dependencies/node/bin/node.exe`。`desktop.ps1` 优先使用 `.offline/toolchain/node/bin/node.exe`，没有它才使用 PATH 中的 Node。不要手工改 primary-runtime 的版本 JSON 来冒充已经迁移，它必须由准备脚本重新生成。

## 二补充、把依赖发到内网 npm 私有源

pnpm store 不是 npm 仓库：它保存的是解开的内容寻址文件，不是原始发布 tarball。[registry-materials.ts](../../nova/registry-materials.ts) 读取锁文件中每个精确外部包，下载原始制品并核对 SRI 哈希。workspace 包仍通过源码／本地打包交付；新增 MCP 和插件需要自己的依赖闭包。这次仓库导出成功不代表未来 Hub 安装所需包都已齐全。

以下准备命令在外网执行；目录可放到空余较多的盘：

```powershell
$taskNode = './.offline/toolchain/node/bin/node.exe'
& $taskNode --import tsx/esm nova/registry-materials.ts inventory --directory D:/harness-transfer/registry-materials
& $taskNode --import tsx/esm nova/registry-materials.ts download --directory D:/harness-transfer/registry-materials
& $taskNode --import tsx/esm nova/registry-materials.ts verify --directory D:/harness-transfer/registry-materials
```

下载会复用已验证文件，但拒绝现有损坏制品。任一下载缺失或完整性错误都会使命令失败，不把部分目录说成完整。将整个目录与同一份源码／锁一起带入。tarball 保留原始字节和许可，依赖补丁留在源码中并在安装后应用。

内网源负责人配置好 npm 认证与写权限后执行下面的发布命令。示例域名是占位符，要换成已经提供的真实私有源。忽略的部署 npmrc 可写 `//实际域名/:_authToken=${NPM_TOKEN}`，令牌由发布环境提供，不写进源码。HTTP 要显式加 `--allow-http`，但它不加密令牌；生产优先使用公司 HTTPS，不要关闭证书校验。

```powershell
$registry = 'http://npm-registry.example.internal/'
$env:NPM_CONFIG_USERCONFIG = 'E:/harness/deployment/npmrc'
& $taskNode --import tsx/esm nova/registry-materials.ts publish --directory D:/harness-transfer/registry-materials --registry $registry --allow-http
```

发布前完整校验全部材料，禁用生命周期脚本，显式指定目标源；只有已有版本 SRI 一致才跳过，不覆盖同版本。上传或回读失败即停止，检查源后再续跑。必须携带 `apps/nova-enterprise/lib/npm` 中的 npm CLI。这是内网人工验收操作，外网尚未验证向公司源发布。

当前锁中 `xlsx` 0.20.3 在 `packages/client/ui-sidebar-documentpreview/package.json` 使用 SheetJS CDN 直链。只改 registry 不会替换显式 URL。镜像完成后，内网分支必须将该依赖改成私有源精确版本 `0.20.3`，针对私有源生成并审查内网锁，再 fetch 对应 store。保留精确版本与完整性，不换成 npm 上不同的 `latest`。外网开发锁保持不变。已有匹配 store 时，冻结锁的 offline 安装不需要访问 CDN。

## 三、怎么压缩成 7z

归档脚本保留 `.offline` 和 `apps` 路径，只收可移植的 store files/index，检查 CRC 并拒绝覆盖。需要本地 7-Zip；其他位置用 `-SevenZip` 指定。机器级 projects 链接不会带入。Builder 缓存是另行准备的可选发布材料，不包含在这份开发／运行归档中。

压缩前区分工作区源码快照和 `git archive HEAD`：HEAD 不包含未提交改动，包括新锁文件。带入的源码必须使用准备材料时的同一份锁。不要不加区分地压个人 checkout，必须排除秘密、用户 home、带凭据的缓存和签名文件。本机验证副本取自已跟踪及未忽略的工作区文件，不是旧提交。

可以用 7z，但要打包上面的材料，不是随手压整个用户工作目录。先把外网变更提交到自己的分支；源码 zip 不包含未提交文件。Git 完整历史不是构建必需品，需要在内网继续保留历史时另外带 Git bundle，并用内网 checkout 三方合并已有修改，不直接覆盖整仓库。

安装 7-Zip 并创建 `E:/transfer` 后，在仓库根目录准备两份包：

```powershell
git archive --format=zip --output=E:/transfer/super-harness-source.zip HEAD
./nova/archive-materials.ps1 -OutputPath E:/transfer/super-harness-materials.7z
Get-FileHash E:/transfer/super-harness-source.zip -Algorithm SHA256
Get-FileHash E:/transfer/super-harness-materials.7z -Algorithm SHA256
```

上述归档属于部署人员手工操作，实际目录必须先核实存在并完整。先运行 `prepare-materials`，确认 `.offline/assets/electron` 存在；Hub 材料另外打包。在内网按相同相对位置恢复材料。无须压根 `node_modules`；若另带一份作为同机快速恢复备用，仍以离线重装和实测为准。

不要带 `.env`、个人 `.npmrc`、签名证书／PIN、`$DSH_HOME` 用户数据、Electron 用户数据、企业账号或日志中的 Token。仓库自带的公开 `.npmrc` 仅是版本策略，可以随源码。真实部署 YAML、CA 与发布凭据在内网配置。SHA256 用于核对传输，不能代替来源审查或签名。

## 四、内网离线安装与启动

仅全新 ZIP 目录：使用已配置的本机 Git 身份，构建前创建一次本地初始提交，因为构建版本信息会读取真实 Git commit。已有内网仓库保留原历史，通过审查后的源码合并更新，不用这套命令代替三方合并。

```powershell
git init
git add .
git commit -m "Import Nova source snapshot"
```

将源码恢复到例如 `E:/ai/super-harness`，将 `.offline` 和 runtime 等材料恢复到对应位置。已有内网修改先备份并三方合并。源码 zip 没有 `.git`，新开发目录需先 `git init`，或使用已有内网 GitLab checkout；仓库 postinstall 会配置 Git hook，不能把非 Git 目录当完整开发 checkout。

```powershell
./nova/desktop.ps1 -Action check -Offline
./nova/desktop.ps1 -Action install -Offline
./nova/desktop.ps1 -Action restore-electron -Offline
./nova/desktop.ps1 -Action build -Offline
```

离线安装从 `.offline/pnpm-store` 取料，重建本机 `node_modules`。若提示缺少 tarball，回外网按同一 lockfile 补齐并重新带入，不去掉 `--offline` 让它碰运气。若缺少原生文件、浏览器或 Electron executable，要补对应目标平台资产；它们不一定能由 store 自动恢复。`HARNESS_OFFLINE_BUILD=1` 会让缺失的 primary-runtime 下载缓存直接报错，但不是替代网络隔离的总开关。

复制并修改[部署环境示例](../../nova/deployment-env.example.ps1)，设置实际 Hub `/api/v1` 地址、DeploymentProfile、资源目录、CA 与用户 home。在启动 Desktop 的同一终端执行部署环境脚本，然后运行：

```powershell
./nova/desktop.ps1 -Action start -Offline
```

`start` 不重新 build、不重新下载 primary-runtime；它仍会生成本地开发项目。必须先 build。第一次测试用独立 home，已有 Profile 不会自动覆盖为社区／企业层。内网模型在官方模型设置里配置实际 provider／model 与地址；示例变量、目录和角色名不能代替真实模型配置。

Hub 在另一个终端／内网服务器运行。`nova-harness` 当前也固定 pnpm 10.34.6；Node 开发入口是 `pnpm run dev`，API 默认 3200，管理页面 3210。实际环境需要 PostgreSQL、Prisma generate／迁移和 DeploymentProfile；数据库连接只在内网填写。使用现有内网 Docker 部署时，先带镜像再 docker load，按该仓库的外部 PostgreSQL compose 启动，不在断网机器 docker pull。桌面用户不需要自己启动数据库。

### 本机两个仓库联调的示例

下列命令由本机开发者执行，连接已运行的本地 Hub 与 mock 来源，不用于真实内网交付，也不含账号。正式内网改用部署环境示例中的实际 HTTPS 地址与来源配置。工具若阻止启动参数注入，不能把不带这些参数打开的桌面当成“已经连接 Hub”。

```powershell
$env:DSH_HOME = 'E:/home'
$env:DSH_DESKTOP_USER_DATA_DIR = 'E:/electron-user-data'
$env:NOVA_HUB_API_URL = 'http://localhost:3200/api/v1'
$env:NOVA_HUB_ALLOW_HTTP = 'true'
$env:NOVA_DEPLOYMENT_CONFIG = 'E:/ai/nova-harness/manifests/deployments/mock-host.yaml'
$env:HARNESS_DESKTOP_RESOURCE_HOME = 'E:/ai/super-harness/apps/desktop/.desktop-build/preview-nova/resources'
./nova/desktop.ps1 -Action start -Offline
```

先从托盘退出旧桌面，再从这个终端启动；新环境变量不能自动改变已经运行的 Host。业务账号、来源令牌、发布权限和模型另外配置，不放进上面的命令或公开仓库。

## 五、每天开发怎么操作

修改源码 → 跑受影响测试／类型检查 → 构建受影响产物 → 从托盘退出旧桌面 → start。改 Hub API 就重启 Hub；改共享安装库再重打 engine；改某个 MCP 就发新的不可变版本，再从 AI Hub 更新。新增 npm 依赖必须先在外网补 lockfile 和 store，或使用已镜像的内网私有源，不让内网自行漂移版本。

企业插件的增量命令见[包说明](../../apps/nova-enterprise/README.zh.md)。单纯业务插件开发不需要每次全仓库构建；一次依赖迁移或正式打包则需要完整构建。`desktop.ps1` 不会自动停止应用、删除源码或改用户 Profile。

## 六、最终给员工一个安装包

开发材料包不是安装包。安装包由内网 Windows x64 发布机制作，使用 Node 24、PowerShell 7、Git、Python、Visual C++ Build Tools、Windows SDK 和固定 pnpm。发布机还需要内部 npm 镜像或已经验收的完整构建缓存，以及 Electron／Node／Python／NSIS 资产。当前打包器会重建生产依赖锁，不把“根 store 可离线安装”冒充“所有打包阶段可离线运行”。

按[官方 Windows 打包参考](../../apps/desktop/README.zh.md)复制 `apps/desktop/.env.windows.example` 为忽略文件 `.env.windows`，填写企业自己的 `DSH_DESKTOP_APP_ID`、`DSH_DESKTOP_NPM_REGISTRY` 和内部 HTTPS 发布／策略 origin。内网自建匿名策略可用 `production` 部署与内网 `DOWNLOAD_PROD_ORIGIN`、`DSH_DESKTOP_MANDATORY_UPDATE_PROD_ORIGIN`；这个名字不要求使用公网。`test` 模式在官方实现中要求测试认证 origin，不要以为写成 test 就自动免登录。

```powershell
./nova/desktop.ps1 -Action package-check
./nova/desktop.ps1 -Action package-unsigned
```

上面是部署人员验收步骤，不代表已经在目标机打包成功。未签名测试安装器输出在 `apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts`。正式分发使用现有签名 `package:desktop:win:x64` 流程和公司证书，更新文件由内网发布服务提供；不要执行上游公网 COS 上传脚本。没有证书／发布 origin 时，先完成测试安装器与干净机器验收，不假造签名。

在一台没有源码、Node、pnpm 的干净员工电脑上，断开公网但保留内网：安装 → 启动 → 选项目／模型 → 搜索 Hub → 装一个只读 MCP → 配参数 → 应用角色 → 完成调用 → 卸载／重启恢复。再验团队、更新、错误证书与权限拒绝。全部记录到[内网交接清单](../nova-intranet-acceptance.zh.md)，通过后才发给其他员工。

## 开发备注

D 盘全新源码副本未复制 node_modules，从现有 store 通过冻结锁 offline 安装全部 355 个工作区。私服制品导出核对了全部 1750 个外部包原始 tarball（约 3.28 GiB）。移除继承的 Electron Node 模式后，桌面真实 open-in-app 接口返回 200 并启动 VS Code。这些结果不代表公司私服发布、真实模型调用或员工安装器已验收。

2026-10-12 本机已验证 pnpm 10.34.6 的冻结锁离线安装、完整构建、Node 24.21.0／Python 3.12.14 运行时准备、Electron 44.7.0 材料备份恢复与桌面启动。真实回环测试验证了 mock npm MCP、GitLab 嵌套 Skill、原生 Plugin 的配置与生命周期；这些不替代公司真实账号验收。全仓 lint 的已有测试文件仍有类型／风格报错，不能宣称仓库所有门禁全绿。

归档、目标机重装、真实业务调用和安装器签名由内网部署负责人验证。pnpm 行为参考[官方离线安装参数](https://pnpm.io/10.x/cli/install#--offline)与[固定版本设置](https://pnpm.io/10.x/settings#managepackagemanagerversions)。
