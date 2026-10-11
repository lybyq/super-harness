/** 随企业桌面交付纯配色皮肤；复用社区皮肤中心，不下载资源或执行皮肤脚本。 */
import { lstatSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** 明暗色板：表面、正文、强调及按钮前景均使用不透明 sRGB 色值。 */
interface Palette {
  base: string
  surface: string
  raised: string
  sidebar: string
  foreground: string
  secondary: string
  border: string
  accent: string
  accentHover: string
  onAccent: string
}

/** 社区 v2 清单展示信息与配对的明暗色板。 */
interface BuiltinTheme {
  id: string
  name: string
  nameEn: string
  tagline: string
  light: Palette
  dark: Palette
}

/**
 * @param colors 背景、表面、浮层、侧栏、正文、辅助正文、边框、强调、悬停和强调前景。
 * @returns 用于样式和预览的语义配色。
 */
function palette(...colors: [string, string, string, string, string, string, string, string, string, string]): Palette {
  const [base, surface, raised, sidebar, foreground, secondary, border, accent, accentHover, onAccent] = colors
  return { base, surface, raised, sidebar, foreground, secondary, border, accent, accentHover, onAccent }
}

/** 六套随包色板，每套支持官方明暗切换，不修改当前皮肤选择。 */
export const BUILTIN_THEMES: readonly BuiltinTheme[] = [
  {
    id: 'harness-obsidian', name: '曜石', nameEn: 'Obsidian', tagline: '石墨灰 · 克制铜金 · 专注代码',
    light: palette('#f4f3f0', '#ffffff', '#eae7e2', '#edeae5', '#24231f', '#625e55', '#d5d0c6', '#805b26', '#674719', '#ffffff'),
    dark: palette('#17181b', '#1e2024', '#292c32', '#121316', '#ece9e1', '#b6b2a9', '#3e4148', '#dfb878', '#edc990', '#191a1d'),
  },
  {
    id: 'harness-deep-sea', name: '深海', nameEn: 'Deep Sea', tagline: '午夜海军蓝 · 冰蓝强调 · 清晰层次',
    light: palette('#f0f5fa', '#ffffff', '#e5edf6', '#e8eff7', '#172c43', '#50657b', '#c9d7e6', '#245fa5', '#194c89', '#ffffff'),
    dark: palette('#101b2c', '#17253a', '#20324a', '#0d1625', '#e0eaf7', '#a8bbd3', '#354b66', '#87bafa', '#a5ccff', '#102039'),
  },
  {
    id: 'harness-pine', name: '松林', nameEn: 'Pine', tagline: '森林绿 · 玉石强调 · 安静工作',
    light: palette('#f1f5ef', '#fbfdf9', '#e5eee1', '#e9f0e5', '#21362b', '#51675a', '#c8d8c6', '#286449', '#1d5038', '#ffffff'),
    dark: palette('#14221c', '#1c2e25', '#293d31', '#102018', '#e4eee3', '#acc5af', '#3b5542', '#91caa2', '#aedcba', '#14251b'),
  },
  {
    id: 'harness-polar', name: '极地', nameEn: 'Polar', tagline: '冷白与石板灰 · 精准蓝 · 简洁办公',
    light: palette('#f5f7fa', '#ffffff', '#edf1f6', '#edf1f6', '#202d40', '#536278', '#cfd8e4', '#285ac1', '#20499e', '#ffffff'),
    dark: palette('#1c2430', '#242f3e', '#303d4e', '#171f2a', '#ecf2fa', '#b4c2d5', '#45566e', '#a3c4ff', '#bed5ff', '#15233b'),
  },
  {
    id: 'harness-warm-paper', name: '暖纸', nameEn: 'Warm Paper', tagline: '暖米纸色 · 赭石强调 · 文档阅读',
    light: palette('#f8f3e9', '#fffcf5', '#eee5d7', '#efe7d9', '#3e3125', '#75604c', '#d8c8b1', '#95502c', '#793f21', '#ffffff'),
    dark: palette('#29231e', '#342c24', '#44372c', '#211c18', '#f4e8d5', '#cfb99a', '#62503e', '#e8b17c', '#f5c596', '#2b2117'),
  },
  {
    id: 'harness-mist', name: '雾青', nameEn: 'Mist', tagline: '浅雾灰 · 青瓷绿 · 舒展界面',
    light: palette('#f0f6f5', '#fbfefe', '#e3eeec', '#e5efed', '#183a37', '#506b67', '#c5dad6', '#1d6a62', '#17554f', '#ffffff'),
    dark: palette('#172b2b', '#203838', '#2c4947', '#112323', '#e3f0ed', '#b0ccc5', '#426661', '#94d6c6', '#b0e7d9', '#14322c'),
  },
]

/**
 * @param p 当前配色。
 * @returns 官方 token 覆盖；错误、警告、成功、Diff 和语法色继续使用官方明暗语义。
 */
function tokens(p: Palette): Record<string, string> {
  return {
    '--dsw-alias-bg-base': p.base,
    '--dsw-alias-bg-layer-1': p.surface,
    '--dsw-alias-bg-layer-2': p.surface,
    '--dsw-alias-bg-layer-3': p.raised,
    '--dsw-alias-bg-overlay': p.raised,
    '--dsw-alias-bg-module-platform': p.raised,
    '--dsw-alias-label-primary': p.foreground,
    '--dsw-alias-label-secondary': p.secondary,
    '--dsw-alias-label-tertiary': p.secondary,
    '--dsw-alias-label-caption': p.secondary,
    '--dsw-alias-label-primary-inverted': p.onAccent,
    '--dsw-alias-label-primary-foreground': p.onAccent,
    '--dsw-alias-brand-primary': p.accent,
    '--dsw-alias-brand-text': p.accent,
    '--dsw-alias-link': p.accent,
    '--dsw-alias-button-primary-fill': p.accent,
    '--dsw-alias-button-primary-hover': p.accentHover,
    '--dsw-alias-button-elevated-fill': p.surface,
    '--dsw-alias-button-floating-fill': p.surface,
    '--dsw-alias-button-floating-hover': p.raised,
    '--dsw-alias-border-l1': p.border,
    '--dsw-alias-border-l2': p.border,
    '--dsw-alias-border-l3': p.border,
    '--dsw-alias-border-l4': p.border,
    '--dsw-alias-markdown-code-block': p.raised,
    '--dsw-alias-markdown-code-block-banner': p.raised,
    '--dsw-alias-markdown-inline-code': p.raised,
    '--dsw-alias-interactive-bg-hover-solid': p.raised,
    '--dsw-specific-sidebar-fill': p.sidebar,
    '--dsw-specific-input-major': p.surface,
    '--dsw-specific-menu': p.raised,
    '--dsw-specific-selector': p.raised,
    '--dsw-specific-bubble': p.raised,
  }
}

/**
 * @param theme 随包主题。
 * @returns 交给皮肤中心作用域转换的 CSS，不含 URL、全局布局改写或动画。
 */
export function themeStyles(theme: BuiltinTheme): string {
  const rule = (selector: string, p: Palette) => `${selector} {\n${Object.entries(tokens(p)).map(([key, value]) => `  ${key}: ${value};`).join('\n')}\n}\n`
  return rule(':root, body', theme.light) + rule('body[data-ds-dark-theme]', theme.dark)
}

/**
 * @param p 单个明暗色板。
 * @returns 无文字、外链或脚本的本地 SVG 预览，展示侧栏、消息、代码和按钮。
 */
function preview(p: Palette): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
<rect width="640" height="400" rx="16" fill="${p.base}"/>
<path d="M16 0h144v400H16A16 16 0 0 1 0 384V16A16 16 0 0 1 16 0" fill="${p.sidebar}"/>
<rect x="24" y="28" width="26" height="26" rx="8" fill="${p.accent}"/>
<rect x="62" y="35" width="68" height="9" rx="4" fill="${p.foreground}"/>
<rect x="16" y="84" width="128" height="34" rx="8" fill="${p.raised}"/>
<path d="M32 101h88M32 148h76M32 193h61" stroke="${p.secondary}" stroke-width="8" stroke-linecap="round"/>
<rect x="192" y="32" width="196" height="12" rx="6" fill="${p.foreground}"/>
<rect x="366" y="78" width="240" height="44" rx="12" fill="${p.raised}"/>
<path d="M388 100h190M208 152h315M208 176h263" stroke="${p.secondary}" stroke-width="8" stroke-linecap="round"/>
<rect x="198" y="198" width="408" height="91" rx="10" fill="${p.raised}"/>
<path d="M218 222h153M218 244h238M218 267h122" stroke="${p.accent}" stroke-width="7" stroke-linecap="round"/>
<rect x="192" y="316" width="414" height="60" rx="12" fill="${p.surface}" stroke="${p.border}"/>
<rect x="559" y="333" width="28" height="28" rx="8" fill="${p.accent}"/>
<path d="M569 346l4-4 4 4m-4-4v11" fill="none" stroke="${p.onAccent}" stroke-width="2"/>
</svg>\n`
}

/**
 * 将缺失主题逐个原子落到用户皮肤目录；已有目录、文件或链接均不覆盖。
 * @param skinsDirectory 部署解析后的皮肤根目录，不接受浏览器或模型输入。
 * @returns 本次新添加的 ID；不修改皮肤选择、用户配置或第三方主题。
 * @throws 根目录是链接或不可写时失败；保留已提交主题，清理本次临时目录后可重试。
 */
export function seedBuiltinThemes(skinsDirectory: string): string[] {
  const root = resolve(skinsDirectory)
  mkdirSync(root, { recursive: true })
  if (lstatSync(root).isSymbolicLink()) throw new Error('Harness theme directory must not be a symbolic link')
  const created: string[] = []
  for (const [order, theme] of BUILTIN_THEMES.entries()) {
    const target = join(root, theme.id)
    try { lstatSync(target); continue } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
    }
    const staging = mkdtempSync(join(root, '.harness-theme-'))
    try {
      const manifest = { skinManifestVersion: 2, id: theme.id, name: theme.name, nameEn: theme.nameEn,
        author: 'Harness', version: '1.0.0', tagline: theme.tagline, accent: theme.light.accent,
        order: order + 10, tags: ['harness', 'offline'],
        preview: { light: 'light.svg', dark: 'dark.svg' }, contributes: { stylesheet: 'skin.css' } }
      for (const [name, content] of Object.entries({ 'skin.json': `${JSON.stringify(manifest, null, 2)}\n`,
        'skin.css': themeStyles(theme), 'light.svg': preview(theme.light), 'dark.svg': preview(theme.dark) })) {
        writeFileSync(join(staging, name), content, { flag: 'wx', mode: 0o600 })
      }
      try { renameSync(staging, target) } catch (error) {
        if (error instanceof Error && 'code' in error && (error.code === 'EEXIST' || error.code === 'ENOTEMPTY')) continue
        throw error
      }
      created.push(theme.id)
    } finally {
      rmSync(staging, { recursive: true, force: true })
    }
  }
  return created
}
