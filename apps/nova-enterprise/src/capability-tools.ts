/** 作者 SDK：通过官方工具注册表登记精确能力归属，后续动态注册与卸载同样受角色限制。 */
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { RoleAccess } from './role-access.ts'
import { HubError } from './hub-client.ts'
import { boardService, issueBoard } from './board-provider.ts'
import type { BoardOptions } from './board-provider.ts'
import type { Config } from './index.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    harnessCapabilities: CapabilityTools
    harnessCapabilityOwner?: { id: string; workspace: string }
  }
}

/** Host 插件使用 ctx.harnessCapabilities.registerTool，不以工具注册时间猜测能力归属。 */
export class CapabilityTools extends Service {
  private readonly boards = new Map<string, ReturnType<typeof issueBoard>>()
  /** @param ctx Host 上下文。 @param access 权限归属管理器。 @param limits 部署提供的网络边界；省略时禁用任务板来源。 */
  constructor(
    ctx: Context,
    private readonly access: RoleAccess,
    private readonly limits?: Pick<Config, 'timeoutMs' | 'maxResponseBytes' | 'allowInsecureHttp'>,
  ) {
    super(ctx, 'harnessCapabilities')
  }

  /** @param options 当前插件的已配置 Jira/GitLab 账户。 @returns effect 所有的只读任务板来源；用户显式刷新，不自动访问网络。 */
  connectBoard(options: BoardOptions) {
    const owner = this.ctx.harnessCapabilityOwner,
      board = boardService(this.ctx.get('taskBoard'))
    if (!owner || owner.workspace || !board || !this.limits) throw new HubError('HUB_BOARD_UNAVAILABLE')
    const id = `${owner.id}-${options.kind}`,
      source = issueBoard(id, options, this.limits)
    if (this.boards.has(id)) throw new HubError('HUB_BOARD_CONFIGURATION_INVALID')
    const unregister = board.registerExtension(source.extension)
    this.boards.set(id, source)
    return this.ctx.effect(
      () => async () => {
        unregister()
        this.boards.delete(id)
        await source.close()
      },
      'harness issue board provider',
    )
  }
  /** @returns 本机启用的只读来源摘要，不返回地址、账号或令牌。 */
  boardsList() {
    return [...this.boards.keys()].map(id => ({ id }))
  }
  /** @param id 用户选择的已注册来源。 @returns 刷新回执，不把远端文本当指令，不写 Jira/GitLab。 */
  refreshBoard(id: string) {
    const source = this.boards.get(id)
    if (!source) throw new HubError('HUB_BOARD_UNAVAILABLE')
    return source.refresh()
  }

  /** @param definition 官方工具定义。 @returns 随调用插件 effect 撤销的注册；卸载后刷新角色可见范围。 */
  registerTool(definition: ToolDefinition): () => Promise<void> {
    const owner = this.ctx.harnessCapabilityOwner
    if (!owner) throw new HubError('HUB_TOOL_OWNER_REQUIRED')
    const tools = this.ctx.get('tools')
    if (!tools) throw new HubError('HUB_RUNTIME_UNSUPPORTED')
    const unregister = tools.register(definition)
    this.access.updateTool(owner.id, definition.name, true, owner.workspace)
    return this.ctx.effect(
      () => () => {
        unregister()
        this.access.updateTool(owner.id, definition.name, false, owner.workspace)
      },
      'harness owned tool',
    )
  }
}
