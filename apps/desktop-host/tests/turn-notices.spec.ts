import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import { expect, it } from 'vitest'
import { installDesktopTurnNotices, type DesktopTurnNotice } from '../src/turn-notices.ts'

it('reports live top-level endings without content, ignores child/recovery, and unregisters on disposal', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(SessionStore)
    const notices: DesktopTurnNotice[] = []
    const fiber = await ctx.plugin((scope) => { installDesktopTurnNotices(scope, notice => notices.push(notice)) })
    const root = ctx.sessions.create(SessionId('root'))
    const child = ctx.sessions.create(SessionId('child'), { meta: { origin: 'subagent' } })
    const fork = ctx.sessions.create(SessionId('fork'), { meta: { parentSession: root.id } })
    root.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    root.append('turn/end', { turn: 2, reason: { kind: 'error', error: { code: 'UNKNOWN', message: 'secret content' } } })
    child.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    root.append('turn/end', { turn: 3, reason: { kind: 'interrupted' } })
    fork.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    expect(notices).toEqual([
      { type: 'turn-ended', sessionId: root.id, turn: 1, completed: true },
      { type: 'turn-ended', sessionId: root.id, turn: 2, completed: false },
      { type: 'turn-ended', sessionId: fork.id, turn: 1, completed: true },
    ])
    expect(JSON.stringify(notices)).not.toContain('secret')
    await fiber.dispose()
    root.append('turn/end', { turn: 4, reason: { kind: 'completed' } })
    expect(notices).toHaveLength(3)
  } finally { await ctx.fiber.dispose() }
})
