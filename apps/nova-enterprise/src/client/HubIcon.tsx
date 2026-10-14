/** AI Hub 本地图标；只提供装饰，不依赖公网资源或替代控件的文字标签。 */
import type { ReactNode } from 'react'

const paths = {
  catalog: 'M3 3h6v6H3z M15 3h6v6h-6z M3 15h6v6H3z M15 15h6v6h-6z',
  installed: 'M5 8V4h14v4 M3 8h18v12H3z M9 12l2 2 4-4',
  roles: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M2 21v-2a7 7 0 0 1 14 0v2 M17 4a4 4 0 0 1 0 8 M19 15a6 6 0 0 1 3 6',
  authoring: 'M4 20l4-1L20 7l-3-3L5 16z M14 7l3 3 M13 20h8',
  search: 'M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15 M16 16l5 5',
  mcp: 'M8 3v4 M16 3v4 M6 7h12v4a6 6 0 0 1-12 0z M12 17v4',
  skill: 'M12 3l-9 5 9 5 9-5z M3 12l9 5 9-5 M3 16l9 5 9-5',
  plugin: 'M8 3h8v5h5v8h-5v5H8v-5H3V8h5z',
} as const

/**
 * @param props 图标类型及尺寸；调用方保留可见文字和无障碍名称。
 * @returns 不可聚焦的装饰 SVG，未知资源类型使用插件图标。
 */
export function HubIcon({ kind, size = 18 }: { kind: string; size?: number }): ReactNode {
  const path = Object.hasOwn(paths, kind) ? paths[kind as keyof typeof paths] : paths.plugin
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d={path} />
  </svg>
}
