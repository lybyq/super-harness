/** 会话生成资源只保存待检查草稿；不允许模型直接上传 npm/GitLab 或启动草稿代码。 */
import { randomUUID } from 'node:crypto'
import { HubError } from './hub-client.ts'
import { capabilityId, object } from './catalog.ts'
import { agentWorkspace } from './workspace.ts'
import type { Context } from '@deepseek-ai/cordis'
import type { CredentialKey, CredentialProvider } from '@deepseek-ai/dsh-credentials'
import type { Config } from './index.ts'

/** 待用户检查的 UTF-8 文本，不含下载地址或执行授权。 */
export interface ResourceDraft {
  draftId: string
  workspace: string
  sessionId: string
  createdAt: string
  id: string
  type: 'skill' | 'mcp' | 'plugin'
  version: string
  files: { path: string; content: string }[]
}

/** @param raw 模型或持久记录。 @param maxBytes 总字节预算。 @returns 无绝对路径、越界路径和重复文件的草稿。 */
export function draftContent(raw: unknown, maxBytes: number): Pick<ResourceDraft, 'id' | 'type' | 'version' | 'files'> {
  const input = object(raw, 'HUB_PUBLISH_MANIFEST_INVALID'),
    id = capabilityId(input.id)
  if (
    !['skill', 'mcp', 'plugin'].includes(String(input.type)) ||
    typeof input.version !== 'string' ||
    !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(input.version) ||
    !Array.isArray(input.files) ||
    !input.files.length ||
    input.files.length > 100
  )
    throw new HubError('HUB_PUBLISH_MANIFEST_INVALID')
  const paths = new Set<string>()
  const files = input.files.map((rawFile) => {
    const file = object(rawFile, 'HUB_PUBLISH_MANIFEST_INVALID')
    if (
      typeof file.path !== 'string' ||
      !/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(file.path) ||
      file.path.split('/').some(part => part === '.' || part === '..') ||
      paths.has(file.path.toLowerCase()) ||
      typeof file.content !== 'string' ||
      file.content.includes('\0')
    )
      throw new HubError('HUB_PUBLISH_MANIFEST_INVALID')
    paths.add(file.path.toLowerCase())
    return { path: file.path, content: file.content }
  })
  if (Buffer.byteLength(JSON.stringify({ id, type: input.type, version: input.version, files }), 'utf8') > maxBytes)
    throw new HubError('HUB_REQUEST_TOO_LARGE')
  return { id, type: input.type as ResourceDraft['type'], version: input.version, files }
}

/** @param ctx Host 上下文。 @param credentials 可加密的存储。 @param key 部署隔离记录。 @param options 草稿预算。 @returns 模型准备与用户读取入口；发布仍必须走用户确认。 */
export function resourceDrafts(
  ctx: Context,
  credentials: Pick<CredentialProvider, 'readRecord' | 'modifyRecord'>,
  key: CredentialKey,
  options: Pick<Config, 'maxRequestBytes'>,
) {
  const parse = (record: unknown): ResourceDraft[] => {
    if (!record) return []
    const payload = object(object(record).payload)
    if (!Array.isArray(payload.drafts) || payload.drafts.length > 20) throw new HubError('HUB_LOCAL_STATE_INVALID')
    return payload.drafts.map((raw) => {
      const item = object(raw)
      for (const name of ['draftId', 'sessionId', 'createdAt', 'workspace'])
        if (typeof item[name] !== 'string') throw new HubError('HUB_LOCAL_STATE_INVALID')
      return {
        ...draftContent(item, options.maxRequestBytes),
        draftId: String(item.draftId),
        sessionId: String(item.sessionId),
        createdAt: String(item.createdAt),
        workspace: String(item.workspace),
      }
    })
  }
  const read = async () => parse(await credentials.readRecord(key))
  const service = {
    /** @param raw 模型生成的文本文件。 @param sessionId 真实工具调用会话。 @returns 脱敏草稿标识，无远端写入。 */
    async prepare(raw: unknown, sessionId: string) {
      const agent = ctx
        .get('agents')
        ?.list()
        .find(item => item.id === sessionId)
      if (!agent) throw new HubError('HUB_SESSION_NOT_IDLE')
      const draft = {
        ...draftContent(raw, options.maxRequestBytes),
        draftId: randomUUID(),
        sessionId,
        workspace: agentWorkspace(agent, ctx),
        createdAt: new Date().toISOString(),
      }
      if (Buffer.byteLength(JSON.stringify(draft), 'utf8') > options.maxRequestBytes)
        throw new HubError('HUB_REQUEST_TOO_LARGE')
      await credentials.modifyRecord(key, record =>
        Promise.resolve({ kind: 'grant', payload: { drafts: [...parse(record), draft].slice(-20) } }),
      )
      return { draftId: draft.draftId, id: draft.id, version: draft.version, reviewRequired: true }
    },
    /** @param workspace 当前选择的项目。 @returns 不含文件正文的列表；不显示其他项目的草稿。 */
    async list(workspace: string) {
      return (await read()).filter(item => item.workspace === workspace).map(({ files: _files, ...item }) => item)
    },
    /** @param draftId 用户选中的草稿。 @param workspace 当前项目。 @returns 仅供用户检查的文件；不能跨项目取草稿。 */
    async get(draftId: unknown, workspace: string) {
      const draft = (await read()).find(item => item.draftId === draftId && item.workspace === workspace)
      if (!draft) throw new HubError('HUB_PUBLISH_DRAFT_CHANGED')
      return draft
    },
    /** @param draftId 用户明确删除的草稿。 @param workspace 当前项目。 @returns 只删除当前项目记录，不触碰远端资源。 */
    async remove(draftId: unknown, workspace: string) {
      await credentials.modifyRecord(key, (record) => {
        const current = parse(record)
        if (!current.some(item => item.draftId === draftId && item.workspace === workspace))
          throw new HubError('HUB_PUBLISH_DRAFT_CHANGED')
        return Promise.resolve({
          kind: 'grant',
          payload: { drafts: current.filter(item => !(item.draftId === draftId && item.workspace === workspace)) },
        })
      })
      return this.list(workspace)
    },
  }
  // 工具服务可能晚于企业插件就绪；按原生依赖生命周期挂载，不能只在启动瞬间检查一次。
  ctx.inject(['tools'], (toolCtx) => {
    toolCtx.effect(
      () =>
        toolCtx.tools.register({
          name: 'harness_prepare_resource',
          description:
            '将用户请求创建的 skill、MCP 或 Host 插件文本保存为待检查草稿。不会执行代码或发布；用户在 AI Hub 的开发与发布中检查、配置目标并明确确认。不能包含密码或 Token。',
          parameters: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              type: { type: 'string', enum: ['skill', 'mcp', 'plugin'] },
              version: { type: 'string' },
              files: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { path: { type: 'string' }, content: { type: 'string' } },
                  required: ['path', 'content'],
                  additionalProperties: false,
                },
              },
            },
            required: ['id', 'type', 'version', 'files'],
            additionalProperties: false,
          },
          output: {
            schema: {
              type: 'object',
              properties: {
                draftId: { type: 'string' },
                id: { type: 'string' },
                version: { type: 'string' },
                reviewRequired: { type: 'boolean' },
              },
              required: ['draftId', 'id', 'version', 'reviewRequired'],
              additionalProperties: false,
            },
            render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
          },
          execute: (args, exec) => service.prepare(args, exec.agent?.id ?? ''),
        }),
      'harness resource draft tool',
    )
  })
  return service
}
