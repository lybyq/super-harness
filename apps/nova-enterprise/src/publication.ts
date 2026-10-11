/** 资源创建与发布复用部署来源：GitLab 固定标签、npm 精确版本，发布后显式同步 Hub。 */
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { spawn } from 'node:child_process'
import { capabilityId, object, summary, fields } from './catalog.ts'
import { HubError } from './hub-client.ts'
import { capabilityEngine } from './capability-engine.ts'
import { sourceCredential } from './source-credentials.ts'
import type { CapabilityEngine } from './capability-engine.ts'
import type { HubClient } from './hub-client.ts'
import type { Config } from './index.ts'
import type { GitLabSource } from './engine-types.ts'

/** 资源草稿只接受文本文件；内容校验不执行用户生成代码。 */
interface ResourceFile {
  path: string
  content: string
}
/** 已校验的发布坐标；source.type 决定远端写入协议，checksum 绑定用户确认的内容。 */
interface PublicationDraft {
  id: string
  type: string
  version: string
  sourceId: string
  files: ResourceFile[]
  source: CapabilityEngine['profile']['sources'][number]
  checksum: string
  projectId?: number
  packageName?: string
}

/**
 * 生成可编辑的文本资源模板，不运行生成的代码，也不写用户项目。
 * @param input 能力标识、类型和精确 SemVer。
 * @returns 待用户检查的文件清单；配置声明只放引用，不填入实际账号。
 */
export function resourceTemplate(input: Record<string, unknown>): ResourceFile[] {
  const id = capabilityId(input.id),
    version = input.version
  if (
    typeof input.type !== 'string' ||
    !['skill', 'mcp', 'plugin'].includes(input.type) ||
    typeof version !== 'string' ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)
  )
    throw new HubError('HUB_REQUEST_INVALID')
  const configuration: Record<string, unknown>[] = [],
    secrets: Record<string, unknown>[] = []
  const declaration = {
    id,
    displayName: id,
    description: `企业 ${input.type} 能力`,
    configuration,
    secrets,
    runtimeBindings: {
      'deepseek-harness': {
        type: input.type,
        compatibility: '*',
        configuration: {} as Record<string, unknown>,
      },
    },
  }
  const boardKind =
    input.type === 'plugin' && input.pluginFlavor === 'jira-board'
      ? 'jira'
      : input.type === 'plugin' && input.pluginFlavor === 'gitlab-board'
        ? 'gitlab'
        : undefined
  if (
    input.pluginFlavor !== undefined &&
    (typeof input.pluginFlavor !== 'string' || !['standard', 'jira-board', 'gitlab-board'].includes(input.pluginFlavor))
  )
    throw new HubError('HUB_REQUEST_INVALID')
  if (boardKind) {
    configuration.push(
      {
        key: 'BASE_URL',
        required: true,
        description: `${boardKind} 服务根地址；HTTPS，不填账号密码。`,
        schema: { type: 'string', format: 'uri' },
      },
      {
        key: 'PROJECT',
        required: true,
        description:
          boardKind === 'jira'
            ? 'Jira 项目 Key，例如 NOVA。'
            : 'GitLab 数字项目 ID 或 group/project，不是仓库下载地址。',
        schema: { type: 'string', minLength: 1 },
      },
    )
    secrets.push({
      key: 'TOKEN',
      required: true,
      scope: 'user',
      description: '当前用户只读访问令牌；不会返回浏览器或写进看板任务。',
    })
    declaration.runtimeBindings['deepseek-harness'].configuration = {
      baseUrl: '${BASE_URL}',
      project: '${PROJECT}',
      token: '${TOKEN}',
    }
    if (boardKind === 'jira') {
      configuration.push(
        {
          key: 'AUTH_MODE',
          required: true,
          description: 'PAT 选择 bearer；账号/API Token 或密码选择 basic。',
          schema: { type: 'string', enum: ['bearer', 'basic'] },
        },
        {
          key: 'USERNAME',
          required: true,
          description: '当前用户 Jira 账号；basic 认证必须准确。',
          schema: { type: 'string', minLength: 1 },
        },
      )
      Object.assign(declaration.runtimeBindings['deepseek-harness'].configuration, {
        authentication: '${AUTH_MODE}',
        username: '${USERNAME}',
      })
    }
  }
  const files = [
    {
      path: 'README.md',
      content: `# ${id}\n\n企业 ${input.type} 能力。\n\n在 AI Hub 安装后进入「配置参数」填写账号，勿将密码放入源码。\n`,
    },
  ]
  if (input.type === 'skill')
    files.push({
      path: 'SKILL.md',
      content: `---\nname: ${id}\ndescription: 企业工作约定\n---\n\n请在此填写职责、工作流程和交付要求，不要填写密码或 Token。\n`,
    })
  else {
    const pkg: Record<string, unknown> = {
      name: input.packageName || `@harness/${id}`,
      version,
      type: 'module',
      description: declaration.description,
    }
    if (input.type === 'plugin') {
      pkg.main = './index.js'
      pkg.dsh = {}
      files.push({
        path: 'index.js',
        content: `/** 企业 Host 插件：通过作者 SDK 注册工具，动态贡献也受角色和项目限制。 */\nexport const inject = ['harnessCapabilities'];\n/** @param {import('@deepseek-ai/cordis').Context} ctx 官方上下文。 @param {object} config Hub 注入的配置。 */\nexport function apply(ctx, config) {\n  ctx.harnessCapabilities.registerTool({\n    name: '${id.replaceAll('-', '_').replaceAll('.', '_')}_status',\n    description: '查询此企业插件是否已就绪。',\n    parameters: { type: 'object', properties: {}, additionalProperties: false },\n    output: { schema: { type: 'object', properties: { ready: { type: 'boolean' } }, required: ['ready'], additionalProperties: false }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },\n    execute: async () => ({ ready: true }),\n  });\n}\n`,
      })
      if (boardKind) {
        const entry = files.at(-1)
        if (!entry) throw new HubError('HUB_REQUEST_INVALID')
        entry.content =
          `/** ${boardKind} 只读任务板 Provider；只在用户点击刷新时拉取，不回写远端、不自动执行任务。 */\nexport const inject = ['harnessCapabilities'];\n/** @param {import('@deepseek-ai/cordis').Context} ctx 官方上下文。 @param {object} config Hub 表单注入的 Host 配置。 */\nexport function apply(ctx, config) {\n  ctx.harnessCapabilities.connectBoard({ ...config, kind: '${boardKind}' });\n}\n`
      }
    } else {
      const field = input.manifestField ?? 'novaHarness'
      if (
        typeof field !== 'string' ||
        !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(field) ||
        ['name', 'version', 'bin', 'scripts', 'dependencies', 'publishConfig'].includes(field)
      )
        throw new HubError('HUB_REQUEST_INVALID')
      pkg.bin = { [id]: './server.mjs' }
      pkg[field] = declaration
      files.push({
        path: 'server.mjs',
        content:
          '/** 最小 stdio MCP 示例：按请求 ID 回复，不把日志写入协议 stdout。 */\nimport { createInterface } from "node:readline";\nconst lines = createInterface({ input: process.stdin });\nlines.on("line", line => {\n  try {\n    const request = JSON.parse(line);\n    if (request.id === undefined) return;\n    const result = request.method === "initialize" ? { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "enterprise-mcp", version: "1.0.0" } }\n      : request.method === "tools/list" ? { tools: [{ name: "ping", description: "检查连接", inputSchema: { type: "object", properties: {} } }] }\n      : request.method === "tools/call" && request.params.name === "ping" ? { content: [{ type: "text", text: "pong" }] } : undefined;\n    process.stdout.write(JSON.stringify(result === undefined ? { jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Method not found" } } : { jsonrpc: "2.0", id: request.id, result }) + "\\n");\n  } catch { process.stderr.write("Invalid MCP request\\n"); }\n});\n',
      })
    }
    files.push({ path: 'package.json', content: JSON.stringify(pkg, null, 2) })
  }
  if (input.type !== 'mcp')
    files.push({
      path: 'nova.manifest.yaml',
      content: JSON.stringify(
        {
          ...declaration,
          metadata: {
            id,
            displayName: id,
            description: declaration.description,
          },
        },
        null,
        2,
      ),
    })
  else {
    const server = files.find(file => file.path === 'server.mjs')
    if (!server) throw new HubError('HUB_PUBLISH_MANIFEST_INVALID')
    server.content = `#!/usr/bin/env node\n${server.content}`
  }
  return files
}

/** @param input 待发布清单。 @param engine 共享契约。 @param options 请求预算。 @returns 精确坐标、文本文件、来源与内容摘要；不执行文件。 */
export function publicationDraft(
  input: Record<string, unknown>,
  engine: Pick<CapabilityEngine, 'profile' | 'yaml' | 'contracts'>,
  options: Pick<Config, 'maxRequestBytes'>,
): PublicationDraft {
  const id = capabilityId(input.id),
    sourceId = capabilityId(input.sourceId),
    version = input.version
  if (
    typeof input.type !== 'string' ||
    !['skill', 'mcp', 'plugin'].includes(input.type) ||
    typeof version !== 'string' ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version) ||
    !Array.isArray(input.files) ||
    !input.files.length ||
    input.files.length > 100
  )
    throw new HubError('HUB_REQUEST_INVALID')
  const source = engine.profile.sources.find(item => item.id === sourceId && item.enabled)
  if (!source || (input.type === 'mcp') !== (source.type === 'npm')) throw new HubError('HUB_PUBLISH_TARGET_INVALID')
  const seen = new Set()
  const files = input.files.map((raw: unknown) => {
    const item = object(raw)
    if (
      typeof item.path !== 'string' ||
      !/^[A-Za-z0-9_-][A-Za-z0-9_./-]{0,240}$/.test(item.path) ||
      item.path
        .split('/')
        .some(
          part =>
            !part ||
            ['.', '..', 'node_modules'].includes(part) ||
            /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part),
        ) ||
      typeof item.content !== 'string' ||
      seen.has(item.path.toLowerCase())
    )
      throw new HubError('HUB_REQUEST_INVALID')
    seen.add(item.path.toLowerCase())
    return { path: item.path, content: item.content }
  })
  if (Buffer.byteLength(JSON.stringify(files)) > options.maxRequestBytes) throw new HubError('HUB_REQUEST_TOO_LARGE')
  let pkg: Record<string, unknown> = {},
    manifest: Record<string, unknown>
  try {
    if (input.type !== 'skill')
      pkg = object(JSON.parse(files.find(file => file.path === 'package.json')?.content ?? ''))
    manifest =
      source.type === 'npm'
        ? object(pkg[source.manifestField])
        : object(engine.yaml.parse(files.find(file => file.path === source.manifestPath)?.content ?? ''))
  } catch (_error) {
    throw new HubError('HUB_PUBLISH_MANIFEST_INVALID')
  }
  const declaredId = input.type === 'mcp' ? manifest.id : object(manifest.metadata).id
  const binding = object(object(manifest.runtimeBindings)['deepseek-harness'])
  if (declaredId !== id || binding.type !== input.type) throw new HubError('HUB_PUBLISH_MANIFEST_INVALID')
  try {
    engine.contracts.sourceManifestSchema.parse(manifest)
  } catch (_error) {
    throw new HubError('HUB_PUBLISH_MANIFEST_INVALID')
  }
  fields({
    configuration: manifest.configuration ?? [],
    secrets: manifest.secrets ?? [],
  })
  if (input.type === 'skill') {
    const skill = files.find(file => file.path === 'SKILL.md')?.content
    const frontmatter = skill && /^---\s*\r?\n([\s\S]*?)\r?\n---/.exec(skill)?.[1]
    const secrets = manifest.secrets ?? []
    if (
      !frontmatter ||
      !/^name\s*:\s*\S+/m.test(frontmatter) ||
      !/^description\s*:\s*.+/m.test(frontmatter) ||
      !Array.isArray(secrets) ||
      secrets.length
    )
      throw new HubError('HUB_PUBLISH_MANIFEST_INVALID')
  } else {
    if (
      pkg.version !== version ||
      typeof pkg.name !== 'string' ||
      !/^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/.test(pkg.name) ||
      pkg.publishConfig ||
      pkg.scripts
    )
      throw new HubError('HUB_PUBLISH_MANIFEST_INVALID')
    const packageName = pkg.name
    if (
      source.type === 'npm' &&
      !source.scopes.some(scope => packageName.startsWith(`${scope}/`)) &&
      !source.seedPackages.includes(packageName)
    )
      throw new HubError('HUB_PUBLISH_TARGET_INVALID')
    const dsh = pkg.dsh === undefined ? undefined : object(pkg.dsh)
    const bundle = dsh?.bundle === undefined ? undefined : object(dsh.bundle)
    const entry =
      input.type === 'plugin'
        ? (bundle?.patch ?? pkg.main)
        : typeof pkg.bin === 'string'
          ? pkg.bin
          : Object.values(object(pkg.bin ?? {}))[0]
    if (
      typeof entry !== 'string' ||
      !files.some(file => file.path === entry.replace(/^\.\//, '')) ||
      (input.type === 'plugin' && (!dsh || (dsh.client && !bundle)))
    )
      throw new HubError('HUB_PUBLISH_MANIFEST_INVALID')
    if (
      input.type === 'mcp' &&
      typeof pkg.bin === 'object' &&
      Object.keys(object(pkg.bin)).length !== 1 &&
      !object(binding.configuration ?? {}).bin
    )
      throw new HubError('HUB_PUBLISH_MANIFEST_INVALID')
    if (
      pkg.files &&
      (!Array.isArray(pkg.files) ||
        pkg.files.some(
          (path: unknown) => typeof path !== 'string' || !files.some(file => file.path === path.replace(/^\.\//, '')),
        ) ||
        !pkg.files.includes(entry.replace(/^\.\//, '')))
    )
      throw new HubError('HUB_PUBLISH_MANIFEST_INVALID')
  }
  if (
    source.type === 'gitlab' &&
    (typeof input.projectId !== 'number' || !Number.isSafeInteger(input.projectId) || input.projectId < 1)
  )
    throw new HubError('HUB_PUBLISH_TARGET_INVALID')
  const coordinate: { projectId: number } | { packageName: string } =
    source.type === 'gitlab' ? { projectId: input.projectId as number } : { packageName: pkg.name as string }
  const draft = {
    id,
    type: input.type,
    version,
    sourceId,
    files,
    ...coordinate,
  }
  const checksum = createHash('sha256').update(JSON.stringify(draft)).digest('hex')
  return { ...draft, checksum, source }
}

/** @param options 部署预算。 @param online 不带离线回退的 Hub 客户端。 @returns 模板、校验和显式发布入口；关闭时取消 npm 子进程。 */
export function publicationService(
  options: Config & { fetch?: typeof fetch },
  online: Pick<HubClient, 'capability' | 'syncSource'> | undefined,
) {
  let enginePromise: Promise<CapabilityEngine> | undefined,
    pending: Promise<unknown> = Promise.resolve()
  const abort = new AbortController()
  const engine = () =>
    (enginePromise ??= capabilityEngine(options, online).catch((error: unknown) => {
      enginePromise = undefined
      throw error
    }))
  /** @param source 已验证部署来源。 @param path 内部固定路径。 @param payload 写入体。 @param missing 是否允许 404。 @returns 有预算的 JSON，不跟随重定向。 */
  async function gitlab(
    source: GitLabSource,
    path: string,
    payload?: unknown,
    missing = false,
  ): Promise<Record<string, unknown> | undefined> {
    const base = new URL(source.baseUrl),
      token = sourceCredential(source.authRef)
    if (
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      !(base.protocol === 'https:' || (options.allowInsecureHttp && base.protocol === 'http:'))
    )
      throw new HubError('HUB_PUBLISH_TARGET_INVALID')
    if (source.authRef && !token) throw new HubError('HUB_AUTH_REQUIRED')
    let response
    try {
      response = await (options.fetch ?? fetch)(
        `${source.baseUrl.replace(/\/$/, '')}${source.apiPath.replace(/\/$/, '')}${path}`,
        {
          method: payload === undefined ? 'GET' : 'POST',
          redirect: 'error',
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(options.timeoutMs)]),
          headers: {
            Accept: 'application/json',
            ...(token ? { 'PRIVATE-TOKEN': token } : {}),
            ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
        },
      )
    } catch (_error) {
      throw new HubError('HUB_PUBLISH_UNCERTAIN')
    }
    if (missing && response.status === 404) {
      await response.body?.cancel()
      return undefined
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new HubError('HUB_PUBLISH_FAILED', response.status)
    }
    const reader = response.body?.getReader()
    if (!reader) throw new HubError('HUB_RESPONSE_INVALID')
    const chunks = []
    let bytes = 0
    try {
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        bytes += chunk.value.length
        if (bytes > options.maxResponseBytes) {
          await reader.cancel()
          throw new HubError('HUB_RESPONSE_TOO_LARGE')
        }
        chunks.push(chunk.value)
      }
    } finally {
      reader.releaseLock()
    }
    try {
      return object(JSON.parse(Buffer.concat(chunks).toString('utf8')))
    } catch (_error) {
      throw new HubError('HUB_RESPONSE_INVALID')
    }
  }
  return {
    /** @returns 已启用来源的名称与类型，不返回源令牌。 */
    async targets() {
      return {
        enabled: options.allowPublishing,
        maxRequestBytes: options.maxRequestBytes,
        sources: (await engine()).profile.sources
          .filter(item => item.enabled)
          .map(item => ({
            id: item.id,
            name: item.displayName,
            type: item.type,
            ...(item.type === 'npm'
              ? {
                scopes: item.scopes,
                manifestField: item.manifestField,
                seedPackages: item.seedPackages,
              }
              : { manifestPath: item.manifestPath }),
          })),
      }
    },
    template: resourceTemplate,
    /** @param input 发布清单。 @returns 发布前精确坐标及内容摘要。 */
    async validate(input: Record<string, unknown>) {
      const value = publicationDraft(input, await engine(), options)
      return {
        id: value.id,
        version: value.version,
        checksum: value.checksum,
        fileCount: value.files.length,
        destination: value.packageName ?? String(value.projectId),
      }
    },
    /** @returns 停止新发布，等待已开始发布结束；不删除远端已提交的资源。 */
    async close() {
      abort.abort()
      await pending
    },
    /** @param input 用户确认的清单和校验摘要。 @returns 区分源提交、Hub 同步与搜索发现；不自动重试有副作用的请求。 */
    publish(input: Record<string, unknown>) {
      const action = async () => {
        if (abort.signal.aborted) throw new HubError('HUB_CANCELLED')
        if (!options.allowPublishing || input.confirmed !== true) throw new HubError('HUB_PUBLISH_DISABLED')
        const e = await engine(),
          draft = publicationDraft(input, e, options)
        if (input.expectedChecksum !== draft.checksum) throw new HubError('HUB_PUBLISH_DRAFT_CHANGED')
        let commitSha: string | undefined
        if (draft.source.type === 'gitlab') {
          const project = await gitlab(draft.source, `/projects/${draft.projectId}`)
          const group = `${draft.source.rootGroup}/${draft.type === 'skill' ? draft.source.skillGroupPath : draft.source.pluginGroupPath}/`
          if (
            !project ||
            typeof project.path_with_namespace !== 'string' ||
            !project.path_with_namespace.startsWith(group) ||
            typeof project.default_branch !== 'string' ||
            project.archived
          )
            throw new HubError('HUB_PUBLISH_TARGET_INVALID')
          const prefix = `/projects/${draft.projectId}/repository`,
            tag = `v${draft.version}`
          if (await gitlab(draft.source, `${prefix}/tags/${encodeURIComponent(tag)}`, undefined, true))
            throw new HubError('HUB_PUBLISH_VERSION_EXISTS')
          const actions = []
          for (const file of draft.files) {
            const previous = await gitlab(
              draft.source,
              `${prefix}/files/${encodeURIComponent(file.path)}?ref=${encodeURIComponent(project.default_branch)}`,
              undefined,
              true,
            )
            actions.push({
              action: previous ? 'update' : 'create',
              file_path: file.path,
              content: file.content,
              ...(previous ? { last_commit_id: previous.last_commit_id } : {}),
            })
          }
          const commit = await gitlab(draft.source, `${prefix}/commits`, {
            branch: project.default_branch,
            commit_message: `Publish ${draft.id}@${draft.version}`,
            actions,
          })
          if (!commit || typeof commit.id !== 'string' || !/^[a-f0-9]{40,64}$/.test(commit.id))
            throw new HubError('HUB_PUBLISH_UNCERTAIN')
          commitSha = commit.id
          try {
            await gitlab(draft.source, `${prefix}/tags`, {
              tag_name: tag,
              ref: commitSha,
            })
          } catch (_error) {
            return {
              outcome: 'source-partial',
              commitSha,
              id: draft.id,
              version: draft.version,
            }
          }
        } else {
          const root = resolve(options.resourceHome, 'publish-temp')
          await mkdir(root, { recursive: true })
          const temporary = await mkdtemp(join(root, 'publish-'))
          try {
            const packageDir = join(temporary, 'package')
            await mkdir(packageDir)
            for (const file of draft.files) {
              const path = resolve(packageDir, file.path)
              await mkdir(dirname(path), { recursive: true })
              await writeFile(path, file.content, { mode: 0o600 })
            }
            const registry = new URL(draft.source.registry)
            if (
              registry.username ||
              registry.password ||
              registry.search ||
              registry.hash ||
              !(registry.protocol === 'https:' || (options.allowInsecureHttp && registry.protocol === 'http:'))
            )
              throw new HubError('HUB_PUBLISH_TARGET_INVALID')
            const token = sourceCredential(draft.source.authRef)
            if (draft.source.authRef && !token) throw new HubError('HUB_AUTH_REQUIRED')
            const auth = join(temporary, 'publish.npmrc')
            await writeFile(
              auth,
              `registry=${registry.href}\n${token ? `//${registry.host}${registry.pathname.replace(/\/?$/, '/')}:_authToken=\${HARNESS_PUBLISH_TOKEN}\n` : ''}`,
              { mode: 0o600 },
            )
            const globalconfig = join(temporary, 'global.npmrc')
            await writeFile(globalconfig, '', { mode: 0o600 })
            const command = await e.npmCommand()
            await new Promise<void>((resolvePromise, reject) => {
              const child = spawn(
                command.executable,
                [
                  ...command.arguments,
                  'publish',
                  packageDir,
                  '--ignore-scripts',
                  '--registry',
                  registry.href,
                  '--userconfig',
                  auth,
                  '--globalconfig',
                  globalconfig,
                  '--cache',
                  resolve(options.resourceHome, 'npm-cache'),
                  '--loglevel',
                  'silent',
                ],
                {
                  cwd: temporary,
                  shell: false,
                  windowsHide: true,
                  stdio: 'ignore',
                  signal: AbortSignal.any([abort.signal, AbortSignal.timeout(options.publishingTimeoutMs)]),
                  env: {
                    ...process.env,
                    ELECTRON_RUN_AS_NODE: '1',
                    HARNESS_PUBLISH_TOKEN: token ?? '',
                    TEMP: temporary,
                    TMP: temporary,
                    TMPDIR: temporary,
                  },
                },
              )
              child.once('error', () => {
                reject(new HubError('HUB_PUBLISH_UNCERTAIN'))
              })
              child.once('exit', (code) => {
                if (code === 0) resolvePromise()
                else reject(new HubError('HUB_PUBLISH_FAILED'))
              })
            })
          } finally {
            await rm(temporary, { recursive: true, force: true })
          }
        }
        if (!online) throw new HubError('HUB_NOT_CONFIGURED')
        try {
          await online.syncSource(draft.sourceId)
        } catch (_error) {
          return {
            outcome: 'published-not-indexed',
            id: draft.id,
            version: draft.version,
            ...(commitSha ? { commitSha } : {}),
          }
        }
        try {
          const indexed = object(await online.capability(draft.id))
          if (
            !Array.isArray(indexed.versions) ||
            !indexed.versions.some((input: unknown) => {
              const item = object(input)
              return item.version === draft.version && (!commitSha || item.commitSha === commitSha)
            })
          )
            throw new HubError('HUB_RESPONSE_INVALID')
          summary(indexed)
        } catch (_error) {
          return {
            outcome: 'published-not-indexed',
            id: draft.id,
            version: draft.version,
            ...(commitSha ? { commitSha } : {}),
          }
        }
        return {
          outcome: 'published',
          id: draft.id,
          version: draft.version,
          ...(commitSha ? { commitSha } : {}),
        }
      }
      const result = pending.then(action)
      pending = result.catch(() => undefined)
      return result
    },
  }
}
