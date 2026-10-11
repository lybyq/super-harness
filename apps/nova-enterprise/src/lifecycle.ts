/** 能力生命周期协调：下载与版本解析复用 Hub 引擎，真实激活使用官方 Provider，提交失败恢复旧实例。 */
import { mkdir } from 'node:fs/promises'
import { capabilityEngine } from './capability-engine.ts'
import { capabilityId, configuration, fields, object } from './catalog.ts'
import { HubError } from './hub-client.ts'
import { runtimeProvider } from './runtime-provider.ts'
import { roleAccess } from './role-access.ts'
import type { Context } from '@deepseek-ai/cordis'
import type { CredentialKey } from '@deepseek-ai/dsh-credentials'
import type { HubClient } from './hub-client.ts'
import type { Config } from './index.ts'
import type { CapabilityEngine } from './capability-engine.ts'
import type { DesiredState, InstallReceipt } from './engine-types.ts'
import type { StoredConfiguration, InstalledCapability } from './types.ts'

/** 本地脱敏历史；desired 在共享 Schema 解析后才可用于恢复运行实例。 */
interface Revision {
  id: string
  date: string
  desired: unknown
  receipts: Record<string, unknown>
}
/** 生命周期拥有的凭据记录结构，运行状态 outcomes 不持久化。 */
interface LocalState {
  desired: DesiredState | undefined
  receipts: Record<string, unknown>
  history: Revision[]
}

/**
 * 创建串行的桌面能力管理器；卸载等待已开始操作结束，阻止新操作，并释放全部运行实例。
 * @param ctx 官方上下文。
 * @param options 管理员部署配置。
 * @param client Host Hub 客户端。
 * @param key 按 Hub 隔离的凭据状态键。
 * @param readConfiguration 仅供 Host 读取的配置函数。
 * @returns 生命周期、只读状态、历史和重载接口；返回值均不含秘密。
 */
export function capabilityLifecycle(
  ctx: Context,
  options: Config,
  client: Pick<HubClient, 'capability'> | undefined,
  key: CredentialKey,
  readConfiguration: (id: string) => Promise<StoredConfiguration>,
  sharedAccess?: ReturnType<typeof roleAccess>,
  workspace?: { id: string; cwd: string },
) {
  const access = sharedAccess ?? roleAccess(ctx),
    runtime = runtimeProvider(ctx, options, access, workspace),
    outcomes = new Map<string, string>()
  let pending: Promise<unknown> = Promise.resolve(),
    closed = false,
    enginePromise: Promise<CapabilityEngine> | undefined
  const engine = () =>
    (enginePromise ??= capabilityEngine(options, client).catch((error: unknown) => {
      enginePromise = undefined
      throw error
    }))
  const read = async (): Promise<LocalState> => {
    const record = await ctx.credentials.readRecord(key)
    if (!record) return { desired: undefined, receipts: {}, history: [] }
    if (record.kind !== 'grant') throw new HubError('HUB_LOCAL_STATE_INVALID')
    const state = object(record.payload, 'HUB_LOCAL_STATE_INVALID')
    if (!Array.isArray(state.history)) throw new HubError('HUB_LOCAL_STATE_INVALID')
    const receipts = object(state.receipts, 'HUB_LOCAL_STATE_INVALID')
    const history = state.history.map((input: unknown): Revision => {
      const item = object(input, 'HUB_LOCAL_STATE_INVALID')
      if (typeof item.id !== 'string' || typeof item.date !== 'string') throw new HubError('HUB_LOCAL_STATE_INVALID')
      return {
        id: item.id,
        date: item.date,
        desired: item.desired,
        receipts: object(item.receipts, 'HUB_LOCAL_STATE_INVALID'),
      }
    })
    let desired: DesiredState | undefined
    if (state.desired) {
      try {
        desired = (await engine()).parseState(state.desired)
      } catch (_error) {
        throw new HubError('HUB_LOCAL_STATE_INVALID')
      }
    }
    return { desired, receipts, history }
  }
  const write = (state: LocalState) =>
    ctx.credentials.modifyRecord(key, () => Promise.resolve({ kind: 'grant', payload: state }))
  /** @param action 操作回调。 @returns 串行执行结果，前一失败不阻塞后续操作。 */
  function serial<T>(action: () => Promise<T>): Promise<T> {
    if (closed) throw new HubError('HUB_CANCELLED')
    const result = pending.then(action)
    pending = result.catch(() => undefined)
    return result
  }
  /** @param state 已提交的本地状态。 @returns 按依赖顺序恢复或激活；缺参保留下载收据。 */
  async function reconcile(state: LocalState, tolerateFailure = false) {
    if (!client) throw new HubError('HUB_NOT_CONFIGURED')
    const e = await engine()
    for (const item of state.desired?.capabilities ?? []) {
      if (!item.enabled) {
        outcomes.set(item.id, 'disabled')
        continue
      }
      try {
        const document = e.parseCapability(await client.capability(item.id))
        const version = document.versions.find(version => version.version === item.version)
        if (!version?.runtimeBindings['deepseek-harness']) throw new HubError('HUB_RUNTIME_UNSUPPORTED')
        if (
          version.dependencies.some(dependency => !dependency.optional && outcomes.get(dependency.id) !== 'active')
        ) {
          outcomes.set(item.id, 'dependency-not-ready')
          continue
        }
        const saved = await readConfiguration(item.id)
        const validated = configuration(fields(document), saved.values, {}, saved.secrets)
        // 永远由下载器重新校验不可变缓存，不信任凭据记录中的可执行路径。
        const receipt = {
          ...(await e.artifact.install(document, version)),
          version: item.version,
        }
        outcomes.set(item.id, await runtime.activate(document, receipt, validated, e))
      } catch (error) {
        if (error instanceof HubError && error.code === 'HUB_CONFIGURATION_REQUIRED') {
          outcomes.set(item.id, 'needs-configuration')
          continue
        }
        outcomes.set(item.id, 'failed')
        if (!tolerateFailure) throw error
        ctx.logger.warn('harness restore failed: %s', item.id)
      }
    }
  }
  /** @returns 精确版本与本进程观察的运行状态；重启后不复用旧 active 声明。 */
  async function list(): Promise<InstalledCapability[]> {
    const state = await read()
    return (state.desired?.capabilities ?? []).map(item => ({
      id: item.id,
      version: item.version,
      enabled: item.enabled,
      installed: true,
      activation: outcomes.get(item.id) ?? (item.enabled ? 'downloaded' : 'disabled'),
    }))
  }
  return {
    /** @returns 等待恢复／变更操作收尾，再返回稳定的激活证据，不暴露半恢复快照。 */
    async list() {
      await pending
      return list()
    },
    access,
    /**
     * @param id 精确能力标识。
     * @param update 原子配置修改，只有 Host 可以读取旧密钥。
     * @returns 配置提交后加载新实例；失败明确标为 failed，不继续使用旧凭据。
     */
    configure(id: string, update: () => Promise<unknown>) {
      return serial(async () => {
        const state = await read(),
          selected = state.desired?.capabilities.find(item => item.id === id)
        if (!selected) {
          await update()
          return
        }
        await runtime.close()
        outcomes.clear()
        try {
          await update()
        } catch (error) {
          try {
            await reconcile(state)
          } catch (_restoreError) {
            outcomes.set(id, 'failed')
            throw new HubError('HUB_ROLLBACK_FAILED')
          }
          throw error
        }
        try {
          await reconcile(state, true)
          if (outcomes.get(id) === 'failed') throw new HubError('HUB_CONFIGURATION_ACTIVATION_FAILED')
        } catch (_error) {
          outcomes.set(id, 'failed')
          throw new HubError('HUB_CONFIGURATION_ACTIVATION_FAILED')
        }
      })
    },
    /** @returns 无参数值或密钥的回滚历史。 */
    async history() {
      await pending
      return (await read()).history.map(item => ({
        id: item.id,
        date: item.date,
      }))
    },
    /** @returns 恢复已保存能力；单项错误返回 failed，日志仅稳定码。 */
    restore() {
      return serial(async () => {
        const state = await read()
        if (state.desired?.capabilities.length) {
          await reconcile(state, true)
        }
        return { data: await list() }
      })
    },
    /** @returns 等待本管理器所有操作和官方实例清理完成。 */
    async close() {
      closed = true
      await pending
      await runtime.close(true)
    },
    /**
     * @param raw 安装、更新、启停、删除或回滚请求，版本来自 Hub 精确声明。
     * @returns 已提交的安装收据和脱敏状态；失败恢复旧状态，恢复失败显式报告。
     */
    mutate(raw: unknown) {
      return serial(async () => {
        const input = object(raw, 'HUB_REQUEST_INVALID')
        const allowed = ['add', 'update', 'remove', 'enable', 'disable', 'reload', 'rollback']
        if (
          typeof input.action !== 'string' ||
          !allowed.includes(input.action) ||
          Object.keys(input).some(key => !['id', 'action', 'version'].includes(key))
        )
          throw new HubError('HUB_REQUEST_INVALID')
        if (
          input.version !== undefined &&
          (typeof input.version !== 'string' || input.version.length > 128 || !['add', 'update'].includes(input.action))
        )
          throw new HubError('HUB_REQUEST_INVALID')
        const id = input.action === 'rollback' ? '' : capabilityId(input.id)
        const e = await engine()
        if (!client) throw new HubError('HUB_NOT_CONFIGURED')
        await mkdir(options.resourceHome, { recursive: true })
        const lock = e.lock()
        await lock.acquire()
        try {
          const before = await read()
          const current = before.desired ?? e.empty()
          let desired: DesiredState
          if (input.action === 'rollback') {
            const last = before.history.at(-1)
            if (!last) throw new HubError('HUB_HISTORY_EMPTY')
            desired = e.parseState(last.desired ?? e.empty())
          } else if (input.action === 'add') desired = await e.manager.add(current, id, input.version)
          else if (input.action === 'update') desired = await e.manager.update(current, id, input.version)
          else if (input.action === 'remove') desired = await e.manager.remove(current, id)
          else if (input.action === 'enable' || input.action === 'disable')
            desired = await e.manager.setEnabled(current, id, input.action === 'enable')
          else desired = current
          const receipts: Record<string, InstallReceipt> = {}
          for (const item of desired.capabilities) {
            const document = e.parseCapability(await client.capability(item.id))
            const version = document.versions.find(version => version.version === item.version)
            if (!version?.runtimeBindings['deepseek-harness']) throw new HubError('HUB_RUNTIME_UNSUPPORTED')
            receipts[item.id] = {
              ...(await e.artifact.install(document, version)),
              version: item.version,
            }
          }
          const next = {
            desired,
            receipts,
            history:
              input.action === 'rollback'
                ? before.history.slice(0, -1)
                : [
                  ...before.history,
                  {
                    id: `${Date.now()}`,
                    date: new Date().toISOString(),
                    desired: before.desired ?? e.empty(),
                    receipts: before.receipts,
                  },
                ].slice(-options.maxHistory),
          }
          // 下载可以留下可复用的不可变缓存；只有完整激活/待配置结果才提交用户期望状态。
          try {
            await runtime.close()
            outcomes.clear()
            await reconcile(next)
            await write(next)
          } catch (error) {
            try {
              await runtime.close()
              outcomes.clear()
              if (before.desired) await reconcile(before)
            } catch (_restoreError) {
              throw new HubError('HUB_ROLLBACK_FAILED')
            }
            throw error
          }
          return { data: await list() }
        } finally {
          await lock.release()
        }
      })
    },
  }
}

/** 运行期生命周期签名，与角色调用和 Host 路由保持一致。 */
export type CapabilityLifecycle = ReturnType<typeof capabilityLifecycle>
