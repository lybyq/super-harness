/** Prepare Desktop resources and publish their versions after every preparation stage succeeds. */

import { execFileSync } from 'node:child_process'
import { chmodSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { downloadArtifact } from '@electron/get'
import extractZip from 'extract-zip'
import { readPrimaryRuntime } from '../../../packages/skill/tool-workspace-dependencies/src/index.ts'
import { desktopTargetPlatform, resolveDesktopBuildTarget, resolveDesktopTargetBuildPaths } from './desktop-build-paths.mjs'
import { packagingStep } from './packaging-step.mjs'
import { preparePrimaryRuntime } from './prepare-primary-runtime.ts'
import { prepareDesktopCli } from './prepare-cli.ts'
import { prepareCommandLink } from './prepare-command-link.ts'

const BUILD_PATHS = resolveDesktopTargetBuildPaths()
const RUNTIME_ROOT = BUILD_PATHS.runtime

type DesktopTarget = ReturnType<typeof desktopTargetPlatform>

/**
 * 准备目标 Electron；离线模式校验本地备份的实际版本与架构，不访问下载服务。
 * @param target 桌面目标平台与架构。
 * @returns Electron 内嵌的 Node 版本；备份缺失、探测失败或版本不匹配时拒绝准备。
 */
async function prepareElectron(target: DesktopTarget): Promise<string> {
  const { platform, arch } = target
  const require = createRequire(import.meta.url)
  const { version } = require('electron/package.json') as { version: string }
  if (process.env.HARNESS_OFFLINE_BUILD === '1') {
    const source = join(import.meta.dirname, '../../../.offline/assets/electron')
    const saved = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8')) as { version?: unknown }
    const executableName = platform === 'win32' ? 'electron.exe' : 'Electron.app/Contents/MacOS/Electron'
    const executable = join(source, 'dist', executableName)
    const inspected = JSON.parse(execFileSync(executable, ['-p',
      'JSON.stringify({platform:process.platform,arch:process.arch,electron:process.versions.electron,node:process.versions.node})'],
    { encoding: 'utf8', timeout: 30_000, windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } })) as {
      platform: string
      arch: string
      electron: string
      node: string
    }
    if (saved.version !== version || inspected.electron !== version || inspected.platform !== platform || inspected.arch !== arch) {
      throw new Error('desktop runtime: offline Electron version or target mismatch; restore the locked distribution')
    }
    // 本地备份通过真实二进制检查后才复制；缺失或不匹配时终止，不回退到公网下载。
    rmSync(BUILD_PATHS.electron, { recursive: true, force: true })
    cpSync(join(source, 'dist'), BUILD_PATHS.electron, { recursive: true })
    return inspected.node
  }
  const archive = await packagingStep(process.env.DSH_DESKTOP_PACKAGING_RUN_DIR, 'download:electron',
    () => downloadArtifact({ version, platform, arch, artifactName: 'electron', cacheRoot: BUILD_PATHS.downloads }))
  rmSync(BUILD_PATHS.electron, { recursive: true, force: true })
  await packagingStep(process.env.DSH_DESKTOP_PACKAGING_RUN_DIR, 'extract:electron', () => extractZip(archive, { dir: BUILD_PATHS.electron }))
  const executable = join(BUILD_PATHS.electron, platform === 'win32' ? 'electron.exe' : 'Electron.app/Contents/MacOS/Electron')
  return execFileSync(executable, ['-p', 'process.versions.node'], {
    encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  }).trim()
}

function prepareCli({ platform, arch }: DesktopTarget): void {
  cpSync(join(import.meta.dirname, 'node-bin'), join(RUNTIME_ROOT, 'bin'), { recursive: true })
  chmodSync(join(RUNTIME_ROOT, 'bin', 'node'), 0o755)
  const cli = join(RUNTIME_ROOT, 'cli')
  prepareDesktopCli(cli, platform)
  if (platform === 'darwin') {
    const minimumVersion = execFileSync('/usr/libexec/PlistBuddy', [
      '-c', 'Print LSMinimumSystemVersion', join(BUILD_PATHS.electron, 'Electron.app', 'Contents', 'Info.plist'),
    ], { encoding: 'utf8' }).trim()
    prepareCommandLink(cli, arch, minimumVersion)
  }
  cpSync(join(import.meta.dirname, '..', 'lib', 'command-manager-entry.js'), join(cli, 'command-manager.js'))
  cpSync(join(import.meta.dirname, 'command-path.ps1'), join(cli, 'command-path.ps1'))
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { 'defer-primary-runtime-smoke': { type: 'boolean', default: false } } })
  const target = desktopTargetPlatform(resolveDesktopBuildTarget())
  rmSync(RUNTIME_ROOT, { recursive: true, force: true })
  mkdirSync(RUNTIME_ROOT, { recursive: true })
  const nodeVersion = await prepareElectron(target)
  await packagingStep(process.env.DSH_DESKTOP_PACKAGING_RUN_DIR, 'prepare:primary-runtime',
    () => preparePrimaryRuntime({ deferSmoke: values['defer-primary-runtime-smoke'] }))
  const { pnpm } = await readPrimaryRuntime(join(RUNTIME_ROOT, 'primary-runtime'))
  if (pnpm === undefined) throw new Error('desktop runtime: primary-runtime manifest has no pnpm version')
  await packagingStep(process.env.DSH_DESKTOP_PACKAGING_RUN_DIR, 'prepare:cli', async () => { prepareCli(target) })
  writeFileSync(join(RUNTIME_ROOT, 'versions.json'), `${JSON.stringify({
    schemaVersion: 1,
    node: nodeVersion,
    pnpm,
  }, undefined, 2)}\n`)
}

await main()
