/** 桌面共享引擎的消费端契约；实现随 lib/engine.js 交付，不依赖第二个源码仓库。 */
export interface RuntimeBinding {
  type: string
  compatibility: string
  configuration: Record<string, unknown>
}
/** 经过共享 capabilitySchema 校验的版本记录。 */
export interface CapabilityVersion {
  version: string
  runtimeBindings: Record<string, RuntimeBinding>
  dependencies: { id: string; optional: boolean }[]
}
/** 桌面运行适配器读取的权威能力字段，其余共享字段由原始文档保留。 */
export interface EngineCapability {
  id: string
  type: string
  versions: CapabilityVersion[]
}
/** 下载器返回的不可变收据；路径仍须由下载器重新验证，不能信任持久记录。 */
export interface InstallReceipt {
  storePath: string
  version: string
  integrity?: string
  command?: Command
}
/** 禁用 shell 的可执行程序与参数。 */
export interface Command {
  executable: string
  arguments: string[]
}
/** 部署管理的来源，不包含认证值；authRef 仅是环境变量名称。 */
interface SourceBase {
  id: string
  displayName: string
  enabled: boolean
  authRef?: string
}
/** GitLab 发布目标由管理员限定组与清单位置。 */
export interface GitLabSource extends SourceBase {
  type: 'gitlab'
  baseUrl: string
  apiPath: string
  rootGroup: string
  skillGroupPath: string
  pluginGroupPath: string
  manifestPath: string
}
/** npm 发布目标由管理员限定 registry 与命名空间。 */
export interface NpmSource extends SourceBase {
  type: 'npm'
  registry: string
  scopes: string[]
  seedPackages: string[]
  manifestField: string
}
/** 已经共享部署 Schema 校验的桌面消费字段。 */
export interface DeploymentProfile {
  metadata: { id: string }
  hub: { url: string }
  runtime: { default: string }
  sources: (GitLabSource | NpmSource)[]
}
/** 共享解析器的期望状态；包含共享 Schema 保留的完整权限和覆盖信息。 */
export interface DesiredState {
  capabilities: { id: string; version: string; enabled: boolean }[]
  [key: string]: unknown
}
/** 消费端只调用 parse；输入必须是不可信 unknown，不能通过类型声明绕过运行校验。 */
export interface Parser<T> {
  parse(value: unknown): T
}
/** 库导出的稳定消费端签名，支持随桌面交付或管理员指定开发入口。 */
export interface EngineModules {
  contracts: {
    deploymentProfileSchema: Parser<DeploymentProfile>
    capabilitySchema: Parser<EngineCapability>
    desiredStateSchema: Parser<DesiredState>
    sourceManifestSchema: Parser<unknown>
  }
  yaml: { parse(text: string): unknown }
  core: {
    CapabilityManager: new (catalog: { get(id: string): Promise<EngineCapability> }) => {
      add(state: DesiredState, id: string, version?: string): Promise<DesiredState>
      update(state: DesiredState, id: string, version?: string): Promise<DesiredState>
      remove(state: DesiredState, id: string): Promise<DesiredState>
      setEnabled(state: DesiredState, id: string, enabled: boolean): Promise<DesiredState>
    }
  }
  installer: {
    harnessLayout(root: string): { root: string; temp: string; lock: string }
    npmInstallCommand(): Promise<Command>
    resolveMcpCommand(storePath: string, bin?: string): Promise<Command>
    ArtifactInstaller: new (
      layout: { root: string; temp: string; lock: string },
      profile: DeploymentProfile,
      secrets: { get(reference: string): Promise<string | undefined> },
      runtime: {
        npmCommand(): Promise<Command>
        environment: NodeJS.ProcessEnv
      },
    ) => {
      install(document: EngineCapability, version: CapabilityVersion): Promise<Omit<InstallReceipt, 'version'>>
    }
    ProcessLock: new (path: string) => {
      acquire(): Promise<void>
      release(): Promise<void>
    }
  }
}
