import type { MenuItemConstructorOptions } from 'electron'
import { afterEach, expect, it, vi } from 'vitest'
import { resolveDesktopLocale } from '../src/locale.ts'
import { DesktopTray } from '../src/tray.ts'

const native = await vi.hoisted(async () => {
  const { EventEmitter } = await import('node:events')
  const trays: FakeTray[] = []
  class FakeTray extends EventEmitter {
    readonly setToolTip = vi.fn()
    readonly setContextMenu = vi.fn()
    readonly destroy = vi.fn()
    constructor(readonly image: unknown) { super(); trays.push(this) }
  }
  const menus: MenuItemConstructorOptions[][] = []
  return {
    trays, FakeTray, menus,
    createFromPath: vi.fn((path: string) => ({ path })),
    buildFromTemplate: vi.fn((template: MenuItemConstructorOptions[]) => { menus.push(template); return { template } }),
  }
})
vi.mock('electron', () => ({
  Tray: native.FakeTray,
  nativeImage: { createFromPath: native.createFromPath },
  Menu: { buildFromTemplate: native.buildFromTemplate },
}))

afterEach(() => { native.trays.length = 0; native.menus.length = 0; vi.clearAllMocks() })

function setup(locale = 'en') {
  let current = resolveDesktopLocale(locale)
  const open = vi.fn()
  const quit = vi.fn()
  const tray = new DesktopTray({ iconPath: 'C:/app/resources/tray.ico', locale: () => current, open, quit })
  return { tray, open, quit, native: native.trays[0]!, setLocale: (next: string) => { current = resolveDesktopLocale(next) } }
}

function labels(menu: MenuItemConstructorOptions[]): (string | undefined)[] {
  return menu.map(item => item.type === 'separator' ? 'separator' : item.label)
}

it('shows the application icon with its name as the tooltip and an Open / Quit menu', () => {
  const f = setup()
  expect(native.createFromPath).toHaveBeenCalledWith('C:/app/resources/tray.ico')
  expect(f.native.image).toEqual({ path: 'C:/app/resources/tray.ico' })
  expect(f.native.setToolTip).toHaveBeenCalledWith('Nova')
  expect(labels(native.menus[0]!)).toEqual(['Open Nova', 'separator', 'Quit Nova'])
  expect(f.native.setContextMenu).toHaveBeenCalledWith({ template: native.menus[0] })
})

it('opens the window on a single click and routes menu entries to the open and quit actions', () => {
  const f = setup()
  f.native.emit('click')
  expect(f.open).toHaveBeenCalledOnce()
  const menu = native.menus[0]!
  ;(menu[0] as { click: () => void }).click()
  ;(menu[2] as { click: () => void }).click()
  expect(f.open).toHaveBeenCalledTimes(2)
  expect(f.quit).toHaveBeenCalledOnce()
})

it('relabels the menu in the current locale and ignores relabel after disposal', () => {
  const f = setup()
  f.setLocale('zh')
  f.tray.relabel()
  expect(labels(native.menus[1]!)).toEqual(['打开 Nova', 'separator', '退出 Nova'])
  f.tray.dispose()
  f.tray.dispose()
  expect(f.native.destroy).toHaveBeenCalledOnce()
  f.tray.relabel()
  expect(native.menus).toHaveLength(2)
})

it('exposes registered profiles, current selection, registration, and local diagnostics', () => {
  const select = vi.fn()
  const add = vi.fn()
  const diagnostics = vi.fn()
  const tray = new DesktopTray({ iconPath: 'icon.ico', locale: () => resolveDesktopLocale('zh'),
    open: vi.fn(), quit: vi.fn(), diagnostics,
    profiles: { list: () => [{ id: 'default', label: 'default' }, { id: 'research', label: '研究' }],
      current: () => 'research', select, add } })
  const menu = native.menus[0]!
  expect(labels(menu)).toEqual(['打开 Nova', '导出诊断 ZIP…', '环境 / Profile', 'separator', '退出 Nova'])
  const profiles = menu[2]!.submenu as MenuItemConstructorOptions[]
  expect(profiles[0]!.label).toBe('默认环境')
  expect(profiles[1]!.checked).toBe(true)
  ;(profiles[0] as { click: () => void }).click()
  ;(profiles[3] as { click: () => void }).click()
  ;(menu[1] as { click: () => void }).click()
  expect(select).toHaveBeenCalledWith('default')
  expect(add).toHaveBeenCalledOnce()
  expect(diagnostics).toHaveBeenCalledOnce()
  tray.dispose()
})
