<#
.SYNOPSIS
Harness 桌面开发统一入口；显式使用 pnpm 10.34.6，缓存落在当前仓库所在盘。
.DESCRIPTION
install/fetch 准备依赖；build 构建；start 复用已准备运行时；engine 合入 Hub 安装引擎。
-Offline 允许安装、构建、启动、检查与材料复制，禁止下载缺失的包管理器和 primary-runtime 资源。
源目录、用户配置和运行中的桌面均不会被此脚本删除或自动终止。
.PARAMETER Action
要执行的开发步骤；package-unsigned 仅用于内网测试，不替代签名发布验收。
.PARAMETER Offline
使用已携带的 store 和运行时；缺失依赖报错，不回退在线安装。
.PARAMETER HubRoot
已构建的 nova-harness 源码目录；只在重新生成 engine 时需要。
#>
[CmdletBinding()]
param(
  [ValidateSet('check', 'install', 'fetch', 'build', 'start', 'engine', 'prepare-materials', 'restore-electron', 'package-check', 'package-unsigned')]
  [string]$Action = 'check',
  [switch]$Offline,
  [string]$HubRoot = ''
)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskManifest = Get-Content -LiteralPath (Join-Path $taskRoot 'package.json') -Raw | ConvertFrom-Json
$taskNode = Join-Path $taskRoot '.offline/toolchain/node/bin/node.exe'
if (!(Test-Path -LiteralPath $taskNode)) { $taskNode = (Get-Command node -ErrorAction Stop).Source }
$taskPnpm = Join-Path $taskRoot '.offline/toolchain/pnpm/node_modules/pnpm/bin/pnpm.cjs'
if (!(Test-Path -LiteralPath $taskPnpm)) { $taskPnpm = Join-Path $taskRoot 'node_modules/pnpm/bin/pnpm.cjs' }
if (!(Test-Path -LiteralPath $taskPnpm)) { throw '缺少 pnpm 10.34.6。请带入 .offline/toolchain，不能在内网运行 npx/corepack 下载。' }
$taskVersion = (& $taskNode $taskPnpm --version).Trim()
if ($LASTEXITCODE -ne 0 -or ('pnpm@' + $taskVersion) -ne $taskManifest.packageManager) {
  throw "pnpm 版本不一致：实际 $taskVersion，要求 $($taskManifest.packageManager)。"
}
if ($Offline -and $Action -notin @('check', 'install', 'build', 'start', 'prepare-materials', 'restore-electron')) {
  throw '此操作涉及外部制品或打包工具。请在外网预制，或配置内网镜像后执行，不将其标为纯离线步骤。'
}
$taskScratch = Join-Path $taskRoot 'apps/desktop/.desktop-build/scratch'
foreach ($taskDirectory in @('temp', 'npm-cache', 'electron-cache', 'builder-cache', 'xdg-cache')) {
  New-Item -ItemType Directory -Force -Path (Join-Path $taskScratch $taskDirectory) | Out-Null
}
$env:TEMP = Join-Path $taskScratch 'temp'
$env:TMP = $env:TEMP
$env:TMPDIR = $env:TEMP
$env:npm_config_cache = Join-Path $taskScratch 'npm-cache'
$env:ELECTRON_CACHE = Join-Path $taskScratch 'electron-cache'
$env:electron_config_cache = $env:ELECTRON_CACHE
$env:ELECTRON_BUILDER_CACHE = Join-Path $taskScratch 'builder-cache'
$env:XDG_CACHE_HOME = Join-Path $taskScratch 'xdg-cache'
$env:COREPACK_ENABLE_NETWORK = '0'
$env:npm_config_manage_package_manager_versions = 'false'
$env:npm_config_update_notifier = 'false'
$env:HARNESS_OFFLINE_BUILD = $(if ($Offline) { '1' } else { '0' })
$env:PATH = ([IO.Path]::GetDirectoryName($taskNode)) + ';' + (Join-Path $taskRoot 'node_modules/.bin') + ';' + $env:PATH
$taskStore = Join-Path $taskRoot '.offline/pnpm-store'

# 每个命令失败立即停止；不把失败步骤之后的结果当作成功。
function Invoke-HarnessPnpm([string[]]$Arguments) {
  & $taskNode $taskPnpm @Arguments
  if ($LASTEXITCODE -ne 0) { throw "pnpm 步骤失败：$($Arguments -join ' ')（$LASTEXITCODE）" }
}
Push-Location $taskRoot
try {
  switch ($Action) {
    'check' {
      Write-Output "仓库：$taskRoot"
      Write-Output "pnpm：$taskVersion"
      & $taskNode --version
      Write-Output "依赖 Store：$taskStore"
      Write-Output '检查不代替业务 MCP、角色团队或干净机器离线验收。'
    }
    'install' {
      $taskArguments = @('install', '--frozen-lockfile', '--store-dir', $taskStore)
      if ($Offline) { $taskArguments += '--offline' }
      Invoke-HarnessPnpm $taskArguments
    }
    'fetch' { Invoke-HarnessPnpm @('fetch', '--store-dir', $taskStore) }
    'build' { Invoke-HarnessPnpm @('run', 'build') }
    'start' {
      if ($Offline) {
        $taskElectron = Join-Path $taskRoot 'apps/desktop/node_modules/electron'
        foreach ($taskRequired in @('dist/electron.exe', 'dist/version', 'path.txt', 'package.json')) {
          if (!(Test-Path -LiteralPath (Join-Path $taskElectron $taskRequired))) {
            throw '开发 Electron 不完整，先执行 restore-electron -Offline。不能让 Electron 入口自动联网下载。'
          }
        }
        $taskElectronManifest = Get-Content -LiteralPath (Join-Path $taskElectron 'package.json') -Raw | ConvertFrom-Json
        $taskElectronVersion = (Get-Content -LiteralPath (Join-Path $taskElectron 'dist/version') -Raw).Trim().TrimStart('v')
        $taskElectronEntry = (Get-Content -LiteralPath (Join-Path $taskElectron 'path.txt') -Raw).Trim()
        if ($taskElectronVersion -ne $taskElectronManifest.version -or $taskElectronEntry -ne 'electron.exe') {
          throw '开发 Electron 版本或入口不匹配，先执行 restore-electron -Offline。'
        }
      }
      Invoke-HarnessPnpm @('run', 'start:desktop', '--reuse-runtime')
    }
    'engine' {
      if (!$HubRoot) { throw 'engine 需要 -HubRoot，且 Hub 的 core/installer/contracts 已构建。' }
      & $taskNode 'apps/nova-enterprise/scripts/bundle-engine.mjs' '--from' ([IO.Path]::GetFullPath($HubRoot))
      if ($LASTEXITCODE -ne 0) { throw '共享安装引擎构建失败。' }
    }
    'prepare-materials' {
      # 只复制已验证的 Windows x64 制品，缺失时失败，不在此步骤下载。
      $taskRuntime = Join-Path $taskRoot 'apps/desktop/.desktop-build/targets/win-x64/runtime/primary-runtime'
      $taskRuntimeManifest = Get-Content -LiteralPath (Join-Path $taskRuntime 'runtime.json') -Raw | ConvertFrom-Json
      if ($taskRuntimeManifest.platform -ne 'win32' -or $taskRuntimeManifest.arch -ne 'x64' -or $taskRuntimeManifest.pnpm -ne $taskVersion) {
        throw '请先准备匹配 pnpm 10 的 win-x64 primary-runtime。'
      }
      $taskNodeSource = Join-Path $taskRuntime 'dependencies/node'
      $taskNodeDestination = Join-Path $taskRoot '.offline/toolchain/node'
      if (Test-Path -LiteralPath (Join-Path $taskNodeDestination 'bin/node.exe')) {
        $taskExistingVersion = (& (Join-Path $taskNodeDestination 'bin/node.exe') -p 'process.versions.node').Trim()
        if ($LASTEXITCODE -ne 0 -or $taskExistingVersion -ne $taskRuntimeManifest.node) { throw '已有便携 Node 版本不匹配，请先另存该目录。' }
      }
      New-Item -ItemType Directory -Force -Path $taskNodeDestination | Out-Null
      Get-ChildItem -LiteralPath $taskNodeSource -Force | Copy-Item -Destination $taskNodeDestination -Recurse -Force
      $taskElectronRoot = Join-Path $taskRoot 'apps/desktop/node_modules/electron'
      if (!(Test-Path -LiteralPath (Join-Path $taskElectronRoot 'dist/electron.exe'))) { throw '开发 Electron 缺失，请先在外网补齐可执行分发。' }
      $taskElectronDestination = Join-Path $taskRoot '.offline/assets/electron'
      New-Item -ItemType Directory -Force -Path $taskElectronDestination | Out-Null
      Copy-Item -LiteralPath (Join-Path $taskElectronRoot 'dist') -Destination $taskElectronDestination -Recurse -Force
      Copy-Item -LiteralPath (Join-Path $taskElectronRoot 'path.txt') -Destination $taskElectronDestination -Force
      Copy-Item -LiteralPath (Join-Path $taskElectronRoot 'package.json') -Destination (Join-Path $taskElectronDestination 'package.json') -Force
      Write-Output '便携 Node 与开发 Electron 已复制到 .offline；仍需携带 runtime、引擎和 Hub／业务能力材料。'
    }
    'restore-electron' {
      # pnpm store 不负责还原下载型二进制；按包版本匹配恢复，不执行安装脚本。
      $taskElectronSource = Join-Path $taskRoot '.offline/assets/electron'
      $taskElectronTarget = Join-Path $taskRoot 'apps/desktop/node_modules/electron'
      $taskSavedElectron = Get-Content -LiteralPath (Join-Path $taskElectronSource 'package.json') -Raw | ConvertFrom-Json
      $taskInstalledElectron = Get-Content -LiteralPath (Join-Path $taskElectronTarget 'package.json') -Raw | ConvertFrom-Json
      if ($taskSavedElectron.version -ne $taskInstalledElectron.version) { throw 'Electron 版本不同，请带入当前 lockfile 对应的开发分发。' }
      if (!(Test-Path -LiteralPath (Join-Path $taskElectronSource 'dist/electron.exe'))) { throw 'Electron 备份分发不完整。' }
      Copy-Item -LiteralPath (Join-Path $taskElectronSource 'dist') -Destination $taskElectronTarget -Recurse -Force
      Copy-Item -LiteralPath (Join-Path $taskElectronSource 'path.txt') -Destination $taskElectronTarget -Force
      Write-Output "已恢复 Electron $($taskSavedElectron.version)；未下载或修改依赖版本。"
    }
    'package-check' { Invoke-HarnessPnpm @('--filter', '@deepseek-ai/dsh-desktop', 'run', 'check:package', 'win-x64', '--unsigned') }
    'package-unsigned' { Invoke-HarnessPnpm @('run', 'package:desktop:win:x64:unsigned') }
  }
} finally { Pop-Location }
