/** 将顶层会话的实时回合结束传给 Electron；不发送提示词、回复或工具数据。 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-session'

/** 本地 IPC 的最小回合通知；会话标识不展示在系统通知中。 */
export interface DesktopTurnNotice {
  readonly type: 'turn-ended'
  readonly sessionId: string
  readonly turn: number
  readonly completed: boolean
}

/**
 * 订阅真实结束事件；历史恢复、回放和子 Agent 不触发通知。
 * @param ctx 订阅的生命周期所有者。
 * @param publish 主进程私有 IPC 发送函数。
 */
export function installDesktopTurnNotices(ctx: Context, publish: (notice: DesktopTurnNotice) => void): void {
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'turn/end' || session.header.origin === 'subagent') return
    if (event.data.reason.kind === 'interrupted' || event.data.reason.kind === 'forked') return
    publish({ type: 'turn-ended', sessionId: session.id, turn: event.data.turn,
      completed: event.data.reason.kind === 'completed' })
  })
}
