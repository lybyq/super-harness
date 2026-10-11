// @vitest-environment jsdom
/** 真实角色工作区 DOM：从官方团队回执选择工作树，不要求手工输入路径或成员 ID。 */
import { createElement } from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { RoleWorkspace } from '../src/client/RoleWorkspace.tsx'
import { zh } from '../src/client/locales.ts'

it('团队查询自动给出可审阅工作树成员，切换 Lead 清除旧审阅选择', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const path = new URL(url, 'http://fixture.invalid').pathname
    const value = path.endsWith('/roles') ? [] : path.endsWith('/templates') ? [] : path.endsWith('/sessions')
      ? [{ id: 'lead-one', cwd: 'E:/one', status: 'idle' }, { id: 'lead-two', cwd: 'E:/two', status: 'idle' }]
      : { members: [{ id: 'member-one', name: 'backend', worktree: { path: 'host-owned' } }], tasks: [] }
    return Response.json({ ok: true, value })
  }))
  const container = document.createElement('div'); document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(createElement(RoleWorkspace, { t: key => zh[key], busy: false, configured: true,
        notify: () => {}, run: action => action(new AbortController().signal) }))
    })
    const session = container.querySelector<HTMLSelectElement>('select[id$="-session"]')
    expect(session).not.toBeNull()
    await act(async () => { if (session) { session.value = 'lead-one'; session.dispatchEvent(new Event('change', { bubbles: true })) } })
    await act(async () => { [...container.querySelectorAll('button')].find(button => button.textContent === zh.inspectTeam)?.click() })
    const members = [...container.querySelectorAll('label')].find(label => label.textContent?.includes(zh.memberSessionId))?.querySelector('select')
    expect(members?.value).toBe('member-one')
    expect(members?.textContent).toContain('backend')
    await act(async () => { if (session) { session.value = 'lead-two'; session.dispatchEvent(new Event('change', { bubbles: true })) } })
    expect(members?.value).toBe('')
    expect(members?.textContent).not.toContain('backend')
  } finally {
    await act(async () => { root.unmount() }); container.remove(); vi.unstubAllGlobals()
  }
})
