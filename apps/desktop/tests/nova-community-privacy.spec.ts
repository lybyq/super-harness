import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { NOVA_COMMUNITY_PACKAGE, NOVA_COMMUNITY_PATCH_PACKAGES } from '../src/nova-community.ts'

const modules = join(import.meta.dirname, '../../../node_modules/.pnpm/node_modules')

function clientSource(name: string): string {
  return readFileSync(join(modules, name, 'lib/client.js'), 'utf8')
}

describe('Nova published community client privacy patches', () => {
  it.each(NOVA_COMMUNITY_PATCH_PACKAGES)('%s never sends an automatic public heartbeat or creates a tracking id', (name) => {
    const functions = [...clientSource(name).matchAll(/function reportDailyHeartbeat[^\s(]*\(items\) \{[\s\S]*?\n\t\t\}/gu)]
    expect(functions.length).toBe(name === NOVA_COMMUNITY_PACKAGE ? 9 : 1)
    for (const [source] of functions) {
      expect(source).toMatch(/\{\s*\/\/ Nova:[^\n]+\n\s*return;/u)
      const effects = { requests: 0, storage: 0 }
      const heartbeat = runInNewContext(`(${source})`, {
        navigator: { webdriver: false }, crypto: { randomUUID: () => 'nova-test-visitor' },
        localStorage: {
          getItem: () => { effects.storage += 1; return null },
          setItem: () => { effects.storage += 1 },
          removeItem: () => { effects.storage += 1 }, length: 0,
        },
        fetch: () => { effects.requests += 1; return Promise.resolve({ ok: true }) },
      }, { timeout: 1000 }) as (items: readonly { name: string }[]) => void
      heartbeat([{ name: 'nova-test' }])
      expect(effects).toEqual({ requests: 0, storage: 0 })
    }
  })

  it.each([false, true])('mounts no family when row state is unavailable, but mounts explicitly active rows: %s', (known) => {
    const source = clientSource(NOVA_COMMUNITY_PACKAGE).match(/async function mountClientChildren\(ctx\) \{[\s\S]*?\n\t\t\}/u)?.[0]
    expect(source).toBeDefined()
    const mounted: object[] = []
    const reports: string[] = []
    const disposers: Array<() => void> = []
    const registry = new Set<string>()
    const name = '@linxin666/dsh-client-ui-task-board'
    const mount = runInNewContext(`(${source})`, {
      mountedRegistry: () => registry,
      fetchActiveRows: () => Promise.resolve(known ? new Set([name]) : undefined),
      ownClientEntryIds: () => new Set<string>(),
      clientChildren: [{ name, module: { inject: [], apply: () => undefined } }],
      console: { error: (message: string) => { reports.push(message) } },
    }, { timeout: 1000 }) as (ctx: {
      effect: (factory: () => () => void) => void
      plugin: (definition: object) => Promise<void>
    }) => Promise<void>
    return mount({
      effect: (factory) => { disposers.push(factory()) },
      plugin: (definition) => { mounted.push(definition); return Promise.resolve() },
    }).then(() => {
      expect(mounted.length).toBe(known ? 1 : 0)
      expect(reports.length).toBe(known ? 0 : 1)
      expect(registry.has(name)).toBe(known)
      for (const dispose of disposers) dispose()
      expect(registry.size).toBe(0)
    })
  })
})
