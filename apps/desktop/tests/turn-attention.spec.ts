import { afterEach, expect, it, vi } from 'vitest'
import { DesktopTurnAttention } from '../src/turn-attention.ts'
import { resolveDesktopLocale } from '../src/locale.ts'

const native = await vi.hoisted(async () => {
  const { EventEmitter } = await import('node:events')
  const notices: Notice[] = []
  class Notice extends EventEmitter {
    static isSupported = () => true
    show = vi.fn()
    close = vi.fn()
    constructor(readonly options: object) { super(); notices.push(this) }
  }
  return { notices, Notice }
})
vi.mock('electron', () => ({ Notification: native.Notice }))
afterEach(() => { native.notices.length = 0 })

it('stays silent in foreground and shows only generic localized outcomes in background', () => {
  let foreground = true
  const open = vi.fn()
  const attention = new DesktopTurnAttention(() => resolveDesktopLocale('zh'), () => foreground, open)
  attention.ended(true)
  expect(native.notices).toHaveLength(0)
  foreground = false
  attention.ended(true)
  expect(native.notices[0]!.options).toEqual({ title: 'Nova', body: '回合已完成，点击返回 Nova。', silent: true })
  attention.ended(false)
  expect(native.notices[0]!.close).toHaveBeenCalledOnce()
  expect(native.notices[1]!.options).toEqual({ title: 'Nova', body: '回合已停止或需要处理，请返回 Nova 查看。', silent: true })
  native.notices[1]!.emit('click')
  expect(open).toHaveBeenCalledOnce()
  attention.dispose()
  attention.ended(true)
  expect(native.notices).toHaveLength(2)
})
