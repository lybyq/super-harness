import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { load as loadYaml } from 'js-yaml'
import { createRuntimeResolution, loadProfileDirectory, readProfileManifest } from '@deepseek-ai/dsh-app-boot'
import { applyEntryPatches } from '@deepseek-ai/cordis-plugin-include'
import { createDevelopmentProjectMetadata, createPluginProfile, DesktopProjectManager } from '../src/project-manager.ts'
import { NOVA_COMMUNITY_PACKAGE, NOVA_COMMUNITY_PINS, NOVA_DESKTOP_BUNDLES } from '../src/nova-community.ts'
import { DESKTOP_HOST_PACKAGE } from '../src/core-package-set.ts'
import { DESKTOP_HOST_PROTOCOL_VERSION } from '../src/host-protocol.ts'
import { resolveDesktopPaths } from '../src/paths.ts'
import { runtimeFixture } from './runtime-fixture.ts'
import { prepareDevelopmentProject } from '../scripts/development-project.ts'
import { readDesktopRuntime } from '../src/runtime-tree.ts'

const roots: string[] = []
const repository = join(import.meta.dirname, '../../..')
const host = join(repository, 'apps/desktop-host')

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'nova-community-test-'))
  roots.push(root)
  return root
}

/** @param root 本测试专属临时根。 @returns 与真实开发启动相同的已链接安装入口，不依赖仓库根的偶然软链接。 */
function developmentProject(root: string): string {
  return prepareDevelopmentProject({ projectDir: join(root, 'runtime'),
    cliDir: join(repository, 'apps/cli'), hostDir: host,
    dependencyDir: join(repository, 'node_modules/.pnpm/node_modules'),
    release: { schemaVersion: 1, version: '0.2.1-alpha.2', hostProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
      nodeVersion: '24.17.0', pnpmVersion: '11.28.5' }, target: 'win-x64' })
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('Nova community desktop composition', () => {
  it('allows an official-only comparison without selecting community layers', () => {
    const root = temporaryRoot()
    const official = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']
    createPluginProfile(root, official)
    expect(readProfileManifest('dsh', root).dsh?.profile?.bundles).toEqual(official)
  })
  it('selects community and intranet defaults on first launch without replacing a user profile', () => {
    const root = temporaryRoot()
    createPluginProfile(root)
    const path = join(root, 'package.json')
    expect(readProfileManifest('dsh', root).dsh?.profile?.bundles).toEqual(NOVA_DESKTOP_BUNDLES)
    const custom = { private: true, dependencies: {}, dsh: { profile: { bundles: ['custom'] } } }
    writeFileSync(path, JSON.stringify(custom))
    createPluginProfile(root)
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(custom)
  })

  it('keeps recovery official-only and never reactivates community layers on restart', async () => {
    const root = temporaryRoot()
    const runtime = join(root, 'runtime')
    runtimeFixture(runtime)
    const manager = new DesktopProjectManager(resolveDesktopPaths(join(root, 'home')), { dsh: runtime })
    await manager.applyRelease()
    await manager.disableAllPlugins()
    await manager.applyRelease()
    expect(readProfileManifest('dsh', manager.paths.profile).dsh?.profile?.bundles)
      .toEqual(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
  })

  it('uses matching first-launch layers for the linked development runtime', () => {
    const root = temporaryRoot()
    createDevelopmentProjectMetadata(root, { schemaVersion: 1, version: '0.2.1-alpha.2',
      hostProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION, nodeVersion: '24.17.0', pnpmVersion: '11.28.5' })
    expect(readProfileManifest('dsh', root).dsh?.profile?.bundles)
      .toEqual(NOVA_DESKTOP_BUNDLES)
  })

  it('pins every community family in the workspace and carries the deployment patch in the Host tarball', () => {
    const workspace = loadYaml(readFileSync(join(repository, 'pnpm-workspace.yaml'), 'utf8')) as {
      overrides: Record<string, string>
    }
    expect(workspace.overrides).toMatchObject(NOVA_COMMUNITY_PINS)
    const manifest = JSON.parse(readFileSync(join(host, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
      dsh: { bundle: { patch: string } }
      files: string[]
    }
    expect(manifest.dependencies[NOVA_COMMUNITY_PACKAGE]).toBe(NOVA_COMMUNITY_PINS[NOVA_COMMUNITY_PACKAGE])
    expect(manifest.dsh.bundle.patch).toBe('./nova.enterprise.patch.yml')
    expect(manifest.files).toContain('nova.enterprise.patch.yml')
  })

  it('loads real published community layers through official profile parsing with public services disabled', () => {
    const root = temporaryRoot()
    createPluginProfile(root)
    // 真实启动先准备 CLI/Host 依赖入口，不能依赖裸源码目录解析自身包名。
    const project = developmentProject(root)
    const profile = loadProfileDirectory('dsh', root, join(project, 'node_modules/@deepseek-ai/dsh-desktop-host/package.json'))
    expect(profile.skippedBundles).toEqual([])
    expect(profile.layers.map(layer => layer.packageName)).toEqual(NOVA_DESKTOP_BUNDLES)
    const rows = applyEntryPatches([], profile.layers.flatMap(layer => layer.patches), (message) => { throw new Error(message) })
    for (const id of ['web-ui-market', 'web-ui-community-plugins', 'web-ui-remote-web-ui',
      'web-ui-update', 'web-ui-task-board-github']) {
      expect(rows.find(row => row.id === id)?.disabled, id).toBe(true)
    }
    for (const id of ['web-ui-task-board', 'web-ui-git-graph', 'web-ui-preset-center', 'web-ui-skin-center']) {
      const row = rows.find(entry => entry.id === id)
      expect(row, id).toBeDefined()
      expect(row?.disabled, id).not.toBe(true)
    }
    expect(profile.layers.at(-1)?.packageName).toBe(DESKTOP_HOST_PACKAGE)
  })

  it('resolves community Host exports from the Desktop Host installation rather than only parsing bundle patches', async () => {
    const root = temporaryRoot()
    const project = developmentProject(root)
    const profileDir = join(root, 'profile')
    createPluginProfile(profileDir)
    const installAnchor = join(project, 'node_modules/@deepseek-ai/dsh-desktop-host/package.json')
    const profile = loadProfileDirectory('dsh', profileDir, installAnchor)
    expect(profile.skippedBundles).toEqual([])
    expect(profile.layers.map(layer => layer.packageName)).toEqual(NOVA_DESKTOP_BUNDLES)
    const resolution = await createRuntimeResolution({ installAnchor, profile, home: root })
    expect(resolution.entries).toContainEqual(expect.objectContaining({
      name: NOVA_COMMUNITY_PACKAGE, version: '0.4.5', scope: 'installation',
    }))
    expect(resolution.entries).toContainEqual(expect.objectContaining({
      name: '@deepseek-ai/dsh-nova-enterprise', version: '0.2.1-alpha.2', scope: 'installation',
    }))
    const inventory = readDesktopRuntime(project).sharedPackages
    expect(inventory).toContainEqual({ name: NOVA_COMMUNITY_PACKAGE, version: '0.4.5',
      path: 'node_modules/@linxin666/dsh-web-all' })
  })
})
