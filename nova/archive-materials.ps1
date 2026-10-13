<#
.SYNOPSIS
按内网恢复目录归档开发材料；只携带 store 的 files/index，不遍历机器级 projects 链接。
.PARAMETER OutputPath
新的 7z 文件绝对路径；已有文件拒绝覆盖。
.PARAMETER SevenZip
已经离线安装的 7-Zip 可执行文件，不在脚本内下载工具。
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$OutputPath,
  [string]$SevenZip = 'C:/Program Files/7-Zip/7z.exe'
)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskOutput = [IO.Path]::GetFullPath($OutputPath)
if (Test-Path -LiteralPath $taskOutput) { throw '归档已存在，未覆盖；请指定新的 OutputPath。' }
if (!(Test-Path -LiteralPath $SevenZip -PathType Leaf)) { throw '缺少 7-Zip，请离线安装或提供 SevenZip 参数。' }
$taskInputs = @(
  '.offline/toolchain', '.offline/assets',
  '.offline/pnpm-store/v10/files', '.offline/pnpm-store/v10/index',
  'apps/desktop/.desktop-build/downloads',
  'apps/desktop/.desktop-build/targets/win-x64/runtime',
  'apps/nova-enterprise/lib'
)
foreach ($taskInput in $taskInputs) {
  if (!(Test-Path -LiteralPath (Join-Path $taskRoot $taskInput) -PathType Container)) { throw "缺少材料：$taskInput" }
}
New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($taskOutput)) | Out-Null
$taskStage = Join-Path ([IO.Path]::GetDirectoryName($taskOutput)) ('archive-layout-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskStage | Out-Null
$taskStagePrefix = [IO.Path]::GetFullPath($taskStage) + [IO.Path]::DirectorySeparatorChar
$taskLinks = [Collections.Generic.List[string]]::new()
$taskParents = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
try {
  foreach ($taskInput in $taskInputs) {
    $taskLink = [IO.Path]::GetFullPath((Join-Path $taskStage $taskInput))
    if (!$taskLink.StartsWith($taskStagePrefix, [StringComparison]::OrdinalIgnoreCase)) { throw '材料路径越过本次暂存目录。' }
    $taskParent = [IO.Path]::GetDirectoryName($taskLink)
    while ($taskParent -ne $taskStage) {
      [void]$taskParents.Add($taskParent)
      $taskParent = [IO.Path]::GetDirectoryName($taskParent)
    }
    New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($taskLink)) | Out-Null
    New-Item -ItemType Junction -Path $taskLink -Target (Join-Path $taskRoot $taskInput) | Out-Null
    $taskLinks.Add($taskLink)
  }
  # 对完整顶层目录打包，避免 7z 把多个叶目录扁平化成 files、runtime、lib 等。
  Push-Location $taskStage
  try {
    & $SevenZip a -t7z -mx=0 -bso0 -bsp0 $taskOutput .offline apps
    if ($LASTEXITCODE -ne 0) { throw '归档失败，输出不得用于交付。' }
  } finally { Pop-Location }
  & $SevenZip t -bso0 -bsp0 $taskOutput
  if ($LASTEXITCODE -ne 0) { throw '归档 CRC 校验失败。' }
  Write-Output "开发材料归档及 CRC 校验完成：$taskOutput"
} finally {
  # 只解除本次创建且仍为 junction 的链接；绝不递归删除链接指向的源码／store。
  foreach ($taskLink in $taskLinks) {
    if (!$taskLink.StartsWith($taskStagePrefix, [StringComparison]::OrdinalIgnoreCase)) { throw '拒绝清理越界链接。' }
    if (([IO.File]::GetAttributes($taskLink) -band [IO.FileAttributes]::ReparsePoint) -eq 0) { throw '暂存链接被替换，拒绝删除。' }
    [IO.Directory]::Delete($taskLink)
  }
  foreach ($taskParent in ($taskParents | Sort-Object Length -Descending)) { [IO.Directory]::Delete($taskParent) }
  [IO.Directory]::Delete($taskStage)
}
