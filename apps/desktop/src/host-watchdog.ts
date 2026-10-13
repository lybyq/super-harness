/** Host 健康探测的生命周期；故障交给已有恢复对话框，不自动重放任务。 */

/** 健康探测参数；超时由调用方执行的探测控制。 */
export interface DesktopWatchdogConfig {
  readonly intervalMs: number
  readonly timeoutMs: number
  readonly missLimit: number
}

/**
 * 从部署环境解析看门狗参数；非法配置在启动时拒绝，不静默放宽。
 * @param environment 桌面启动环境；NOVA_DESKTOP_HEALTH_ENABLED=false 可显式关闭。
 * @returns 已校验参数，关闭时为 undefined。
 */
export function resolveDesktopWatchdog(environment: NodeJS.ProcessEnv): DesktopWatchdogConfig | undefined {
  const enabled = environment.NOVA_DESKTOP_HEALTH_ENABLED
  if (enabled === 'false') return undefined
  if (enabled !== undefined && enabled !== 'true') throw new Error('NOVA_DESKTOP_HEALTH_ENABLED must be true or false')
  const positive = (name: string, fallback: number): number => {
    const value = environment[name] === undefined ? fallback : Number(environment[name])
    if (!Number.isSafeInteger(value) || value <= 0 || value > 3_600_000) throw new Error(`${name} must be a positive integer at most 3600000`)
    return value
  }
  return { intervalMs: positive('NOVA_DESKTOP_HEALTH_INTERVAL_MS', 30_000),
    timeoutMs: positive('NOVA_DESKTOP_HEALTH_TIMEOUT_MS', 15_000),
    missLimit: positive('NOVA_DESKTOP_HEALTH_MISS_LIMIT', 3) }
}

/** 不重叠的探测循环；连续失败才报告一次，停止后不接收迟到结果。 */
export class DesktopHostWatchdog {
  private timer: ReturnType<typeof setTimeout> | undefined
  private stopped = true
  private misses = 0
  private pending: Promise<void> | undefined

  /** @param config 已解析参数。 @param probe 带超时的 Host 探测。 @param failed 一次性故障报告。 */
  constructor(private readonly config: DesktopWatchdogConfig,
    private readonly probe: () => Promise<void>, private readonly failed: (error: Error) => void) {}

  /** Host ready 后开始；同一实例不能用于多个 Host 生命周期。 */
  start(): void {
    if (!this.stopped || this.pending !== undefined) return
    this.stopped = false
    this.schedule()
  }

  /** 停止计时；当前探测的迟到结果不再改变状态。 */
  stop(): void {
    this.stopped = true
    clearTimeout(this.timer)
    this.timer = undefined
  }

  /** @returns 当前探测已经结束；调用方应先结束或取消底层控制请求。 */
  async settled(): Promise<void> { await this.pending }

  private schedule(): void {
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.pending = this.check().finally(() => { this.pending = undefined })
    }, this.config.intervalMs)
    this.timer.unref()
  }

  private async check(): Promise<void> {
    let failure: unknown
    try { await this.probe(); this.misses = 0 } catch (error) { failure = error; this.misses += 1 }
    if (this.stopped) return
    if (this.misses >= this.config.missLimit) {
      this.stop()
      try { this.failed(new Error('Desktop Host health check failed repeatedly; restart explicitly from recovery without replaying tools.', { cause: failure })) }
      catch (error) { console.error('desktop watchdog: failure report failed', error) }
      return
    }
    this.schedule()
  }
}
