/** Windows system tray: the always-present way back to a hidden window and the explicit quit entry. */

import { Menu, nativeImage, Tray } from 'electron'
import type { DesktopLocale } from './locale.ts'

/** Main-process actions the tray triggers; both run the same paths as the window and application menu. */
export interface DesktopTrayOptions {
  /** Multi-size ICO rendered by `scripts/render-tray-icon.ts`; Windows picks the bitmap for the display scale. */
  readonly iconPath: string
  readonly locale: () => DesktopLocale
  /** Show and focus the primary window. */
  readonly open: () => void
  /** Request quit through the same confirmation as every other quit entry. */
  readonly quit: () => void
  /** 用户主动导出本地诊断包；不触发上传。 */
  readonly diagnostics?: () => void
  /** 已注册环境及切换行为，标签由清单和桌面语言决定。 */
  readonly profiles?: {
    readonly list: () => readonly { id: string; label: string }[]
    readonly current: () => string
    readonly select: (id: string) => void
    readonly add: () => void
  }
}

/** Tray icon present for the whole run, not only while the window is hidden. */
export class DesktopTray {
  private tray: Tray | undefined

  /** @param options - Icon path, locale reader, and the open and quit actions. */
  constructor(private readonly options: DesktopTrayOptions) {
    const tray = new Tray(nativeImage.createFromPath(options.iconPath))
    this.tray = tray
    tray.on('click', () => { options.open() })
    this.relabel()
  }

  /** Rebuild the tooltip and context menu in the current locale. */
  relabel(): void {
    const tray = this.tray
    if (tray === undefined) return
    const { messages } = this.options.locale()
    tray.setToolTip(messages.aboutProduct)
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: messages.openApplication, click: () => { this.options.open() } },
      ...this.options.diagnostics === undefined ? [] : [{ label: messages.diagnosticsMenu,
        click: () => { this.options.diagnostics?.() } }],
      ...this.options.profiles === undefined ? [] : [{ label: messages.profilesMenu, submenu: [
        ...this.options.profiles.list().map(profile => ({ type: 'radio' as const,
          label: profile.id === 'default' ? messages.profileDefault : profile.label,
          checked: profile.id === this.options.profiles?.current(),
          click: () => { this.options.profiles?.select(profile.id) } })),
        { type: 'separator' as const }, { label: messages.profileAdd, click: () => { this.options.profiles?.add() } },
      ] }],
      { type: 'separator' },
      { label: messages.quitApplication, click: () => { this.options.quit() } },
    ]))
  }

  /** Remove the icon; called once the quit is confirmed so no dead icon outlives the process. */
  dispose(): void {
    const tray = this.tray
    this.tray = undefined
    tray?.destroy()
  }
}
