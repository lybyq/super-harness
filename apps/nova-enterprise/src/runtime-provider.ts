/** 通过官方 Cordis 生命周期接入 MCP、文件系统 Skill 和原生插件；不修改 Agent Loop。 */
import { createHash } from 'node:crypto'
import { dirname, resolve, relative, isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readFile } from 'node:fs/promises'
import { HubError } from './hub-client.ts'
import { bundleConfiguration } from './bundle-configuration.ts'
import { runtimeFiles } from './runtime-files.ts'
import { object } from './catalog.ts'
import type { Context, Fiber, Plugin } from '@deepseek-ai/cordis'
import type { Config } from './index.ts'
import type { SavedConfiguration } from './types.ts'
import type { EngineCapability, InstallReceipt } from './engine-types.ts'
import type { CapabilityEngine } from './capability-engine.ts'
import type { RoleAccess } from './role-access.ts'
import type { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem'
import type { StdioConfig, StreamableHttpConfig } from '@deepseek-ai/dsh-mcp-client'
import type { SkillViewOptions } from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-plugin-manager'

/** @param fiber 官方插件实例。 @param timeoutMs 部署启动预算。 @returns 超时由调用者 dispose 解除未完成初始化。 */
async function started(fiber: Fiber, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      Promise.resolve(fiber),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new HubError('HUB_ACTIVATION_FAILED'))
        }, timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 解析参数引用；只在 Host 内存中形成运行配置，不接受可执行 JS 或 shell 模板。
 * @param value 绑定内的 JSON 值，字符串可使用 ${FIELD}。
 * @param values 已校验的公开参数与密钥合并视图。
 * @returns 替换后的 JSON；精确占位符保留数值、布尔与数组类型。
 */
export function bindValue(value: unknown, values: Record<string, unknown>): unknown {
  if (typeof value === 'string') {
    const exact = /^\$\{([^}]+)\}$/.exec(value)
    const key = exact?.[1]
    if (key !== undefined) {
      if (!Object.hasOwn(values, key)) throw new HubError('HUB_CONFIGURATION_REQUIRED')
      return values[key]
    }
    return value.replace(/\$\{([^}]+)\}/g, (_match: string, key: string) => {
      if (!Object.hasOwn(values, key)) throw new HubError('HUB_CONFIGURATION_REQUIRED')
      return String(values[key])
    })
  }
  if (Array.isArray(value)) return value.map(item => bindValue(item, values))
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, bindValue(item, values)]))
  return value
}

/**
 * 建立官方运行配置；普通环境变量名可直接映射，非环境变量键必须由 env/headers 显式引用。
 * @param document 权威能力文档。
 * @param receipt 不可变 Store 收据。
 * @param saved 已校验公开值和 Host 密钥。
 * @param engine 共享下载器接口。
 * @returns Host 内存中的官方 MCP 配置，不得回传界面或写日志。
 */
export async function mcpConfiguration(
  document: Pick<EngineCapability, 'id' | 'versions'>,
  receipt: InstallReceipt,
  saved: SavedConfiguration,
  engine: Pick<CapabilityEngine, 'resolveMcpCommand'>,
  workspace = '',
  runtime: Record<string, string> = {},
): Promise<Omit<StdioConfig, 'toolCallTimeoutMs'> | Omit<StreamableHttpConfig, 'toolCallTimeoutMs'>> {
  const version = document.versions.find(item => item.version === receipt.version)
  const nativeBinding = version?.runtimeBindings['deepseek-harness']
  if (!nativeBinding) throw new HubError('HUB_RUNTIME_UNSUPPORTED')
  const binding = nativeBinding.configuration
  if (Object.keys(runtime).some(key => Object.hasOwn(saved.values, key) || Object.hasOwn(saved.secrets, key)))
    throw new HubError('HUB_BINDING_INVALID')
  const values = { ...saved.values, ...saved.secrets, ...runtime }
  const spec = object(bindValue(binding, values))
  const serverName = `hub_${createHash('sha256')
    .update(workspace ? JSON.stringify([document.id, workspace]) : document.id)
    .digest('hex')
    .slice(0, 24)}`
  if (spec.transport === 'streamable-http') {
    if (typeof spec.url !== 'string') throw new HubError('HUB_BINDING_INVALID')
    return {
      transport: 'streamable-http',
      serverName,
      url: spec.url,
      headers: stringMap(spec.headers ?? {}),
      failOnStartupError: true,
    }
  }
  if (spec.transport !== undefined && spec.transport !== 'stdio') throw new HubError('HUB_RUNTIME_UNSUPPORTED')
  if (spec.bin !== undefined && typeof spec.bin !== 'string') throw new HubError('HUB_BINDING_INVALID')
  const command = await engine.resolveMcpCommand(receipt.storePath, spec.bin)
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(values)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      if (!JSON.stringify(binding.env ?? {}).includes(`\${${key}}`)) throw new HubError('HUB_BINDING_INVALID')
      continue
    }
    env[key] = typeof value === 'object' ? JSON.stringify(value) : String(value)
  }
  Object.assign(env, stringMap(spec.env ?? {}))
  const args = spec.args ?? []
  if (!Array.isArray(args) || args.some((item: unknown) => typeof item !== 'string'))
    throw new HubError('HUB_BINDING_INVALID')
  // Desktop Host 使用 Electron 的 Node 模式；子 MCP 也必须作为 Node 运行，不能启动新窗口。
  env.ELECTRON_RUN_AS_NODE = '1'
  return {
    transport: 'stdio',
    serverName,
    command: command.executable,
    args: [...command.arguments, ...(args as string[])],
    env,
    cwd: receipt.storePath,
    failOnStartupError: true,
  }
}

/** @param input 配置绑定中的环境变量或 HTTP 头。 @returns 仅含字符串值的映射，不隐式转换未知对象。 */
function stringMap(input: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(object(input)).map(([key, value]) => {
      if (typeof value !== 'string') throw new HubError('HUB_BINDING_INVALID')
      return [key, value]
    }),
  )
}

/**
 * 为当前插件创建运行实例管理器；每个实例通过官方 dispose 完整释放工具、监视器和子进程。
 * @param ctx 官方 Host 上下文。
 * @returns activate/dispose 方法；启动失败不保留半激活实例。
 */
export function runtimeProvider(
  ctx: Context,
  options: Pick<Config, 'activationTimeoutMs'> & Partial<Pick<Config, 'resourceHome'>>,
  access?: RoleAccess,
  workspace: { id: string; cwd: string } = { id: '', cwd: '' },
) {
  const live = new Map<string, (() => Promise<void>) & { bundle?: boolean }>(),
    bundleConfigs = bundleConfiguration(ctx)
  return {
    /** @param id 能力标识。 @returns 等待既有实例停止。 */
    async dispose(id: string) {
      const dispose = live.get(id)
      if (dispose) {
        await dispose()
        live.delete(id)
        access?.ownTools(id, [], workspace.id)
      }
    },
    /** @returns 等待全部受管实例停止，异常不被吞掉。 */
    async close(shutdown = false) {
      for (const [id, dispose] of [...live]) {
        if (shutdown && dispose.bundle) {
          live.delete(id)
          continue
        }
        await this.dispose(id)
      }
    },
    /** @param id 能力标识。 @returns 是否已有成功启动的本进程实例。 */
    active(id: string) {
      return live.has(id)
    },
    /**
     * @param document 权威能力声明。
     * @param receipt Store 收据与精确版本。
     * @param saved Host 配置。
     * @param engine 共享下载器接口。
     * @returns active 或 restart-required；不把 Bundle 持久写入等同于即时激活。
     */
    async activate(
      document: EngineCapability,
      receipt: InstallReceipt,
      saved: SavedConfiguration,
      engine: CapabilityEngine,
    ) {
      await this.dispose(document.id)
      const { evaluatePluginCompatibility } = await import('@deepseek-ai/dsh-app-boot')
      const binding = document.versions.find(item => item.version === receipt.version)?.runtimeBindings[
        'deepseek-harness'
      ]
      if (!binding) throw new HubError('HUB_RUNTIME_UNSUPPORTED')
      if (
        evaluatePluginCompatibility({
          name: document.id,
          version: receipt.version,
          peerDependencies: { '@deepseek-ai/dsh': binding.compatibility },
        })
      )
        throw new HubError('HUB_COMPATIBILITY_ERROR')
      if (document.type === 'mcp') {
        const plugin = await import('@deepseek-ai/dsh-mcp-client')
        if (!ctx.get('tools')) throw new HubError('HUB_RUNTIME_UNSUPPORTED')
        const needsFiles =
          binding.configuration.files !== undefined ||
          /\$\{(?:INSTANCE_HOME|WORKSPACE_CWD)\}/.test(JSON.stringify(binding.configuration))
        const files = needsFiles
          ? await runtimeFiles(
            options.resourceHome ?? '',
            document.id,
            workspace.id,
            binding.configuration.files,
            saved,
          )
          : undefined
        let fiber: Fiber | undefined
        try {
          const config = await mcpConfiguration(
            document,
            receipt,
            saved,
            engine,
            workspace.id,
            files ? { ...files.values, WORKSPACE_CWD: workspace.cwd || process.cwd() } : {},
          )
          fiber = ctx.plugin(plugin, config)
          await started(fiber, options.activationTimeoutMs)
          access?.ownTools(
            document.id,
            (ctx.get('tools')?.schemas() ?? [])
              .map(tool => tool.name)
              .filter(name => name.startsWith(`mcp__${config.serverName}__`)),
            workspace.id,
          )
        } catch (_error) {
          await fiber?.dispose()
          await files?.close()
          throw new HubError('HUB_ACTIVATION_FAILED')
        }
        const running = fiber
        live.set(document.id, async () => {
          try {
            await running.dispose()
          } finally {
            await files?.close()
          }
        })
        return 'active'
      }
      if (document.type === 'skill') {
        if (Object.keys(saved.secrets).length) throw new HubError('HUB_SKILL_SECRET_UNSUPPORTED')
        const { FileSystemSkillProvider } = await import('@deepseek-ai/dsh-skill-filesystem')
        const skills = ctx.get('skills')
        if (!skills) throw new HubError('HUB_RUNTIME_UNSUPPORTED')
        let provider!: FileSystemSkillProvider
        const dispose = skills.registerProvider((control) => {
          access?.skillInvalidator(`${workspace.id}:${document.id}`, control.invalidate)
          provider = new FileSystemSkillProvider(ctx, control, {
            providerName: `hub-${workspace.id || 'user'}-${document.id}`,
            includeDefaultRoots: false,
            customSkillDirs: [dirname(receipt.storePath)],
            watch: false,
          })
          return {
            name: provider.name,
            list: async (options: SkillViewOptions) => {
              if (access && !access.allows(options.scope, document.id, workspace.id)) return []
              const result = await provider.list(options)
              const candidates = Array.isArray(result) ? result : result.candidates
              return candidates.filter(item => item.path === resolve(receipt.storePath, 'SKILL.md'))
            },
            get: async (candidate, options: SkillViewOptions) => {
              if (access && !access.allows(options.scope, document.id, workspace.id)) return undefined
              const skill = await provider.get(candidate, options)
              if (!skill || !Object.keys(saved.values).length) return skill
              // Skill 的公开参数是模型可见上下文，秘密必须移到执行它的 MCP/Host 插件。
              return {
                ...skill,
                content: `${skill.content}\n\n## 用户配置（公开参数）\n\n${JSON.stringify(saved.values, null, 2)}`,
              }
            },
          }
        })
        try {
          const list = await provider.list({})
          if (
            !(Array.isArray(list) ? list : list.candidates).some(
              item => item.path === resolve(receipt.storePath, 'SKILL.md'),
            )
          )
            throw new HubError('HUB_ACTIVATION_FAILED')
        } catch (error) {
          access?.skillInvalidator(`${workspace.id}:${document.id}`, undefined)
          dispose()
          await provider.dispose()
          throw error
        }
        live.set(document.id, async () => {
          access?.skillInvalidator(`${workspace.id}:${document.id}`, undefined)
          dispose()
          await provider.dispose()
        })
        return 'active'
      }
      if (document.type !== 'plugin') throw new HubError('HUB_RUNTIME_UNSUPPORTED')
      // Host 插件及 Bundle 是进程级可信代码，不能借项目参数宣称已隔离；仅 MCP/Skill 支持多项目实例。
      if (workspace.id) throw new HubError('HUB_PLUGIN_SCOPE_UNSUPPORTED')
      const pkg = object(JSON.parse(await readFile(resolve(receipt.storePath, 'package.json'), 'utf8')))
      if (evaluatePluginCompatibility(pkg)) throw new HubError('HUB_COMPATIBILITY_ERROR')
      const dsh = pkg.dsh === undefined ? undefined : object(pkg.dsh)
      if (dsh?.bundle && object(dsh.bundle).patch) {
        if (typeof pkg.name !== 'string') throw new HubError('HUB_BINDING_INVALID')
        const packageName = pkg.name
        const manager = ctx.get('pluginManager')
        if (!manager) throw new HubError('HUB_RUNTIME_UNSUPPORTED')
        let result
        try {
          result = await manager.installBundle(receipt.storePath, {
            enabled: false,
          })
          if (!['applied', 'restart-required'].includes(result.application)) throw new HubError('HUB_ACTIVATION_FAILED')
          {
            const bundle = (await manager.listBundles()).find(item => item.name === packageName)
            if (!bundle) throw new HubError('HUB_BINDING_INVALID')
            bundleConfigs.prepare(document.id, bundle, binding.configuration, saved)
            result = await manager.setBundleEnabled(packageName, true)
            if (!['applied', 'restart-required'].includes(result.application))
              throw new HubError('HUB_ACTIVATION_FAILED')
          }
        } catch (error) {
          await manager.setBundleEnabled(packageName, false)
          bundleConfigs.release(document.id)
          throw error
        }
        const disable = async () => {
          const change = await manager.setBundleEnabled(packageName, false)
          if (!['applied', 'restart-required'].includes(change.application)) throw new HubError('HUB_ACTIVATION_FAILED')
          bundleConfigs.release(document.id)
        }
        disable.bundle = true
        live.set(document.id, disable)
        return result.application === 'applied' ? 'active' : 'restart-required'
      }
      // 客户端入口需要 Loader 的构建与注入流程，不允许把仅有 client 声明的包当成 Host 插件。
      if (!dsh || dsh.client || typeof pkg.main !== 'string') throw new HubError('HUB_RUNTIME_UNSUPPORTED')
      const entry = resolve(receipt.storePath, pkg.main),
        inside = relative(receipt.storePath, entry)
      if (inside.startsWith('..') || isAbsolute(inside)) throw new HubError('HUB_BINDING_INVALID')
      const module: unknown = await import(pathToFileURL(entry).href)
      const exported = object(module)
      const plugin = exported.default ?? exported
      if (typeof plugin !== 'function' && typeof object(plugin).apply !== 'function')
        throw new HubError('HUB_RUNTIME_UNSUPPORTED')
      const priorTools = new Set(
        ctx
          .get('tools')
          ?.schemas()
          .map(tool => tool.name) ?? [],
      )
      const config = bindValue(binding.configuration, {
        ...saved.values,
        ...saved.secrets,
      })
      // 安装器与兼容检查已准入的本地入口；配置解析仍由官方 Fiber 执行。
      const fiber = ctx
        .extend({ harnessCapabilityOwner: { id: document.id, workspace: workspace.id } })
        .plugin(plugin as Plugin<unknown>, config)
      try {
        await started(fiber, options.activationTimeoutMs)
      } catch (_error) {
        await fiber.dispose()
        throw new HubError('HUB_ACTIVATION_FAILED')
      }
      access?.ownTools(
        document.id,
        (ctx.get('tools')?.schemas() ?? []).map(tool => tool.name).filter(name => !priorTools.has(name)),
      )
      live.set(document.id, () => fiber.dispose())
      return 'active'
    },
  }
}
