/** 将 Nova Hub 注入官方桌面导航和主面板，不替换官方外壳或会话逻辑。 */
import type { Context } from '@deepseek-ai/cordis'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { createElement } from 'react'
import { IconSearchOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { HubPanel } from './HubPanel.tsx'
import { en, zh } from './locales.ts'
import { NovaBrandMark, NovaBrandName } from './NovaBrand.tsx'
import { McpSetup } from './McpSetup.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'nova.hub': keyof typeof zh
  }
}
const NS = 'nova.hub'
const PANEL = 'nova-hub' as MainPanelId
export const inject = ['slots', 'locale']

/**
 * @param props 官方侧栏提供的图标尺寸。
 * @returns 复用官方搜索图标，继承当前主题色。
 */
function HubIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return createElement(IconSearchOutlineRegular, { size })
}

/**
 * 注册双语词典及官方主面板、侧栏插槽；插件卸载时由官方生命周期撤销贡献。
 * @param ctx Client 侧官方 Cordis 上下文，仅访问声明的 locale 和 slots 服务。
 * @returns 无返回值；不建立第二套导航或全局状态。
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'nova-hub: dictionaries')
  const t = ctx.locale.bind(NS)
  const brand = window.novaBrand
  if (brand) {
    // 优先级低于官方默认项；撤销本插件后原生品牌自动恢复。
    ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register({ name: 'sidebar.brand.mark', priority: -100 },
      props => createElement(NovaBrandMark, { ...props, brand })))
    ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({ name: 'sidebar.brand.name', priority: -100 },
      () => createElement(NovaBrandName, { brand })))
    ctx.slots.inject('conversation.hero.brand.mark', () => ctx.slots.register({ name: 'conversation.hero.brand.mark', priority: -100 },
      props => createElement(NovaBrandMark, { ...props, brand })))
  }
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL, locale: NS }, HubPanel))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'nova-mcp-setup', order: 1, locale: NS }, McpSetup))
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      { name: 'sidebar.panellist', id: PANEL, order: 1, label: () => t('panel'), locale: NS },
      HubIcon,
    ),
  )
}
