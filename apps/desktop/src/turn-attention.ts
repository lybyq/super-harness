/** 后台回合通知；不泄露会话内容，不授权重试或执行任务。 */
import { Notification } from 'electron'
import type { DesktopLocale } from './locale.ts'

/** 只保留一条应用拥有的原生通知，点击仅返回工作台。 */
export class DesktopTurnAttention {
  private notification: Notification | undefined
  private disposed = false

  /** @param locale 当前语言。 @param foreground 当前是否前台。 @param open 返回桌面窗口。 */
  constructor(private readonly locale: () => DesktopLocale, private readonly foreground: () => boolean,
    private readonly open: () => void) {}

  /** @param completed 回合是否正常完成；错误、取消和阻塞不显示成功文案。 */
  ended(completed: boolean): void {
    if (this.disposed || this.foreground()) return
    this.clear()
    try {
      if (!Notification.isSupported()) return
      const { messages } = this.locale()
      const notice = new Notification({ title: messages.aboutProduct,
        body: completed ? messages.turnCompletedNotice : messages.turnStoppedNotice, silent: true })
      this.notification = notice
      notice.once('click', () => {
        if (this.disposed || this.notification !== notice) return
        this.clear()
        this.open()
      })
      notice.once('failed', () => { this.clear() })
      notice.show()
    } catch (error) { console.warn('desktop turn: notification unavailable', error); this.clear() }
  }

  /** 应用关闭后拒绝迟到回合，并释放通知监听。 */
  dispose(): void { this.disposed = true; this.clear() }

  private clear(): void {
    const notice = this.notification
    this.notification = undefined
    notice?.removeAllListeners()
    try { notice?.close() } catch (error) { console.warn('desktop turn: notification close failed', error) }
  }
}
