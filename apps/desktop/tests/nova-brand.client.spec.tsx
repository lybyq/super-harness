// @vitest-environment jsdom
/** 验证桌面 Logo 的即时兜底与成功/失败切换，不访问不可达的内网地址。 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { NOVA_BRANDING, novaWindowTitle } from '../src/branding.ts'
import { NovaLogo } from '../src/client/NovaLogo.tsx'
import { NovaBrandMark } from '../../nova-enterprise/src/client/NovaBrand.tsx'

afterEach(cleanup)

it.each(['welcome', 'application'] as const)('uses a local fallback before load and after failure in %s', (surface) => {
  const view = render(surface === 'welcome'
    ? <NovaLogo label="Nova" />
    : <NovaBrandMark size={24} brand={NOVA_BRANDING} />)
  const [fallback, remote] = view.container.querySelectorAll('img')
  expect(screen.getByRole('img', { name: 'Nova' })).toBeDefined()
  expect(fallback!.getAttribute('src')).toBe(NOVA_BRANDING.fallbackLogoUrl)
  expect(remote!.getAttribute('src')).toBe('http://10.64.66.26:7789/static/nova-ui/logo.png')
  expect(fallback!.hidden).toBe(false)
  expect(remote!.hidden).toBe(true)
  fireEvent.error(remote!)
  expect(fallback!.hidden).toBe(false)
  fireEvent.load(remote!)
  expect(fallback!.hidden).toBe(true)
  expect(remote!.hidden).toBe(false)
  fireEvent.error(remote!)
  expect(fallback!.hidden).toBe(false)
  expect(remote!.hidden).toBe(true)
  expect(remote!.getAttribute('src')).toBe(NOVA_BRANDING.logoUrl)
})

it.each([
  ['DeepSeek Harness', 'Nova'],
  ['任务 — DeepSeek Harness', '任务 — Nova'],
  ['DeepSeek Harness — 任务', 'Nova — 任务'],
  ['讨论 DeepSeek Harness 的代码', '讨论 DeepSeek Harness 的代码'],
  ['DeepSeek V4', 'DeepSeek V4'],
  ['DSH 本地构建', 'Nova'],
  ['DeepSeek harness 社区版对比 — DSH 本地构建', 'DeepSeek harness 社区版对比 — Nova'],
])('rewrites only product branding in title %s', (input, expected) => {
  expect(novaWindowTitle(input)).toBe(expected)
})
