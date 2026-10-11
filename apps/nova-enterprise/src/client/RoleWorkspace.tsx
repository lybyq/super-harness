/** 角色与团队工作区：保存职责模板、选择目标会话，并通过 Host 应用官方上下文/团队服务。 */
import { useEffect, useId, useState, type ReactNode } from 'react'
import {
  applied,
  invoke as hostInvoke,
  HubUiError,
  roles,
  rolePlan,
  sessions,
  templates,
  type Role,
  type RolePlan,
  type RoleTemplate,
  type HubSession,
} from './api.ts'
import { RolePanel } from './RolePanel.tsx'
import type { HubLocaleKey } from './locales.ts'
import css from './HubPanel.module.css'
import type { TeamMemberSettings } from './api.ts'

interface Props {
  workspace?: string
  t: (key: HubLocaleKey) => string
  busy: boolean
  configured: boolean
  run: (action: (signal: AbortSignal) => Promise<void>) => Promise<void>
  notify: (key: HubLocaleKey) => void
}

/**
 * @param props 面板语言、统一串行请求控制器与成功通知。
 * @returns 角色职责、团队任务和目标会话的可操作表单；不自动发起模型调用。
 */
export function RoleWorkspace({ t, busy, configured, run, notify, workspace = '' }: Props): ReactNode {
  const invoke = (path: string, signal: AbortSignal, payload?: object): Promise<unknown> =>
    hostInvoke(path, signal, payload, workspace)
  const [catalog, setCatalog] = useState<Role[] | null>(null),
    [selected, setSelected] = useState<string[]>([])
  const [plan, setPlan] = useState<RolePlan | null>(null),
    [saved, setSaved] = useState<RoleTemplate[]>([])
  const [targets, setTargets] = useState<HubSession[]>([]),
    [sessionId, setSessionId] = useState('')
  const [templateId, setTemplateId] = useState(''),
    [id, setId] = useState(''),
    [name, setName] = useState('')
  const [instructions, setInstructions] = useState(''),
    [kind, setKind] = useState<'role' | 'team'>('role')
  const [task, setTask] = useState(''),
    prefix = useId()
  const [memberSettings, setMemberSettings] = useState<TeamMemberSettings[]>([]),
    [taskDefinitions, setTaskDefinitions] = useState('[]'),
    [teamState, setTeamState] = useState('')
  const [memberId, setMemberId] = useState(''),
    [review, setReview] = useState<{
      mainCommit: string
      diff: string
      commits: { commit: string; subject: string }[]
    } | null>(null),
    [commit, setCommit] = useState(''),
    [mergeResult, setMergeResult] = useState('')
  const [custom, setCustom] = useState({ add: '', remove: '', disable: '', includeOptional: '' })
  const [reviewMembers, setReviewMembers] = useState<{ id: string; name: string }[]>([])
  const customization = (): object =>
    Object.fromEntries(
      Object.entries(custom)
        .filter(([, value]) => value.trim())
        .map(([key, value]) => [
          key,
          value
            .split(',')
            .map(item => item.trim())
            .filter(Boolean),
        ]),
    )
  /** @returns 界面只提交模板；Host 再验证 DAG、角色关联和模型预算。 */
  const templateDraft = (): object => {
    const tasks: unknown = JSON.parse(taskDefinitions)
    return {
      id,
      name,
      instructions,
      kind,
      roles: selected,
      ...customization(),
      ...(kind === 'team'
        ? { members: memberSettings.filter(item => selected.includes(item.role)), tasks }
        : {}),
    }
  }
  /** @param role 成员角色。 @param patch 界面修改。 */
  function changeMember(role: string, patch: Partial<TeamMemberSettings>): void {
    setMemberSettings(previous => [
      ...previous.filter(item => item.role !== role),
      { ...previous.find(item => item.role === role), role, ...patch },
    ])
    setTemplateId('')
  }
  /** @param signal 面板取消信号。 @returns 重新加载角色、用户模板和会话，保留已有合法选择。 */
  async function load(signal: AbortSignal): Promise<void> {
    const [roleRows, templateRows, sessionRows] = await Promise.all([
      invoke('roles', signal),
      invoke('templates', signal),
      invoke('sessions', signal),
    ])
    if (signal.aborted) return
    setCatalog(roles(roleRows))
    setSaved(templates(templateRows))
    setTargets(sessions(sessionRows))
  }
  useEffect(() => {
    if (configured) void run(load)
  }, [])
  /** @param value 用户模板 ID，空值建立新模板。 */
  function chooseTemplate(value: string): void {
    const template = saved.find(item => item.id === value)
    setTemplateId(value)
    setId(template?.id ?? '')
    setName(template?.name ?? '')
    setInstructions(template?.instructions ?? '')
    setKind(template?.kind ?? 'role')
    setSelected(template?.roles ?? [])
    setPlan(null)
    setMemberSettings(template?.members ?? [])
    setTaskDefinitions(JSON.stringify(template?.tasks ?? [], null, 2))
    setCustom({
      add: template?.add?.join(', ') ?? '',
      remove: template?.remove?.join(', ') ?? '',
      disable: template?.disable?.join(', ') ?? '',
      includeOptional: template?.includeOptional?.join(', ') ?? '',
    })
  }
  return (
    <div className={css.roleWorkspace}>
      <RolePanel
        t={t}
        roles={catalog}
        selected={selected}
        plan={plan}
        busy={busy}
        configured={configured}
        onLoad={() => {
          void run(load)
        }}
        onSelect={(id, checked) => {
          setSelected(previous => (checked ? [...previous, id] : previous.filter(value => value !== id)))
          setPlan(null)
          setTemplateId('')
        }}
        onResolve={() => {
          void run(async (signal) => {
            const result = rolePlan(await invoke('role-plan', signal, { roles: selected, ...customization() }))
            if (!signal.aborted) setPlan(result)
          })
        }}
      />
      <aside className={css.roleEditor}>
        <h2>{t('templateTitle')}</h2>
        <p className={css.muted}>{t('templateHint')}</p>
        <label htmlFor={`${prefix}-template`}>{t('savedTemplates')}</label>
        <select
          id={`${prefix}-template`}
          disabled={busy}
          value={templateId}
          onChange={(event) => {
            chooseTemplate(event.target.value)
          }}
        >
          <option value="">{t('newTemplate')}</option>
          {saved.map(item => (
            <option key={item.id} value={item.id}>
              {item.name} · {t(item.kind === 'team' ? 'teamKind' : 'roleKind')}
            </option>
          ))}
        </select>
        <form
          className={css.configForm}
          onSubmit={(event) => {
            event.preventDefault()
            void run(async (signal) => {
              const result = templates(await invoke('templates', signal, templateDraft()))
              if (!signal.aborted) {
                setSaved(result)
                setTemplateId(id)
                notify('templateSaved')
              }
            })
          }}
        >
          <label htmlFor={`${prefix}-id`}>
            {t('templateId')}
            <input
              id={`${prefix}-id`}
              required
              pattern="[a-z0-9][a-z0-9._-]{0,127}"
              disabled={busy || Boolean(templateId)}
              value={id}
              onChange={(event) => {
                setId(event.target.value)
              }}
            />
          </label>
          <label htmlFor={`${prefix}-name`}>
            {t('templateName')}
            <input
              id={`${prefix}-name`}
              required
              maxLength={128}
              disabled={busy}
              value={name}
              onChange={(event) => {
                setName(event.target.value)
              }}
            />
          </label>
          <label htmlFor={`${prefix}-kind`}>
            {t('templateKind')}
            <select
              id={`${prefix}-kind`}
              disabled={busy}
              value={kind}
              onChange={(event) => {
                setKind(event.target.value === 'team' ? 'team' : 'role')
              }}
            >
              <option value="role">{t('roleKind')}</option>
              <option value="team">{t('teamKind')}</option>
            </select>
          </label>
          <label htmlFor={`${prefix}-instructions`}>
            {t('instructions')}
            <textarea
              id={`${prefix}-instructions`}
              rows={6}
              maxLength={16000}
              disabled={busy}
              value={instructions}
              onChange={(event) => {
                setInstructions(event.target.value)
                setTemplateId('')
              }}
            />
            <small className={css.muted}>{t('instructionsHint')}</small>
          </label>
          <fieldset disabled={busy}>
            <legend>{t('customCapabilities')}</legend>
            <p className={css.muted}>{t('customCapabilitiesHint')}</p>
            {(['add', 'remove', 'disable', 'includeOptional'] as const).map(key => (
              <label key={key}>
                {t(
                  key === 'add'
                    ? 'roleAdd'
                    : key === 'remove'
                      ? 'roleRemove'
                      : key === 'disable'
                        ? 'roleDisable'
                        : 'roleOptional',
                )}
                <input
                  value={custom[key]}
                  onChange={(event) => {
                    setCustom(previous => ({ ...previous, [key]: event.target.value }))
                    setTemplateId('')
                    setPlan(null)
                  }}
                />
              </label>
            ))}
          </fieldset>
          {kind === 'team' && (
            <fieldset disabled={busy}>
              <legend>{t('memberSettings')}</legend>
              <p className={css.muted}>{t('memberSettingsHint')}</p>
              {selected.map((role) => {
                const member = memberSettings.find(item => item.role === role)
                return (
                  <fieldset key={role}>
                    <legend>{catalog?.find(item => item.id === role)?.name ?? role}</legend>
                    <label>
                      {t('memberProvider')}
                      <input
                        value={member?.provider ?? ''}
                        onChange={(event) => {
                          changeMember(role, { provider: event.target.value || undefined })
                        }}
                      />
                    </label>
                    <label>
                      {t('memberModel')}
                      <input
                        value={member?.model ?? ''}
                        onChange={(event) => {
                          changeMember(role, { model: event.target.value || undefined })
                        }}
                      />
                    </label>
                    <label>
                      {t('memberMaxTokens')}
                      <input
                        type="number"
                        min={1}
                        max={1000000}
                        value={member?.maxTokens ?? ''}
                        onChange={(event) => {
                          changeMember(role, { maxTokens: event.target.value ? Number(event.target.value) : undefined })
                        }}
                      />
                    </label>
                    <label>
                      {t('memberMaxSteps')}
                      <input
                        type="number"
                        min={1}
                        max={1000}
                        value={member?.maxSteps ?? ''}
                        onChange={(event) => {
                          changeMember(role, { maxSteps: event.target.value ? Number(event.target.value) : undefined })
                        }}
                      />
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={member?.worktree ?? false}
                        onChange={(event) => {
                          changeMember(role, { worktree: event.target.checked })
                        }}
                      />
                      {t('memberWorktree')}
                    </label>
                  </fieldset>
                )
              })}
              <label>
                {t('teamDag')}
                <textarea
                  rows={8}
                  maxLength={32000}
                  value={taskDefinitions}
                  onChange={(event) => {
                    setTaskDefinitions(event.target.value)
                    setTemplateId('')
                  }}
                />
                <small className={css.muted}>{t('teamDagHint')}</small>
              </label>
            </fieldset>
          )}
          <div className={css.actions}>
            <button disabled={busy || (!selected.length && !instructions.trim())}>{t('saveTemplate')}</button>
            {saved.some(item => item.id === id) && (
              <button
                type="button"
                className={css.danger}
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(t('removeTemplateConfirm'))) return
                  void run(async (signal) => {
                    const result = templates(await invoke('templates', signal, { id, action: 'remove' }))
                    if (!signal.aborted) {
                      setSaved(result)
                      chooseTemplate('')
                    }
                  })
                }}
              >
                {t('deleteTemplate')}
              </button>
            )}
          </div>
        </form>
        <section className={css.applySection}>
          <h2>{t('applyTitle')}</h2>
          <p className={css.muted}>{t('applyHint')}</p>
          <label htmlFor={`${prefix}-session`}>{t('targetSession')}</label>
          <select
            id={`${prefix}-session`}
            disabled={busy}
            value={sessionId}
            onChange={(event) => {
              setSessionId(event.target.value)
              setReview(null)
              setMemberId('')
              setReviewMembers([])
              setCommit('')
              setTeamState('')
              setMergeResult('')
            }}
          >
            <option value="">{t('chooseSession')}</option>
            {targets.map(item => (
              <option key={item.id} disabled={item.status !== 'idle'} value={item.id}>
                {item.cwd || item.id} · {item.status}
              </option>
            ))}
          </select>
          {!targets.length && <p className={css.muted}>{t('noSession')}</p>}
          {kind === 'team' && (
            <label htmlFor={`${prefix}-task`}>
              {t('teamTask')}
              <textarea
                id={`${prefix}-task`}
                maxLength={16000}
                required
                disabled={busy}
                value={task}
                onChange={(event) => {
                  setTask(event.target.value)
                }}
              />
              <small className={css.muted}>{t('teamCostNotice')}</small>
            </label>
          )}
          <button
            className={css.primary}
            disabled={
              busy ||
              !sessionId ||
              ((Boolean(instructions.trim()) || Object.values(custom).some(value => value.trim())) &&
                (!id || !name)) ||
              (kind === 'team'
                ? !selected.length || !task.trim() || !id || !name
                : !selected.length && !instructions.trim())
            }
            onClick={() => {
              if (kind === 'team' && !window.confirm(t('teamCostNotice'))) return
              void run(async (signal) => {
                // 编辑中的说明先保存到 Host 模板，应用不能信任客户端拼接的任意角色解析结果。
                let selectedTemplate = templateId
                if (
                  selectedTemplate ||
                  instructions.trim() ||
                  kind === 'team' ||
                  Object.values(custom).some(value => value.trim())
                ) {
                  if (!id || !name) return
                  const result = templates(await invoke('templates', signal, templateDraft()))
                  if (signal.aborted) return
                  setSaved(result)
                  setTemplateId(id)
                  selectedTemplate = id
                }
                const outcome = applied(
                  await invoke('role-apply', signal, {
                    roles: selected,
                    ...(selectedTemplate ? { templateId: selectedTemplate } : {}),
                    sessionId,
                    team: kind === 'team',
                    task,
                  }),
                )
                if (!signal.aborted)
                  notify(
                    outcome === 'queued' ? 'roleQueued' : outcome === 'team-started' ? 'teamStarted' : 'teamPartial',
                  )
              })
            }}
          >
            {t(kind === 'team' ? 'startTeam' : 'applyRole')}
          </button>
          <button
            disabled={busy || !sessionId}
            onClick={() => {
              void run(async (signal) => {
                const state = await invoke(`team?sessionId=${encodeURIComponent(sessionId)}`, signal)
                if (!state || typeof state !== 'object' || !('members' in state) || !Array.isArray(state.members))
                  throw new HubUiError('HUB_RESPONSE_INVALID')
                const members = state.members.flatMap((value: unknown) => {
                  if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string'
                    || !('name' in value) || typeof value.name !== 'string') throw new HubUiError('HUB_RESPONSE_INVALID')
                  return 'worktree' in value && value.worktree ? [{ id: value.id, name: value.name }] : []
                })
                if (!signal.aborted) { setTeamState(JSON.stringify(state, null, 2)); setReviewMembers(members); setMemberId(members[0]?.id ?? ''); setReview(null); setCommit('') }
              })
            }}
          >
            {t('inspectTeam')}
          </button>
          {teamState && <pre className={css.readme}>{teamState}</pre>}
          <label>
            {t('memberSessionId')}
            <select
              disabled={busy}
              value={memberId}
              onChange={(event) => {
                setMemberId(event.target.value)
                setReview(null)
                setMergeResult('')
              }}
            ><option value="">{t('chooseSession')}</option>{reviewMembers.map(member => <option key={member.id} value={member.id}>{member.name} · {member.id}</option>)}</select>
          </label>
          <button
            disabled={busy || !sessionId || !memberId}
            onClick={() => {
              void run(async (signal) => {
                const raw = await invoke('team', signal, { action: 'review', sessionId, memberId })
                if (
                  !raw ||
                  typeof raw !== 'object' ||
                  !('mainCommit' in raw) ||
                  typeof raw.mainCommit !== 'string' ||
                  !('diff' in raw) ||
                  typeof raw.diff !== 'string' ||
                  !('commits' in raw) ||
                  !Array.isArray(raw.commits)
                )
                  throw new HubUiError('HUB_RESPONSE_INVALID')
                const commits = raw.commits.map((value: unknown) => {
                  if (
                    !value ||
                    typeof value !== 'object' ||
                    !('commit' in value) ||
                    typeof value.commit !== 'string' ||
                    !('subject' in value) ||
                    typeof value.subject !== 'string'
                  )
                    throw new HubUiError('HUB_RESPONSE_INVALID')
                  return { commit: value.commit, subject: value.subject }
                })
                if (!signal.aborted) {
                  setReview({ mainCommit: raw.mainCommit, diff: raw.diff, commits })
                  setCommit(commits[0]?.commit ?? '')
                }
              })
            }}
          >
            {t('reviewWorktree')}
          </button>
          {review && (
            <>
              <pre className={css.readme}>{review.diff}</pre>
              <select
                disabled={busy}
                value={commit}
                onChange={(event) => {
                  setCommit(event.target.value)
                }}
              >
                {review.commits.map(item => (
                  <option key={item.commit} value={item.commit}>
                    {item.commit.slice(0, 10)} · {item.subject}
                  </option>
                ))}
              </select>
              <button
                disabled={busy || !commit}
                onClick={() => {
                  if (!window.confirm(t('mergeNotice'))) return
                  void run(async (signal) => {
                    const result = await invoke('team', signal, {
                      action: 'merge',
                      sessionId,
                      memberId,
                      commit,
                      expectedMainCommit: review.mainCommit,
                      confirmed: true,
                    })
                    if (!signal.aborted) {
                      setMergeResult(JSON.stringify(result))
                      setReview(null)
                    }
                  })
                }}
              >
                {t('mergeCommit')}
              </button>
            </>
          )}
          {mergeResult && (
            <p role="status">
              {t('mergeResult')}：{mergeResult}
            </p>
          )}
        </section>
      </aside>
    </div>
  )
}
