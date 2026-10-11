/** 用真实皮肤目录和固定社区加载器验证离线主题，不启动浏览器或访问网络。 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { BUILTIN_THEMES, seedBuiltinThemes, themeStyles } from '../src/builtin-themes.ts'

const hostRequire = createRequire(new URL('../../desktop-host/package.json', import.meta.url))
const bundleRequire = createRequire(hostRequire.resolve('@linxin666/dsh-web-all/package.json'))
const center = await import(pathToFileURL(bundleRequire.resolve('@linxin666/dsh-client-ui-skin-center')).href)

test('双语显示名和完整配色匹配拥有者目录中的 UI 快照', () => {
  const expected = JSON.parse(readFileSync(new URL('fixtures/builtin-themes.snapshot.json', import.meta.url), 'utf8'))
  assert.deepEqual(BUILTIN_THEMES.map(theme => ({ id: theme.id, name: theme.name, nameEn: theme.nameEn,
    cssSha256: createHash('sha256').update(themeStyles(theme)).digest('hex') })), expected)
})

/** @param hex 不透明十六进制色值。 @returns WCAG sRGB 相对亮度。 */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
}

/** @param a 前景色。 @param b 背景色。 @returns WCAG 对比度。 */
function contrast(a: string, b: string): number {
  const left = luminance(a), right = luminance(b)
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05)
}

test('六套双语皮肤由真实社区目录和 CSS 安全转换器接受，无运行脚本或公网资源', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'harness-themes-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const skins = join(root, 'skins'), builtinDir = join(root, 'empty-builtins')
  mkdirSync(builtinDir)
  assert.equal(seedBuiltinThemes(skins).length, 6)
  const catalog = center.loadSkinCatalog({ userDir: skins, builtinDir, force: true })
  assert.deepEqual(catalog.diagnostics, [])
  assert.deepEqual(catalog.skins.map((entry: { manifest: { id: string } }) => entry.manifest.id), BUILTIN_THEMES.map(theme => theme.id))
  for (const entry of catalog.skins) assert.deepEqual(entry.warnings, [])
  for (const theme of BUILTIN_THEMES) {
    const css = readFileSync(join(skins, theme.id, 'skin.css'), 'utf8')
    const transformed = center.transformSkinCss(css, { skinId: theme.id })
    assert.ok(transformed.code.includes(theme.id))
    assert.deepEqual(transformed.warnings, [])
    assert.deepEqual(center.auditTokenContract([{ css, filename: 'skin.css' }]).warnings, [])
    assert.deepEqual(readdirSync(join(skins, theme.id)).sort(), ['dark.svg', 'light.svg', 'skin.css', 'skin.json'])
    for (const mode of ['light', 'dark']) {
      const svg = readFileSync(join(skins, theme.id, `${mode}.svg`), 'utf8')
      assert.doesNotMatch(svg, /<script|href=|url\(|@import/i)
    }
    assert.doesNotMatch(css, /url\(|@import|animation|position\s*:/i)
    assert.match(css, /body\[data-ds-dark-theme\]/)
  }
})

test('所有明暗配色的正文、辅助正文、链接及按钮达到 4.5:1 对比度', () => {
  for (const theme of BUILTIN_THEMES) {
    for (const p of [theme.light, theme.dark]) {
      for (const surface of [p.base, p.surface, p.raised, p.sidebar]) {
        assert.ok(contrast(p.foreground, surface) >= 4.5, `${theme.id}: primary on ${surface}`)
        assert.ok(contrast(p.secondary, surface) >= 4.5, `${theme.id}: secondary on ${surface}`)
        assert.ok(contrast(p.accent, surface) >= 4.5, `${theme.id}: accent on ${surface}`)
      }
      for (const accent of [p.accent, p.accentHover]) assert.ok(contrast(p.onAccent, accent) >= 4.5, theme.id)
    }
  }
})

test('重复初始化保持用户修改和当前选择，不留下暂存目录', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'harness-themes-preserve-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const skins = join(root, 'skins')
  seedBuiltinThemes(skins)
  const custom = join(skins, BUILTIN_THEMES[0]!.id, 'skin.css')
  writeFileSync(custom, '/* user customization */\n')
  const active = join(root, 'skin-center-active.json')
  writeFileSync(active, '{"id":"existing-skin"}\n')
  assert.deepEqual(seedBuiltinThemes(skins), [])
  assert.equal(readFileSync(custom, 'utf8'), '/* user customization */\n')
  assert.equal(readFileSync(active, 'utf8'), '{"id":"existing-skin"}\n')
  assert.equal(readdirSync(skins).length, 6)
})

test('拒绝链接根目录，不向链接目标写主题', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'harness-themes-links-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const outside = join(root, 'outside'), link = join(root, 'skins')
  mkdirSync(outside)
  symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir')
  assert.throws(() => seedBuiltinThemes(link), /symbolic link/)
  assert.deepEqual(readdirSync(outside), [])
})

test('明暗 token 名相同且不修改官方状态色或语法色', () => {
  for (const theme of BUILTIN_THEMES) {
    const css = themeStyles(theme)
    const names = [...css.matchAll(/(--[\w-]+):/g)].map(match => match[1])
    assert.deepEqual(names.slice(0, names.length / 2), names.slice(names.length / 2))
    assert.doesNotMatch(css, /--shiki-|--dsw-alias-(state-error|state-success|state-warn|file-diff)/)
  }
})
