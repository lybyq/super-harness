import { afterEach, expect, it, vi } from 'vitest'
import { DesktopHostWatchdog, resolveDesktopWatchdog } from '../src/host-watchdog.ts'

afterEach(() => { vi.useRealTimers() })

it('uses deployment tunables and rejects malformed health settings', () => {
  expect(resolveDesktopWatchdog({})).toEqual({ intervalMs: 30_000, timeoutMs: 15_000, missLimit: 3 })
  expect(resolveDesktopWatchdog({ NOVA_DESKTOP_HEALTH_ENABLED: 'false' })).toBeUndefined()
  for (const environment of [{ NOVA_DESKTOP_HEALTH_ENABLED: 'maybe' }, { NOVA_DESKTOP_HEALTH_TIMEOUT_MS: '0' },
    { NOVA_DESKTOP_HEALTH_INTERVAL_MS: '1.5' }, { NOVA_DESKTOP_HEALTH_MISS_LIMIT: 'NaN' }]) {
    expect(() => resolveDesktopWatchdog(environment)).toThrow()
  }
})

it('resets misses after health and reports repeated loss only once', async () => {
  vi.useFakeTimers()
  const probe = vi.fn().mockRejectedValueOnce(new Error('miss')).mockResolvedValueOnce(undefined).mockRejectedValue(new Error('unresponsive'))
  const failed = vi.fn()
  const watchdog = new DesktopHostWatchdog({ intervalMs: 100, timeoutMs: 100, missLimit: 2 }, probe, failed)
  watchdog.start()
  await vi.advanceTimersByTimeAsync(300)
  expect(failed).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(500)
  expect(failed).toHaveBeenCalledOnce()
  expect(probe).toHaveBeenCalledTimes(4)
  watchdog.stop()
  await watchdog.settled()
})

it('never overlaps probes and ignores a late failure after stop', async () => {
  vi.useFakeTimers()
  const pending = Promise.withResolvers<undefined>()
  const failed = vi.fn()
  const probe = vi.fn(() => pending.promise)
  const watchdog = new DesktopHostWatchdog({ intervalMs: 100, timeoutMs: 100, missLimit: 1 }, probe, failed)
  watchdog.start()
  await vi.advanceTimersByTimeAsync(1000)
  expect(probe).toHaveBeenCalledOnce()
  watchdog.stop()
  pending.reject(new Error('late'))
  await watchdog.settled()
  expect(failed).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})
