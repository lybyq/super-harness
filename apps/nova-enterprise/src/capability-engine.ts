/** 桌面端复用 Harness 的纯依赖解析和不可变制品下载器；状态与运行实例由桌面插件拥有。 */
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { HubError } from './hub-client.ts'
import { object } from './catalog.ts'
import { sourceCredential } from './source-credentials.ts'
import type { HubClient } from './hub-client.ts'
import type { Config } from './index.ts'
import type { EngineModules, DesiredState } from './engine-types.ts'

/**
 * 优先使用随桌面交付的共享引擎；可选开发入口不导入 CLI main、不执行 CLI、不修改全局进程环境。
 * @param options 受管理员控制的 engineEntry、deploymentFile 和 resourceHome。
 * @param client 已鉴权的 Hub 客户端。
 * @returns 共享解析器、下载器与空用户状态；私有源凭据仅从 Host 环境按引用读取。
 */
export async function capabilityEngine(
  options: Pick<Config, 'engineEntry' | 'deploymentFile' | 'resourceHome' | 'apiBaseUrl'>,
  client: Pick<HubClient, 'capability'> | undefined,
) {
  if (!options.deploymentFile || !options.resourceHome) throw new HubError('HUB_ENGINE_NOT_CONFIGURED')
  if (!client) throw new HubError('HUB_NOT_CONFIGURED')
  const require = options.engineEntry ? createRequire(pathToFileURL(resolve(options.engineEntry))) : undefined
  /** @param name 固定共享库名。 @returns ESM 导出；这几套共享库仅声明 import 条件，Node require.resolve 不能直接选择。 */
  const load = async (name: string): Promise<unknown> => {
    if (!require) throw new HubError('HUB_ENGINE_NOT_CONFIGURED')
    for (const directory of require.resolve.paths(name) ?? []) {
      let pkg: Record<string, unknown>
      try {
        pkg = object(
          JSON.parse(await readFile(join(directory, name, 'package.json'), 'utf8')),
          'HUB_ENGINE_NOT_CONFIGURED',
        )
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue
        throw error
      }
      const exports = pkg.exports === undefined ? undefined : object(pkg.exports, 'HUB_ENGINE_NOT_CONFIGURED')
      const root = exports?.['.'] === undefined ? undefined : object(exports['.'], 'HUB_ENGINE_NOT_CONFIGURED')
      const entry = typeof root?.import === 'string' ? root.import : pkg.main
      if (typeof entry !== 'string') throw new HubError('HUB_ENGINE_NOT_CONFIGURED')
      return import(pathToFileURL(resolve(directory, name, entry)).href)
    }
    throw new HubError('HUB_ENGINE_NOT_CONFIGURED')
  }
  const bundledUrl = new URL('../lib/engine.js', import.meta.url).href
  const modules: unknown = options.engineEntry
    ? await Promise.all([
      load('@nova-cbb/harness-core'),
      load('@nova-cbb/harness-installer'),
      load('@nova-cbb/harness-contracts'),
      load('yaml'),
    ]).then(([core, installer, contracts, yaml]) => ({
      core,
      installer,
      contracts,
      yaml,
    }))
    : await import(bundledUrl)
  const admitted = object(modules)
  if (
    typeof object(admitted.core).CapabilityManager !== 'function' ||
    typeof object(admitted.installer).ArtifactInstaller !== 'function' ||
    typeof object(admitted.installer).ProcessLock !== 'function' ||
    typeof object(admitted.yaml).parse !== 'function' ||
    ['deploymentProfileSchema', 'capabilitySchema', 'desiredStateSchema', 'sourceManifestSchema'].some(
      key => typeof object(object(admitted.contracts)[key]).parse !== 'function',
    )
  )
    throw new HubError('HUB_ENGINE_NOT_CONFIGURED')
  // 固定构建的库导出经过入口形状检查；业务输入仍交给共享 Schema 的 parse 校验。
  const { core, installer, contracts, yaml } = modules as EngineModules
  const profile = contracts.deploymentProfileSchema.parse(yaml.parse(await readFile(options.deploymentFile, 'utf8')))
  if (
    new URL(profile.hub.url).href.replace(/\/$/, '') !== new URL(options.apiBaseUrl).href.replace(/\/$/, '') ||
    profile.runtime.default !== 'deepseek-harness'
  )
    throw new HubError('HUB_ENGINE_CONFIG_MISMATCH')
  const layout = installer.harnessLayout(options.resourceHome)
  const npmCommand = options.engineEntry
    ? () => installer.npmInstallCommand()
    : () =>
      Promise.resolve({
        executable: process.execPath,
        arguments: [fileURLToPath(new URL('../lib/npm/bin/npm-cli.js', import.meta.url))],
      })
  const artifact = new installer.ArtifactInstaller(
    layout,
    profile,
    {
      get: reference => Promise.resolve(sourceCredential(reference)),
    },
    {
      npmCommand,
      environment: {
        ELECTRON_RUN_AS_NODE: '1',
        npm_config_cache: resolve(layout.root, 'npm-cache'),
        TEMP: layout.temp,
        TMP: layout.temp,
        TMPDIR: layout.temp,
      },
    },
  )
  return {
    profile,
    contracts,
    yaml,
    npmCommand,
    manager: new core.CapabilityManager({
      get: async (id: string) => contracts.capabilitySchema.parse(await client.capability(id)),
    }),
    parseCapability: (document: unknown) => contracts.capabilitySchema.parse(document),
    parseState: (state: unknown) => contracts.desiredStateSchema.parse(state),
    artifact,
    resolveMcpCommand: (path: string, bin?: string) => installer.resolveMcpCommand(path, bin),
    lock: () => new installer.ProcessLock(layout.lock),
    empty: (): DesiredState => ({
      identity: {
        deploymentId: profile.metadata.id,
        runtimeId: 'deepseek-harness',
        scope: 'user',
      },
      roleId: 'unassigned',
      roleVersion: '0.0.0',
      capabilities: [],
      permissions: [],
      checksum: '',
      overrides: {
        add: [],
        remove: [],
        disable: [],
        configuration: {},
        permissions: [],
      },
    }),
  }
}

/** 桌面内部引擎接口由真实适配器推导，生命周期与发布共享同一签名。 */
export type CapabilityEngine = Awaited<ReturnType<typeof capabilityEngine>>
