/** Nova 企业插件入口：复用官方已鉴权连接注册 Hub 路由，不另建裸 HTTP 服务。 */
import { createHash } from 'node:crypto'
import Schema from '@deepseek-ai/schemastery'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import { HubClient, HubError } from './hub-client.ts'
import { capabilityId, catalog, configuration, fields, object, summary } from './catalog.ts'
import { roleCatalog, rolePlan, roleRequest } from './roles.ts'
import { capabilityLifecycle } from './lifecycle.ts'
import { roleRuntime } from './role-runtime.ts'
import { offlineClient } from './offline-client.ts'
import { publicationService } from './publication.ts'
import { workspaces, workspaceScope, agentWorkspace } from './workspace.ts'
import { protectedCredentials, windowsCredentialCipher } from './credential-protection.ts'
import { CapabilityTools } from './capability-tools.ts'
import { resourceDrafts } from './resource-drafts.ts'
export { CapabilityTools } from './capability-tools.ts'
export type { TeamMemberSettings, TeamTaskSettings } from './types.ts'
import type { Context } from '@deepseek-ai/cordis'
import type { StoredConfiguration } from './types.ts'
import type {} from '@deepseek-ai/dsh-cmdline'
import type {} from '@deepseek-ai/dsh-client-connection'

export const name = 'nova-hub'
export const inject = ['connection', 'credentials']
export const Config = Schema.object({
  secretProtection: Schema.union(['none', 'windows-dpapi'])
    .default('none')
    .description('Host credential encryption; Windows DPAPI binds records to the current Windows user.'),
  apiBaseUrl: Schema.string().default('').description('Administrator-managed Hub API URL, including /api/v1.'),
  authentication: Schema.union(['none', 'bearer'])
    .default('none')
    .description('Explicit Hub authentication mode; never downgrade after an authentication failure.'),
  tokenEnvironmentVariable: Schema.string()
    .default('NOVA_HUB_TOKEN')
    .description('Host-only environment variable holding the Hub bearer token.'),
  allowInsecureHttp: Schema.boolean().default(false).description('Allow an explicitly configured HTTP intranet Hub.'),
  timeoutMs: Schema.natural().min(1).max(120000).default(15000).description('Hub request timeout in milliseconds.'),
  maxResponseBytes: Schema.natural()
    .min(1)
    .max(16777216)
    .default(2097152)
    .description('Maximum bytes admitted from a Hub response.'),
  maxRequestBytes: Schema.natural()
    .min(1)
    .max(1048576)
    .default(65536)
    .description('Maximum configuration submission bytes.'),
  engineEntry: Schema.string()
    .default('')
    .description('Harness package entry used to resolve shared installer libraries; never imports CLI main.'),
  deploymentFile: Schema.string()
    .default('')
    .description('Harness DeploymentProfile file for trusted private sources.'),
  resourceHome: Schema.string()
    .default('')
    .description('Desktop-owned immutable resource Store root, separate from CLI state.'),
  maxHistory: Schema.natural().min(1).max(100).default(10).description('Number of retained capability revisions.'),
  offlineMaxEntries: Schema.natural()
    .min(1)
    .max(1000)
    .default(200)
    .description('Maximum Hub read-cache entries per deployment.'),
  offlineMaxBytes: Schema.natural()
    .min(1)
    .max(67108864)
    .default(16777216)
    .description('Maximum Hub read-cache bytes per deployment.'),
  offlineMaxAgeMs: Schema.natural()
    .min(1)
    .max(2592000000)
    .default(86400000)
    .description('Maximum offline cache age; authentication failures never use cache.'),
  activationTimeoutMs: Schema.natural()
    .min(1)
    .max(120000)
    .default(30000)
    .description('Maximum native plugin startup wait.'),
  allowPublishing: Schema.boolean()
    .default(false)
    .description('Allow explicit user publication to deployment-owned sources; no publication approval state.'),
  publishingTimeoutMs: Schema.natural()
    .min(1000)
    .max(600000)
    .default(120000)
    .description('Maximum npm publication wait; failed writes are never automatically retried.'),
  teamProvider: Schema.string().default('spawn').description('Official continuable subagent provider for role teams.'),
  teamStartupTimeoutMs: Schema.natural()
    .min(1000)
    .max(120000)
    .default(60000)
    .description('Maximum time to provision one teammate.'),
})

/** 官方 Schema 推导的完整部署选项，默认值由 Loader 解析后提供。 */
export type Config = Pick<
  ReturnType<typeof Config>,
  | 'apiBaseUrl'
  | 'secretProtection'
  | 'authentication'
  | 'tokenEnvironmentVariable'
  | 'allowInsecureHttp'
  | 'timeoutMs'
  | 'maxResponseBytes'
  | 'maxRequestBytes'
  | 'engineEntry'
  | 'deploymentFile'
  | 'resourceHome'
  | 'maxHistory'
  | 'offlineMaxEntries'
  | 'offlineMaxBytes'
  | 'offlineMaxAgeMs'
  | 'activationTimeoutMs'
  | 'allowPublishing'
  | 'publishingTimeoutMs'
  | 'teamProvider'
  | 'teamStartupTimeoutMs'
>

/**
 * 按 Hub 地址和能力 ID 隔离凭据，避免切换内网 Hub 后误用另一实例的账号。
 * @param base 已规范化的 Hub API 基址。
 * @param id 已通过校验的能力标识。
 * @returns 符合官方凭据键格式的哈希键；不包含明文 URL 或密码。
 */
function capabilityKey(base: string, id: string, workspace = '') {
  return credentialKey(
    'nova-hub',
    `cap-${createHash('sha256')
      .update(JSON.stringify(workspace ? [base, id, workspace] : [base, id]))
      .digest('hex')
      .slice(0, 32)}`,
  )
}

/**
 * 解码 Host 内部保存的公开参数和密钥；不向模型发布该记录。
 * @param record 官方凭据 grant 记录或 undefined。
 * @returns 两个独立分区；缺失记录返回空配置。
 */
function storedConfiguration(record: unknown): StoredConfiguration {
  if (record === undefined) return { values: {}, secrets: {} }
  const admitted = object(record)
  if (admitted.kind !== 'grant') throw new HubError('HUB_CREDENTIAL_UNAVAILABLE')
  const payload = object(admitted.payload)
  return { values: object(payload.values), secrets: object(payload.secrets) }
}

/**
 * 为界面生成脱敏表单，只返回已配置密钥的键名，绝不返回历史密钥值。
 * @param document 本次从 Hub 重新取得的权威能力声明。
 * @param saved Host 内部配置。
 * @returns 公开参数、受支持字段和保存状态；保存状态不代表安装成功。
 */
function publicForm(document: unknown, saved: StoredConfiguration) {
  const definitions = fields(document)
  const values: Record<string, unknown> = {},
    configuredSecrets: string[] = []
  const versions = object(document).versions
  if (!Array.isArray(versions)) throw new HubError('HUB_RESPONSE_INVALID')
  for (const field of definitions) {
    if (field.secret) {
      if (Object.hasOwn(saved.secrets, field.key)) configuredSecrets.push(field.key)
    } else if (Object.hasOwn(saved.values, field.key)) values[field.key] = saved.values[field.key]
  }
  return {
    capability: summary(document),
    fields: definitions,
    values,
    configuredSecrets,
    configurationSaved: saved.saved === true,
    versions: versions.map((item: unknown) => {
      const version = object(item)
      if (typeof version.version !== 'string') throw new HubError('HUB_RESPONSE_INVALID')
      return {
        version: version.version,
        hasRuntimeBinding: Boolean(object(version.runtimeBindings)['deepseek-harness']),
      }
    }),
  }
}

/**
 * 在官方已鉴权的连接服务上挂载精确路由；插件卸载时撤销全部路由贡献。
 * 配置提交会重新读取 Hub 声明并在原子凭据修改中校验，不信任浏览器给出的字段定义。
 * @param ctx 官方 Host 插件上下文和凭据 Provider。
 * @param options 管理员配置；令牌仅从指定 Host 环境变量读取，不接受界面修改。
 * @returns 路由与真实运行实例由 ctx.effect 管理；制品仅从部署允许的源下载。
 */
export function apply(ctx: Context, options: Config) {
  const credentials = protectedCredentials(
    ctx.credentials,
    options.secretProtection === 'windows-dpapi' ? windowsCredentialCipher(options.timeoutMs) : undefined,
  )
  const base = options.apiBaseUrl ? `${options.apiBaseUrl.replace(/\/+$/, '')}/` : ''
  const online = base
    ? new HubClient({
      apiBaseUrl: base,
      authentication: options.authentication,
      getAccessToken: () => Promise.resolve(process.env[options.tokenEnvironmentVariable]),
      timeoutMs: options.timeoutMs,
      maxResponseBytes: options.maxResponseBytes,
      allowInsecureHttp: options.allowInsecureHttp,
    })
    : undefined
  const client = online ? offlineClient(ctx, online, capabilityKey(base, 'hub-read-cache'), options) : undefined
  const readConfiguration = async (id: string) =>
    storedConfiguration(await credentials.readRecord(capabilityKey(base, id)))
  const lifecycle = capabilityLifecycle(
    ctx,
    options,
    client,
    capabilityKey(base, 'local-capability-state'),
    readConfiguration,
  )
  const projectLifecycles = new Map<string, ReturnType<typeof capabilityLifecycle>>()
  /** @param request 官方鉴权请求。 @returns 已验证项目的管理器与凭据地址，用户级记录保持兼容。 */
  function scoped(request: Request) {
    const scope = workspaceScope(ctx, new URL(request.url).searchParams.get('workspace') ?? '')
    let selected = scope.id ? projectLifecycles.get(scope.id) : lifecycle
    if (!selected) {
      selected = capabilityLifecycle(
        ctx,
        options,
        client,
        capabilityKey(base, 'local-capability-state', scope.id),
        async id => storedConfiguration(await credentials.readRecord(capabilityKey(base, id, scope.id))),
        lifecycle.access,
        scope,
      )
      projectLifecycles.set(scope.id, selected)
    }
    return { scope, lifecycle: selected, key: (id: string) => capabilityKey(base, id, scope.id) }
  }
  const roleService = roleRuntime(ctx, capabilityKey(base, 'local-role-templates'), lifecycle, options.teamProvider)
  ctx.on('agent/created', async ({ agent }) => {
    const workspace = agentWorkspace(agent, ctx)
    if (workspace && !projectLifecycles.has(workspace))
      await scoped(new Request(`http://harness.local/?workspace=${workspace}`)).lifecycle.restore()
  })
  const publisher = publicationService(options, online)
  if (ctx.get('tools')) new CapabilityTools(ctx, lifecycle.access, options)
  const drafts = resourceDrafts(ctx, credentials, capabilityKey(base, 'resource-drafts'), options)
  ctx.effect(
    () => async () => {
      await publisher.close()
      await roleService.close()
      for (const manager of projectLifecycles.values()) await manager.close()
      await lifecycle.close()
    },
    'harness capability runtime',
  )
  ctx.effect(() => {
    let cancelled = false
    const restore = () => {
      if (cancelled) return
      void (async () => {
        await roleService.restore()
        await lifecycle.restore()
        for (const workspace of workspaces(ctx)) {
          await scoped(new Request(`http://harness.local/?workspace=${workspace.id}`)).lifecycle.restore()
        }
      })().catch((error: unknown) => {
        ctx.logger.warn(
          'harness startup restore failed (%s)',
          error instanceof HubError ? error.code : 'HUB_OPERATION_FAILED',
        )
      })
    }
    // 正式桌面由官方启动器通知；独立 Loader 组合没有启动器时，在当前插件挂载完成后恢复。
    const ready = ctx.get('appReady')
    const dispose = ready ? ready.onReady(restore) : (queueMicrotask(restore), () => {})
    return () => {
      cancelled = true
      dispose()
    }
  }, 'harness startup restoration')
  /** @returns 管理员配置的连接；未配置时不访问网络，旧的用户连接记录不再参与连接选择。 */
  function connected() {
    if (!client) throw new HubError('HUB_NOT_CONFIGURED')
    return Promise.resolve({ record: { apiBaseUrl: base }, client })
  }
  /**
   * 解析有大小上限的 JSON 对象请求，拒绝数组、空值及过大载荷。
   * @param request 官方连接已缓冲的请求。
   * @returns 不可信输入对象，调用方仍需进行领域校验。
   */
  async function body(request: Request) {
    const raw = await request.arrayBuffer()
    if (raw.byteLength > options.maxRequestBytes) throw new HubError('HUB_REQUEST_TOO_LARGE')
    let value: unknown
    try {
      value = JSON.parse(new TextDecoder().decode(raw))
    } catch (_error) {
      throw new HubError('HUB_REQUEST_INVALID')
    }
    return object(value)
  }
  const routes: Record<string, (request: Request) => Promise<unknown>> = {
    integrations: async (request) => {
      const sdk = ctx.get('harnessCapabilities')
      if (!sdk) throw new HubError('HUB_BOARD_UNAVAILABLE')
      if (request.method === 'GET') return sdk.boardsList()
      const input = await body(request)
      return sdk.refreshBoard(capabilityId(input.id))
    },
    team: async (request) => {
      const input = request.method === 'POST' ? await body(request) : undefined
      const target = scoped(request),
        sessionId = input?.sessionId ?? new URL(request.url).searchParams.get('sessionId')
      if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 128)
        throw new HubError('HUB_REQUEST_INVALID')
      const agent = ctx
        .get('agents')
        ?.list()
        .find(item => item.id === sessionId)
      if (target.scope.id && agentWorkspace(agent, ctx) !== target.scope.id) throw new HubError('HUB_WORKSPACE_INVALID')
      return input ? roleService.worktree(sessionId, input) : roleService.team(sessionId)
    },
    drafts: async (request) => {
      const { scope } = scoped(request)
      if (request.method === 'GET') return drafts.list(scope.id)
      const input = await body(request)
      return input.action === 'remove' ? drafts.remove(input.draftId, scope.id) : drafts.get(input.draftId, scope.id)
    },
    workspaces: () => Promise.resolve(workspaces(ctx)),
    authoring: async (request) => {
      await connected()
      if (request.method === 'GET') return publisher.targets()
      const input = await body(request)
      if (input.action === 'template') return publisher.template(input)
      if (input.action === 'validate') return publisher.validate(input)
      if (input.action === 'publish') return publisher.publish(input)
      throw new HubError('HUB_REQUEST_INVALID')
    },
    installed: async (request) => {
      const { client } = await connected()
      return {
        data: await Promise.all(
          (await scoped(request).lifecycle.list()).map(async item => ({
            ...summary(await client.capability(item.id)),
            ...item,
          })),
        ),
      }
    },
    history: request => scoped(request).lifecycle.history(),
    lifecycle: async (request) => {
      await connected()
      return scoped(request).lifecycle.mutate(await body(request))
    },
    sessions: (request) => {
      const { scope } = scoped(request)
      return Promise.resolve(
        roleService.sessions().filter(
          item =>
            !scope.id ||
            agentWorkspace(
              ctx
                .get('agents')
                ?.list()
                .find(agent => agent.id === item.id),
              ctx,
            ) === scope.id,
        ),
      )
    },
    templates: async request =>
      request.method === 'GET' ? roleService.list() : roleService.save(await body(request)),
    'role-apply': async (request) => {
      const { client } = await connected()
      const input = await body(request)
      const target = scoped(request)
      if (
        Object.keys(input).some(key => !['roles', 'templateId', 'sessionId', 'team', 'task'].includes(key)) ||
        typeof input.sessionId !== 'string' ||
        input.sessionId.length > 128 ||
        typeof input.team !== 'boolean'
      )
        throw new HubError('HUB_REQUEST_INVALID')
      if (
        target.scope.id &&
        agentWorkspace(
          ctx
            .get('agents')
            ?.list()
            .find(agent => agent.id === input.sessionId),
          ctx,
        ) !== target.scope.id
      )
        throw new HubError('HUB_WORKSPACE_INVALID')
      const template = input.templateId
        ? (await roleService.list()).find(item => item.id === input.templateId)
        : undefined
      if (input.templateId && !template) throw new HubError('HUB_ROLE_SELECTION_INVALID')
      const selectedInput = template?.roles ?? input.roles
      if (!Array.isArray(selectedInput)) throw new HubError('HUB_ROLE_SELECTION_INVALID')
      const selected = selectedInput.map(capabilityId)
      if (
        !selected.length &&
        ['add', 'remove', 'disable', 'includeOptional'].some((key) => {
          const value = template?.[key as 'add' | 'remove' | 'disable' | 'includeOptional']
          return value && value.length > 0
        })
      )
        throw new HubError('HUB_ROLE_SELECTION_INVALID')
      const available = selected.length ? roleCatalog(await client.roles(request.signal)) : []
      const requestBody = selected.length
        ? roleRequest(
          {
            roles: selected,
            ...(template?.add ? { add: template.add } : {}),
            ...(template?.remove ? { remove: template.remove } : {}),
            ...(template?.disable ? { disable: template.disable } : {}),
            ...(template?.includeOptional ? { includeOptional: template.includeOptional } : {}),
          },
          available,
        )
        : undefined
      if (!requestBody && !template?.instructions) throw new HubError('HUB_ROLE_SELECTION_INVALID')
      const plan = requestBody
        ? rolePlan(await client.resolve(requestBody, request.signal))
        : {
          capabilities: [],
          permissions: [],
          missingRuntimeBindings: [],
          checksum: '',
        }
      const memberPlans = input.team
        ? await Promise.all(
          selected.map(async (id) => {
            const selection = roleRequest(
              {
                roles: [id],
                ...(template?.add ? { add: template.add } : {}),
                ...(template?.remove ? { remove: template.remove } : {}),
                ...(template?.disable ? { disable: template.disable } : {}),
              },
              available,
            )
            const initial = rolePlan(await client.resolve(selection, request.signal))
            const optional =
              template?.includeOptional?.filter(value => initial.optionalCapabilities.includes(value)) ?? []
            return {
              id,
              plan: optional.length
                ? rolePlan(await client.resolve({ ...selection, includeOptional: optional }, request.signal))
                : initial,
            }
          }),
        )
        : []
      return roleService.apply({
        lifecycle: target.lifecycle,
        sessionId: input.sessionId,
        team: input.team,
        task: input.task,
        template,
        roles: available.filter(role => selected.includes(role.id)),
        plan,
        memberPlans,
        timeoutMs: options.teamStartupTimeoutMs,
        resourceHome: options.resourceHome,
      })
    },
    roles: async (request) => {
      const { client } = await connected()
      return roleCatalog(await client.roles(request.signal))
    },
    'role-plan': async (request) => {
      const { client } = await connected()
      const input = await body(request)
      const available = roleCatalog(await client.roles(request.signal))
      return rolePlan(await client.resolve(roleRequest(input, available), request.signal))
    },
    connection: (request) => {
      if (request.method !== 'GET') throw new HubError('HUB_CONNECTION_MANAGED')
      return Promise.resolve({
        configured: Boolean(client),
        authentication: options.authentication,
        ...(workspaces(ctx).length ? { workspaces: workspaces(ctx) } : {}),
      })
    },
    catalog: async (request) => {
      const { client } = await connected()
      const params = new URL(request.url).searchParams
      const q = params.get('q') ?? '',
        type = params.get('type') ?? ''
      const page = Number(params.get('page') ?? 1)
      if (
        q.length > 500 ||
        (type && !['mcp', 'skill', 'plugin', 'agent', 'hook', 'policy', 'pack'].includes(type)) ||
        !Number.isSafeInteger(page) ||
        page < 1
      )
        throw new HubError('HUB_REQUEST_INVALID')
      const result = catalog(await client.search({ q, ...(type ? { type } : {}), page, pageSize: 20 }, request.signal))
      const installed = await scoped(request).lifecycle.list()
      return {
        ...result,
        ...client.status(),
        data: result.data.map(item => ({
          ...item,
          ...(installed.find(row => row.id === item.id) ?? {}),
        })),
      }
    },
    configuration: async (request) => {
      const { client } = await connected()
      const input = request.method === 'POST' ? await body(request) : undefined
      const id = capabilityId(input?.id ?? new URL(request.url).searchParams.get('id'))
      const document = await client.capability(id, request.signal)
      if (summary(document).id !== id) throw new HubError('HUB_RESPONSE_INVALID')
      const definitions = fields(document)
      const target = scoped(request)
      const key = target.key(id)
      if (input) {
        await target.lifecycle.configure(id, () =>
          credentials.modifyRecord(key, (current) => {
            const saved = storedConfiguration(current)
            const next = configuration(definitions, input.values, input.secrets, saved.secrets)
            return Promise.resolve({ kind: 'grant', payload: next })
          }),
        )
      }
      const savedRecord = await credentials.readRecord(key)
      const result = publicForm(document, {
        ...storedConfiguration(savedRecord),
        saved: savedRecord !== undefined,
      })
      const installed = (await target.lifecycle.list()).find(item => item.id === id)
      return {
        ...result,
        capability: { ...result.capability, ...(installed ?? {}) },
      }
    },
    'clear-secret': async (request) => {
      const input = await body(request),
        id = capabilityId(input.id)
      const { client } = await connected()
      const document = await client.capability(id)
      if (typeof input.key !== 'string' || !fields(document).some(field => field.key === input.key && field.secret))
        throw new HubError('HUB_REQUEST_INVALID')
      const secretKey = input.key
      const target = scoped(request)
      await target.lifecycle.configure(id, () =>
        credentials.modifyRecord(target.key(id), (current) => {
          const saved = storedConfiguration(current)
          const secrets = Object.fromEntries(Object.entries(saved.secrets).filter(([key]) => key !== secretKey))
          return Promise.resolve({
            kind: 'grant',
            payload: { ...saved, secrets },
          })
        }),
      )
      return { cleared: true }
    },
    readme: async (request) => {
      const { client } = await connected(),
        id = capabilityId(new URL(request.url).searchParams.get('id'))
      const value = object(await client.readme(id, request.signal))
      if (typeof value.content !== 'string' || value.content.length > options.maxResponseBytes)
        throw new HubError('HUB_RESPONSE_INVALID')
      return { content: value.content }
    },
  }
  for (const [path, handler] of Object.entries(routes)) {
    ctx.effect(
      () =>
        ctx.connection.fetch.register({
          path: `/api/nova-hub/${path}`,
          methods: ['role-plan', 'role-apply', 'lifecycle', 'clear-secret'].includes(path)
            ? ['POST']
            : ['catalog', 'roles', 'connection', 'installed', 'history', 'sessions', 'readme', 'workspaces'].includes(
              path,
            )
              ? ['GET']
              : ['GET', 'POST'],
          requestBody: 'buffered',
          fetch: async (request) => {
            try {
              const value = await handler(request)
              if (Buffer.byteLength(JSON.stringify({ ok: true, value }), 'utf8') > options.maxResponseBytes)
                throw new HubError('HUB_RESPONSE_TOO_LARGE')
              return Response.json({ ok: true, value }, { headers: { 'Cache-Control': 'no-store' } })
            } catch (error) {
              const sharedCodes: Record<string, string> = {
                PLAN_CONFLICT: 'HUB_PLAN_CONFLICT',
                COMPATIBILITY_ERROR: 'HUB_COMPATIBILITY_ERROR',
                INTEGRITY_FAILED: 'HUB_SOURCE_FAILED',
                UNTRUSTED_SOURCE: 'HUB_SOURCE_FAILED',
                SOURCE_UNAVAILABLE: 'HUB_SOURCE_FAILED',
                AUTH_REQUIRED: 'HUB_SOURCE_FAILED',
                AUTH_INVALID: 'HUB_SOURCE_FAILED',
                APPLY_FAILED: 'HUB_SOURCE_FAILED',
              }
              const sharedCode =
                error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : ''
              const code = error instanceof HubError ? error.code : (sharedCodes[sharedCode] ?? 'HUB_OPERATION_FAILED')
              // Provider 或服务端异常可能带有密钥，只记录稳定错误码，不复制原始异常。
              ctx.logger.warn('nova-hub: %s failed (%s)', path, code)
              return Response.json(
                {
                  ok: false,
                  error: {
                    code,
                    ...(error instanceof HubError && error.status !== undefined ? { status: error.status } : {}),
                  },
                },
                { status: 400, headers: { 'Cache-Control': 'no-store' } },
              )
            }
          },
        }),
      `nova-hub: ${path}`,
    )
  }
}
