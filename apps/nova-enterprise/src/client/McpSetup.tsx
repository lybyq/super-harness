/** 官方浮层内的企业 MCP 初始化与统一配置；凭据仅保留在组件草稿，卸载与关闭时清空。 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { connection, defaultMcpStatus, mcpForms, mcpSaveResults, invoke, HubUiError,
  type Form, type ConfigurationValue, type DefaultMcpStatus } from './api.ts'
import { ConfigurationInput } from './ConfigurationInput.tsx'
import { zh, type HubLocaleKey } from './locales.ts'
import css from './HubPanel.module.css'

const OPEN_EVENT = 'nova:mcp-configuration'
/** @param signal 可跨 await 改变的取消信号。 @returns 当前取消状态，不复用 TypeScript 的旧窄化结果。 */
function cancelled(signal: AbortSignal): boolean { return signal.aborted }
/** @param workspace 已选择的配置范围；空值表示用户级。 @returns 请求官方浮层打开统一配置。 */
export function openMcpConfiguration(workspace = ''): void {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: workspace }))
}
interface Draft {
  values: Record<string, ConfigurationValue>
  secrets: Record<string, ConfigurationValue>
  arrays: Record<string, string>
}

/** @param props 官方词典。 @returns 默认初始化提示或用户打开的统一配置窗口，不接管主导航。 */
export function McpSetup({ t }: PropsLocale<'nova.hub'>): ReactNode {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false)
  const [workspace, setWorkspace] = useState(''), [forms, setForms] = useState<Form[]>([])
  const [defaults, setDefaults] = useState<DefaultMcpStatus | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({}), [selected, setSelected] = useState<string[]>([])
  const [error, setError] = useState<HubLocaleKey | null>(null), [problems, setProblems] = useState<string[]>([])
  const [results, setResults] = useState<ReturnType<typeof mcpSaveResults>>([])
  const request = useRef<AbortController | null>(null), dialog = useRef<HTMLDialogElement>(null)
  const dirty = useRef(false), prefix = useId()
  /** @param code 远端稳定码。 @returns 词典说明，未知码不回显原始异常。 */
  const message = (code: string): HubLocaleKey => Object.hasOwn(zh, code) ? code as HubLocaleKey : 'HUB_OPERATION_FAILED'
  /** @param scope 当前配置范围。 @param signal 取消信号。 @returns 同时读取默认安装状态与全部已安装 MCP 的字段。 */
  async function load(scope: string, signal: AbortSignal): Promise<DefaultMcpStatus | null> {
    let status: DefaultMcpStatus | null = null
    if (!scope) {
      try { status = defaultMcpStatus(await invoke('mcp-defaults', signal)) }
      catch (error) { if (!signal.aborted) setError(message(error instanceof HubUiError ? error.code : 'HUB_OPERATION_FAILED')) }
    }
    const settings = mcpForms(await invoke('mcp-configurations', signal, undefined, scope))
    if (signal.aborted) return status
    setDefaults(status)
    setForms(settings.data)
    setProblems(settings.errors.map(row => row.id))
    setDrafts(Object.fromEntries(settings.data.map(form => [form.capability.id, { values: form.values, secrets: {}, arrays: {} }])))
    setSelected(settings.data.filter(form => form.fields.length && form.capability.enabled !== false && form.capability.activation === 'needs-configuration').map(form => form.capability.id))
    dirty.current = false
    return status
  }
  /** @param action 有界界面请求。 @returns 单次操作完成；取消后不写回界面。 */
  async function run(action: (signal: AbortSignal) => Promise<void>): Promise<void> {
    if (request.current) return
    const controller = new AbortController()
    request.current = controller
    setBusy(true); setError(null)
    try { await action(controller.signal) }
    catch (error) { if (!controller.signal.aborted) setError(message(error instanceof HubUiError ? error.code : 'HUB_OPERATION_FAILED')) }
    finally { if (request.current === controller) request.current = null; if (!controller.signal.aborted) setBusy(false) }
  }
  useEffect(() => {
    const manual = (event: Event) => {
      if (!(event instanceof CustomEvent) || typeof event.detail !== 'string') return
      const scope = event.detail
      if (request.current || (dirty.current && !window.confirm(t('unsavedConfiguration')))) return
      setWorkspace(scope); setOpen(true); setResults([])
      void run(async (signal) => { await load(scope, signal) })
    }
    window.addEventListener(OPEN_EVENT, manual)
    void run(async (signal) => {
      const settings = connection(await invoke('connection', signal))
      if (!settings.configured || !settings.defaultMcpEnabled || signal.aborted) return
      const status = await load('', signal)
      if (!cancelled(signal) && (!status || (!status.dismissed && status.items.some(row => row.error || !['active', 'disabled', 'removed', 'restart-required'].includes(row.activation))))) setOpen(true)
    })
    return () => { window.removeEventListener(OPEN_EVENT, manual); request.current?.abort(); request.current = null }
  }, [])
  useEffect(() => {
    if (!open || !dialog.current) return
    const previous = document.activeElement
    if (!dialog.current.open) dialog.current.showModal()
    return () => { dialog.current?.close(); if (previous instanceof HTMLElement) previous.focus() }
  }, [open])
  /** @returns 放弃未保存草稿需确认；确认后清空秘密并记住“稍后配置”。 */
  function close(): void {
    if (busy || (dirty.current && !window.confirm(t('unsavedConfiguration')))) return
    const finish = () => { setOpen(false); setDrafts({}); setSelected([]); dirty.current = false }
    if (!workspace && defaults?.configured) void run(async (signal) => {
      await invoke('mcp-defaults', signal, { action: 'dismiss' })
      if (!signal.aborted) finish()
    })
    else finish()
  }
  /** @param id 资源 ID。 @param change 此资源独立草稿的变更。 @returns 不跨资源复用同名环境变量。 */
  function edit(id: string, change: (draft: Draft) => Draft): void {
    dirty.current = true
    setSelected(previous => previous.includes(id) ? previous : [...previous, id])
    setDrafts(previous => ({ ...previous, [id]: change(previous[id] ?? { values: {}, secrets: {}, arrays: {} }) }))
  }
  if (!open) return null
  return <dialog ref={dialog} className={`${css.mcpDialog} ${css.panel}`} aria-labelledby={`${prefix}-title`}
    onCancel={(event) => { event.preventDefault(); close() }}>
    <header className={css.mcpDialogHeader}>
      <div><h2 id={`${prefix}-title`}>{t('mcpSetupTitle')}</h2><p className={css.muted}>{t('mcpSetupHint')}</p></div>
      <button type="button" disabled={busy} onClick={close}>{t('mcpSetupLater')}</button>
    </header>
    <p className={css.muted}>{workspace || t('userScope')}</p>
    {busy && <p role="status">{t('working')}</p>}
    {error && <p className={css.error} role="alert">{t(error)}</p>}
    {defaults?.items.some(row => row.error || !row.installed) && <section className={css.notice}>
      <h3>{t('mcpDefaultProgress')}</h3>
      <ul>{defaults.items.filter(row => row.error || !row.installed).map(row => <li key={row.id}>
        {row.id} · {row.activation === 'removed' ? t('mcpRemovedByUser') : row.error ? t(message(row.error)) : t('notInstalled')}
      </li>)}</ul>
      <button type="button" disabled={busy} onClick={() => {
        if (dirty.current && !window.confirm(t('unsavedConfiguration'))) return
        void run(async (signal) => { await invoke('mcp-defaults', signal, { action: 'retry' }); await load(workspace, signal) })
      }}>{t('mcpRetryInstallation')}</button>
    </section>}
    {problems.length > 0 && <p className={css.error}>{t('mcpUnreadable')}: {problems.join(', ')}</p>}
    {!forms.length && !busy && <p className={css.empty}>{t('mcpNoInstalled')}</p>}
    {results.length > 0 && <ul aria-label={t('mcpSaveResults')} className={css.notice}>
      {results.map(row => <li key={row.id}>{row.id} · {t(row.saved ? 'configurationSaved' : 'mcpSaveFailed')} · {
        t(row.activation === 'active' ? 'active' : row.activation === 'disabled' ? 'disabled' : row.activation === 'needs-configuration' ? 'needsConfiguration' : 'activationFailed')
      }{row.error ? ` · ${t(message(row.error))}` : ''}</li>)}
    </ul>}
    <form onSubmit={(event) => {
      event.preventDefault()
      void run(async (signal) => {
        const configurations = selected.map((id) => {
          const draft = drafts[id]
          if (!draft) throw new HubUiError('HUB_CONFIGURATION_INVALID')
          const values = { ...draft.values }
          for (const [key, text] of Object.entries(draft.arrays)) {
            let parsed: unknown
            try { parsed = JSON.parse(text) } catch (_error) { throw new HubUiError('HUB_CONFIGURATION_INVALID') }
            if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string')) throw new HubUiError('HUB_CONFIGURATION_INVALID')
            values[key] = parsed as string[]
          }
          return { id, values, secrets: Object.fromEntries(Object.entries(draft.secrets).filter(([, value]) => value !== '')) }
        })
        const saved = mcpSaveResults(await invoke('mcp-configurations', signal, { configurations }, workspace))
        if (cancelled(signal)) return
        setResults(saved)
        // 已提交请求的秘密不再保留；部分保存失败只展示稳定码，由用户重新输入失败项。
        setDrafts(previous => Object.fromEntries(Object.entries(previous).map(([id, draft]) => [id, { ...draft, secrets: {} }])))
        await load(workspace, signal)
        if (!cancelled(signal)) window.dispatchEvent(new Event('nova:mcp-updated'))
      })
    }}>
      {forms.map((form) => {
        const id = form.capability.id, enabled = selected.includes(id), draft = drafts[id]
        return <section className={css.mcpResource} key={id}>
          <div className={css.actions}>
            <label><input type="checkbox" checked={enabled} disabled={busy || !form.fields.length}
              onChange={(event) => {
                setSelected(previous => event.target.checked ? [...previous, id] : previous.filter(value => value !== id))
              }} />
            {form.capability.name} <small className={css.muted}>{id} · {form.capability.version}</small></label>
            <small className={css.muted}>{t(form.capability.activation === 'active' ? 'active' : form.capability.activation === 'disabled' ? 'disabled' : form.capability.activation === 'needs-configuration' ? 'needsConfiguration' : 'activationFailed')}</small>
          </div>
          {!form.fields.length ? <p className={css.muted}>{t('noConfiguration')}</p> : <fieldset disabled={busy || !enabled} className={css.configSection}>
            <legend>{t('configure')}</legend>
            <div className={css.configGrid}>{form.fields.map((field) => {
              const fieldPrefix = `${prefix}-${id}`
              return <label key={field.key}
                className={`${css.field} ${field.schema.type === 'array' || /_(?:JSON|TOML)$/.test(field.key) ? css.fieldWide : ''}`}
                htmlFor={`${fieldPrefix}-${field.key}`}>
                <span>{field.key} · {t(field.required ? 'required' : 'optional')} · {field.secret ? t('secretField') : field.schema.type}</span>
                <ConfigurationInput field={field} value={(field.secret ? draft?.secrets : draft?.values)?.[field.key]}
                  arrayDraft={draft?.arrays[field.key]} configured={form.configuredSecrets.includes(field.key)} busy={busy || !enabled}
                  prefix={fieldPrefix} t={t} onChange={(value) =>{  edit(id, draft => field.secret
                    ? { ...draft, secrets: { ...draft.secrets, [field.key]: value } }
                    : { ...draft, values: { ...draft.values, [field.key]: value } }) }}
                  onArray={(value) =>{  edit(id, draft => ({ ...draft, arrays: { ...draft.arrays, [field.key]: value } })) }} />
                <small id={`${fieldPrefix}-${field.key}-hint`} className={css.muted}>{field.description || t('fieldNoDescription')}</small>
              </label>
            })}</div>
          </fieldset>}
        </section>
      })}
      <footer className={css.mcpDialogFooter}><p className={css.muted}>{t('credentialsNotice')}</p>
        <button type="submit" className={css.primary} disabled={busy || !selected.length}>{t('mcpSaveAll')}</button>
      </footer>
    </form>
  </dialog>
}
