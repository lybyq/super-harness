import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { retryWindowsFuseOpen } from '../scripts/windows-fuse-retry.mjs'

const file = 'C:/fixture/application.exe'
function failure(code = 'UNKNOWN', syscall = 'open', path = file) {
  return Object.assign(new Error('fixture open failure'), { code, syscall, path })
}

describe('Windows Fuse executable open retry', () => {
  it('returns the original result without waiting', async () => {
    const wait = vi.fn(async () => undefined)
    expect(await retryWindowsFuseOpen(file, async () => 7,
      { platform: 'win32', inspect: async () => 'original', wait })).toBe(7)
    expect(wait).not.toHaveBeenCalled()
  })
  it('retries a matching open failure only after unchanged-file verification', async () => {
    const operation = vi.fn<() => Promise<number>>().mockRejectedValueOnce(failure()).mockResolvedValue(7)
    const inspect = vi.fn(async () => 'original'), wait = vi.fn(async () => undefined)
    expect(await retryWindowsFuseOpen(file, operation, { platform: 'win32', inspect, wait })).toBe(7)
    expect(inspect).toHaveBeenCalledTimes(2)
    expect(wait).toHaveBeenCalledWith(500)
    expect(operation).toHaveBeenCalledTimes(2)
  })
  it.each([failure('EACCES'), failure('UNKNOWN', 'write'), failure('UNKNOWN', 'open', 'C:/other.exe')])(
    'does not repeat unrelated or write failures', async (error) => {
      const operation = vi.fn(async () => { throw error }), wait = vi.fn(async () => undefined)
      await expect(retryWindowsFuseOpen(file, operation,
        { platform: 'win32', inspect: async () => 'original', wait })).rejects.toBe(error)
      expect(operation).toHaveBeenCalledTimes(1)
      expect(wait).not.toHaveBeenCalled()
    },
  )
  it('stops before repeating an operation when the executable changed', async () => {
    const inspect = vi.fn<() => Promise<string>>().mockResolvedValueOnce('original').mockResolvedValue('changed')
    const operation = vi.fn(async () => { throw failure() })
    await expect(retryWindowsFuseOpen(file, operation,
      { platform: 'win32', inspect, wait: async () => undefined })).rejects.toThrow('executable changed')
    expect(operation).toHaveBeenCalledTimes(1)
  })
  it('stops when executable state cannot be verified', async () => {
    const inspect = vi.fn<() => Promise<string>>().mockResolvedValueOnce('original').mockRejectedValue(new Error('unreadable'))
    const operation = vi.fn(async () => { throw failure() })
    await expect(retryWindowsFuseOpen(file, operation,
      { platform: 'win32', inspect, wait: async () => undefined })).rejects.toThrow('state cannot be verified')
    expect(operation).toHaveBeenCalledTimes(1)
  })
  it('retains the failure when the finite retry budget is exhausted', async () => {
    const error = failure(), operation = vi.fn(async () => { throw error })
    await expect(retryWindowsFuseOpen(file, operation,
      { platform: 'win32', inspect: async () => 'original', wait: async () => undefined, delays: [1] })).rejects.toBe(error)
    expect(operation).toHaveBeenCalledTimes(2)
  })
  it('does not inspect files or repeat operations outside Windows', async () => {
    const error = failure(), inspect = vi.fn(async () => 'original')
    await expect(retryWindowsFuseOpen(file, async () => { throw error }, { platform: 'darwin', inspect })).rejects.toBe(error)
    expect(inspect).not.toHaveBeenCalled()
  })
  it('uses real file bytes to reject mutation after a reported open failure', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'desktop-fuse-retry-'))
    const executable = join(directory, 'fixture.exe')
    try {
      await writeFile(executable, 'original')
      const operation = vi.fn(async () => {
        await writeFile(executable, 'changed!')
        throw failure('UNKNOWN', 'open', executable)
      })
      await expect(retryWindowsFuseOpen(executable, operation,
        { platform: 'win32', wait: async () => undefined })).rejects.toThrow('executable changed')
      expect(operation).toHaveBeenCalledTimes(1)
    } finally {
      await unlink(executable)
      await rmdir(directory)
    }
  })
})
