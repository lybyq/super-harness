/** 官方桌面的 AI Hub 面板：进入即加载企业目录，用户只管理能力自己的参数和凭据。 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  catalog,
  connection,
  form,
  installed,
  readme,
  HubUiError,
  invoke as hostInvoke,
  type Capability,
  type Form,
  type Scalar,
  type ConfigurationValue,
} from './api.ts'
import { RoleWorkspace } from './RoleWorkspace.tsx'
import { AuthoringPanel } from './AuthoringPanel.tsx'
import { HubIcon } from './HubIcon.tsx'
import { ConfigurationInput } from './ConfigurationInput.tsx'
import { openMcpConfiguration } from './McpSetup.tsx'
import { zh, type HubLocaleKey } from './locales.ts'
import css from './HubPanel.module.css'

type PanelProps = PropsRuntime<'main'> & PropsLocale<'nova.hub'>

/** @param signal 外部可随时改变的请求取消信号。 @returns 当前状态，不把上一次读取推断为跨 await 恒定。 */
function requestCancelled(signal: AbortSignal): boolean { return signal.aborted }

/**
 * 在官方 main 插槽中展示内网 Hub；请求经 Host 转发，已保存密钥永不回填。
 * @param props 官方插槽运行参数与 nova.hub 语言函数。
 * @returns 搜索和能力配置界面；不向普通用户索要 Hub 地址或访问令牌。
 */
export function HubPanel({ t }: PanelProps): ReactNode {
  const [workspace, setWorkspace] = useState(''),
    [projects, setProjects] = useState<{ id: string; cwd: string }[]>([])
  const activeWorkspace = useRef('')
  /** @param path Host 路由。 @param signal 取消信号。 @param payload 写入体。 @returns 请求时固定的项目分区。 */
  const invoke = (path: string, signal: AbortSignal, payload?: object): Promise<unknown> =>
    hostInvoke(path, signal, payload, activeWorkspace.current)
  const [configured, setConfigured] = useState(false)
  const [offline, setOffline] = useState(false)
  const [query, setQuery] = useState(''),
    [type, setType] = useState('')
  const [rows, setRows] = useState<Capability[] | null>(null),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Form | null>(null)
  const [values, setValues] = useState<Record<string, ConfigurationValue>>({}),
    [secrets, setSecrets] = useState<Record<string, Scalar>>({})
  const [arrayDrafts, setArrayDrafts] = useState<Record<string, string>>({})
  const [mode, setMode] = useState<'capabilities' | 'installed' | 'roles' | 'authoring'>('capabilities')
  const [documentation, setDocumentation] = useState(''),
    [detailTab, setDetailTab] = useState<'readme' | 'configuration'>('readme')
  const [selectedVersion, setSelectedVersion] = useState('')
  const [busy, setBusy] = useState(false)
  const [authoringDirty, setAuthoringDirty] = useState(false)
  const [error, setError] = useState<HubLocaleKey | null>(null),
    [notice, setNotice] = useState<HubLocaleKey | null>(null)
  const operation = useRef<AbortController | null>(null),
    prefix = useId()
  /**
   * 串行执行一次界面操作；面板卸载时取消请求，错误只展示本地化稳定错误码。
   * @param action 接受取消信号的异步操作，不能把密钥写入异常内容。
   */
  async function run(action: (signal: AbortSignal) => Promise<void>): Promise<void> {
    if (operation.current) return
    const controller = new AbortController()
    operation.current = controller
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action(controller.signal)
    } catch (error) {
      if (!controller.signal.aborted) {
        const code = error instanceof HubUiError ? error.code : 'HUB_OPERATION_FAILED'
        setError(Object.hasOwn(zh, code) ? (code as HubLocaleKey) : 'HUB_OPERATION_FAILED')
      }
    } finally {
      if (operation.current === controller) operation.current = null
      if (!controller.signal.aborted) setBusy(false)
    }
  }
  useEffect(() => {
    void run(loadCatalog)
    return () => {
      operation.current?.abort()
      operation.current = null
    }
  }, [])
  useEffect(() => {
    const refresh = () => { if (!selected && ['capabilities', 'installed'].includes(mode)) void run(signal => search(page, signal)) }
    window.addEventListener('nova:mcp-updated', refresh)
    return () => { window.removeEventListener('nova:mcp-updated', refresh) }
  }, [selected, mode, page, query, type, workspace])
  /**
   * 进入或重试时读取管理员配置并加载目录；未配置和连接失败都显示可操作的本地化错误。
   * @param signal 当前界面操作的取消信号，卸载后不再更新状态。
   */
  async function loadCatalog(signal: AbortSignal): Promise<void> {
    const settings = connection(await invoke('connection', signal))
    if (signal.aborted) return
    setConfigured(settings.configured)
    setProjects(settings.workspaces)
    if (!settings.configured) throw new HubUiError('HUB_NOT_CONFIGURED')
    await search(1, signal)
  }
  /**
   * 搜索指定页；失败时保留已有目录内容，不误清空用户正在查看的数据。
   * @param nextPage 从 1 开始的页码。
   * @param signal 当前操作的取消信号。
   */
  async function search(nextPage: number, signal: AbortSignal, view = mode): Promise<void> {
    if (view === 'installed') {
      const result = installed(await invoke('installed', signal))
      if (signal.aborted) return
      const filtered = result.filter(
        item =>
          (!type || item.type === type) &&
          `${item.name} ${item.id} ${item.description}`.toLowerCase().includes(query.toLowerCase()),
      )
      setRows(filtered)
      setTotal(filtered.length)
      setPage(1)
      setSelected(null)
      return
    }
    const result = catalog(
      await invoke(`catalog?${new URLSearchParams({ q: query, type, page: String(nextPage) })}`, signal),
    )
    if (signal.aborted) return
    setRows(result.data)
    setTotal(result.total)
    setOffline(result.offline)
    setPage(nextPage)
    setSelected(null)
  }
  /** @param item 当前目录项。 @param signal 取消信号。 @returns 加载配置声明和默认 README，不执行文档中的代码。 */
  async function openCapability(item: Capability, signal: AbortSignal): Promise<void> {
    const result = form(await invoke(`configuration?id=${encodeURIComponent(item.id)}`, signal))
    if (requestCancelled(signal)) return
    setSelected(result)
    setSelectedVersion(result.capability.version)
    setValues(result.values)
    setSecrets({})
    setArrayDrafts({})
    setDetailTab('readme')
    setDocumentation('')
    try {
      const content = readme(await invoke(`readme?id=${encodeURIComponent(item.id)}`, signal))
      if (!signal.aborted) setDocumentation(content)
    } catch (_error) {
      if (!signal.aborted) setDocumentation(t('readmeUnavailable'))
    }
  }
  /** @param action 已声明的生命周期操作。 @param item 当前能力。 @param signal 取消信号。 @returns 刷新权威目录或详情状态，不猜测安装成功。 */
  async function mutate(action: string, item: Capability, signal: AbortSignal): Promise<void> {
    await invoke('lifecycle', signal, {
      action,
      id: item.id,
      ...(['add', 'update'].includes(action) && selectedVersion && selected?.capability.id === item.id
        ? { version: selectedVersion }
        : {}),
    })
    if (requestCancelled(signal)) return
    if (selected?.capability.id === item.id) {
      const result = form(await invoke(`configuration?id=${encodeURIComponent(item.id)}`, signal))
      if (!signal.aborted) {
        setSelected(result)
        setValues(result.values)
        setSecrets({})
        if (result.capability.activation === 'needs-configuration') setDetailTab('configuration')
      }
    } else {
      const result = form(await invoke(`configuration?id=${encodeURIComponent(item.id)}`, signal))
      if (!signal.aborted && result.capability.activation === 'needs-configuration') {
        setSelected(result)
        setValues(result.values)
        setSecrets({})
        setArrayDrafts({})
        setSelectedVersion(result.capability.version)
        setDetailTab('configuration')
      } else await search(page, signal)
    }
    if (!signal.aborted) setNotice('operationCompleted')
  }
  /** @param item Host 目录项。 @returns 与安装、待配置和激活证据对应的本地化文字。 */
  function status(item: Capability): string {
    if (!item.installed) return t('notInstalled')
    const key =
      item.activation === 'active'
        ? 'active'
        : item.activation === 'disabled'
          ? 'disabled'
          : item.activation === 'needs-configuration'
            ? 'needsConfiguration'
            : item.activation === 'dependency-not-ready'
              ? 'dependencyNotReady'
              : item.activation === 'failed'
                ? 'activationFailed'
                : item.activation === 'restart-required'
                  ? 'restartRequired'
                  : 'downloaded'
    return t(key)
  }
  /** @param item Host 权威能力摘要。 @returns 安装、更新、启停与本地删除操作，危险操作需明确确认。 */
  function capabilityActions(item: Capability): ReactNode {
    return (
      <div className={css.cardActions}>
        {!item.installed ? (
          <button
            className={css.primary}
            disabled={busy || !item.hasRuntimeBinding}
            title={!item.hasRuntimeBinding ? t('missingBinding') : undefined}
            onClick={() => {
              void run(signal => mutate('add', item, signal))
            }}
          >
            {t('install')}
          </button>
        ) : (
          <>
            <button
              disabled={busy}
              onClick={() => {
                void run(signal => mutate('update', item, signal))
              }}
            >
              {t('update')}
            </button>
            <button
              disabled={busy}
              onClick={() => {
                void run(signal => mutate(item.enabled === false ? 'enable' : 'disable', item, signal))
              }}
            >
              {t(item.enabled === false ? 'enable' : 'disable')}
            </button>
            <button
              className={css.danger}
              disabled={busy}
              onClick={() => {
                if (window.confirm(t('removeConfirm'))) void run(signal => mutate('remove', item, signal))
              }}
            >
              {t('remove')}
            </button>
          </>
        )}
      </div>
    )
  }
  /**
   * 按 Host 已准入的字段类型生成控件；秘密字段只接受新值，不显示已有明文。
   * @param field Host 返回的字段声明；最终安全校验仍在 Host 执行。
   * @returns 带标签关联的表单控件。
   */
  const fieldInput = (field: Form['fields'][number]): ReactNode => (
    <ConfigurationInput field={field} value={(field.secret ? secrets : values)[field.key]}
      arrayDraft={arrayDrafts[field.key]} configured={selected?.configuredSecrets.includes(field.key) ?? false}
      busy={busy} prefix={prefix} t={t}
      onChange={(value) => {
        if (field.secret) {
          if (Array.isArray(value)) throw new HubUiError('HUB_CONFIGURATION_INVALID')
          setSecrets(previous => ({ ...previous, [field.key]: value }))
        } else setValues(previous => ({ ...previous, [field.key]: value }))
      }}
      onArray={(value) =>{  setArrayDrafts(previous => ({ ...previous, [field.key]: value })) }} />
  )
  /** @returns 用户确认后清理未提交的配置草稿；密钥不能遗留到另一项能力的表单。 */
  const leaveCapability = (): boolean => {
    const changed =
      selected &&
      (JSON.stringify(values) !== JSON.stringify(selected.values) ||
        Object.values(secrets).some(value => value !== '') ||
        Object.keys(arrayDrafts).length > 0)
    if ((changed || authoringDirty) && !window.confirm(t('unsavedConfiguration'))) return false
    setAuthoringDirty(false)
    setSelected(null)
    setValues({})
    setSecrets({})
    setArrayDrafts({})
    setNotice(null)
    setError(null)
    return true
  }
  return (
    <section className={css.panel} aria-label={t('panel')} aria-busy={busy}>
      <header className={`${css.header} ${selected ? css.headerCompact : ''}`}>
        <div>
          <span className={css.eyebrow}>{t('panel')}</span>
          <h1>{t('title')}</h1>
          <p>{t('intro')}</p>
        </div>
      </header>
      <label className={css.scopePicker}>
        {t('configurationScope')}{' '}
        <select
          value={workspace}
          disabled={busy}
          onChange={(event) => {
            if (!leaveCapability()) return
            activeWorkspace.current = event.target.value
            setWorkspace(event.target.value)
            setRows(null)
            void run(loadCatalog)
          }}
        >
          <option value="">{t('userScope')}</option>
          {projects.map(project => (
            <option key={project.id} value={project.id}>
              {project.cwd}
            </option>
          ))}
        </select>
        <small className={css.muted}>{t('workspaceHint')}</small>
      </label>
      {error && (
        <div className={css.error}>
          <p role="alert">{t(error)}</p>
          <button
            disabled={busy}
            onClick={() => {
              void run(loadCatalog)
            }}
          >
            {t('retry')}
          </button>
        </div>
      )}
      {notice && (
        <p className={css.notice} role="status">
          {t(notice)}
        </p>
      )}
      {offline && (
        <p className={css.notice} role="status">
          {t('offlineNotice')}
        </p>
      )}
      {busy && (
        <p className={css.progress} role="status">
          {t('working')}
        </p>
      )}
      <nav className={`${css.actions} ${css.tabs}`} aria-label={t('panel')}>
        <button disabled={busy || !configured} onClick={() => { if (leaveCapability()) openMcpConfiguration(workspace) }}>
          {t('mcpSetupTitle')}
        </button>
        <button
          disabled={busy}
          aria-pressed={mode === 'capabilities'}
          onClick={() => {
            if (!leaveCapability()) return
            setMode('capabilities')
            void run(signal => search(1, signal, 'capabilities'))
          }}
        >
          <HubIcon kind="catalog" />{t('catalogTab')}
        </button>
        <button
          disabled={busy}
          aria-pressed={mode === 'roles'}
          onClick={() => {
            if (!leaveCapability()) return
            setMode('roles')
          }}
        >
          <HubIcon kind="roles" />{t('rolesTab')}
        </button>
        <button
          disabled={busy}
          aria-pressed={mode === 'installed'}
          onClick={() => {
            if (!leaveCapability()) return
            setMode('installed')
            setQuery('')
            setType('')
            void run(async (signal) => {
              const result = installed(await invoke('installed', signal))
              if (!signal.aborted) {
                setRows(result)
                setTotal(result.length)
                setPage(1)
              }
            })
          }}
        >
          <HubIcon kind="installed" />{t('installedTab')}
        </button>
        <button
          disabled={busy}
          aria-pressed={mode === 'authoring'}
          onClick={() => {
            if (!leaveCapability()) return
            setMode('authoring')
          }}
        >
          <HubIcon kind="authoring" />{t('authoringTab')}
        </button>
      </nav>
      <div className={css.content} key={`${mode}:${selected?.capability.id ?? 'list'}`}>
        {mode === 'authoring' ? (
          <AuthoringPanel
            key={workspace}
            workspace={workspace}
            t={t}
            busy={busy}
            run={run}
            notify={setNotice}
            onDirty={setAuthoringDirty}
          />
        ) : mode === 'roles' ? (
          <RoleWorkspace
            key={workspace}
            workspace={workspace}
            t={t}
            busy={busy}
            configured={configured}
            run={run}
            notify={setNotice}
          />
        ) : selected ? (
          <section className={css.detail}>
            <button
              disabled={busy}
              onClick={() => {
                leaveCapability()
              }}
            >
              {t('close')}
            </button>
            <div className={css.detailHeader}>
              <span className={css.resourceIcon}><HubIcon kind={selected.capability.type} size={24} /></span>
              <div>
                <h2>{selected.capability.name}</h2>
                <p className={css.meta}>{selected.capability.id} · {selected.capability.version}</p>
              </div>
            </div>
            <p>{selected.capability.description}</p>
            <div className={css.detailToolbar}>
              <span className={css.status} data-state={selected.capability.activation}>{status(selected.capability)}</span>
              <label>
                {t('version')}{' '}
                <select
                  value={selectedVersion}
                  disabled={busy}
                  onChange={(event) => {
                    setSelectedVersion(event.target.value)
                  }}
                >
                  {(selected.versions.length
                    ? selected.versions
                    : [{ version: selected.capability.version, hasRuntimeBinding: selected.capability.hasRuntimeBinding }]
                  ).map(item => (
                    <option key={item.version} disabled={!item.hasRuntimeBinding} value={item.version}>
                      {item.version}
                    </option>
                  ))}
                </select>
              </label>
              {capabilityActions(selected.capability)}
            </div>
            <nav className={`${css.actions} ${css.tabs}`} aria-label={t('detailTabs')}>
              <button
                aria-pressed={detailTab === 'readme'}
                onClick={() => {
                  setDetailTab('readme')
                }}
              >
                {t('readmeTab')}
              </button>
              <button
                aria-pressed={detailTab === 'configuration'}
                onClick={() => {
                  setDetailTab('configuration')
                }}
              >
                {t('configure')} · {selected.fields.length}
              </button>
            </nav>
            {detailTab === 'readme' ? (
              <pre className={css.readme}>{documentation || t('readmeEmpty')}</pre>
            ) : (
              <>
                <p className={css.muted}>{t('credentialsNotice')}</p>
                {selected.fields.length === 0 && <p className={css.notice}>{t('noConfiguration')}</p>}
                <form
                  className={css.configForm}
                  onSubmit={(event) => {
                    event.preventDefault()
                    void run(async (signal) => {
                      const submittedValues = { ...values }
                      for (const field of selected.fields.filter(field => field.schema.type === 'array')) {
                        let parsed: unknown
                        try {
                          parsed = JSON.parse(arrayDrafts[field.key] ?? JSON.stringify(values[field.key] ?? []))
                        } catch {
                          throw new HubUiError('HUB_CONFIGURATION_INVALID')
                        }
                        if (!Array.isArray(parsed) || parsed.some(value => typeof value !== 'string'))
                          throw new HubUiError('HUB_CONFIGURATION_INVALID')
                        submittedValues[field.key] = parsed as string[]
                      }
                      const submittedSecrets = Object.fromEntries(
                        Object.entries(secrets).filter(([, value]) => value !== ''),
                      )
                      const saved = form(
                        await invoke('configuration', signal, {
                          id: selected.capability.id,
                          values: submittedValues,
                          secrets: submittedSecrets,
                        }),
                      )
                      if (signal.aborted) return
                      setSelected(saved)
                      setValues(saved.values)
                      setSecrets({})
                      setArrayDrafts({})
                      setNotice('configurationSaved')
                    })
                  }}
                >
                  {([false, true] as const).filter(secret => selected.fields.some(field => field.secret === secret)).map(secret => (
                    <fieldset key={String(secret)} className={css.configSection}>
                      <legend>{t(secret ? 'secretParameters' : 'publicParameters')}</legend>
                      <p className={css.muted}>{t(secret ? 'secretParametersHint' : 'publicParametersHint')}</p>
                      <div className={css.configGrid}>
                        {selected.fields.filter(field => field.secret === secret).map(field => (
                          <div key={field.key} className={`${css.field} ${field.schema.type === 'array' || /_(?:JSON|TOML)$/.test(field.key) ? css.fieldWide : ''}`}>
                            <label htmlFor={`${prefix}-${field.key}`}>
                              <span>
                                {field.key}{' '}
                                <small className={field.required ? css.required : css.muted}>
                                  {t(field.required ? 'required' : 'optional')}
                                </small>{' '}
                                <small className={css.muted}>{field.secret ? t('secretField') : field.schema.type}</small>
                              </span>
                              {fieldInput(field)}
                              <small id={`${prefix}-${field.key}-hint`} className={css.muted}>
                                {field.description || t('fieldNoDescription')}
                              </small>
                            </label>
                            {field.secret && selected.configuredSecrets.includes(field.key) && (
                              <button
                                type="button"
                                className={css.danger}
                                disabled={busy}
                                onClick={() => {
                                  if (!window.confirm(t('clearSecretConfirm'))) return
                                  void run(async (signal) => {
                                    await invoke('clear-secret', signal, { id: selected.capability.id, key: field.key })
                                    const result = form(
                                      await invoke(`configuration?id=${encodeURIComponent(selected.capability.id)}`, signal),
                                    )
                                    if (!signal.aborted) {
                                      setSelected(result)
                                      setSecrets({})
                                      setNotice('secretCleared')
                                    }
                                  })
                                }}
                              >
                                {t('clearSecret')}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </fieldset>
                  ))}
                  <div className={css.formActions}>
                    <button type="submit" className={css.primary} disabled={busy}>
                      {t('saveConfiguration')}
                    </button>
                  </div>
                </form>
                {selected.configurationSaved && <p className={css.muted}>{t('configurationSaved')}</p>}
              </>
            )}
          </section>
        ) : (
          <>
            <form
              className={css.search}
              onSubmit={(event) => {
                event.preventDefault()
                void run(signal => search(1, signal))
              }}
            >
              <div className={css.searchInput}>
                <HubIcon kind="search" />
                <input
                  aria-label={t('query')}
                  placeholder={t('query')}
                  value={query}
                  disabled={busy}
                  onChange={(event) => {
                    setQuery(event.target.value)
                  }}
                />
              </div>
              <select
                aria-label={t('all')}
                value={type}
                disabled={busy}
                onChange={(event) => {
                  setType(event.target.value)
                }}
              >
                <option value="">{t('all')}</option>
                {['mcp', 'skill', 'plugin', 'agent', 'hook', 'policy', 'pack'].map(kind => (
                  <option key={kind}>{kind}</option>
                ))}
              </select>
              <button type="submit" className={css.primary} disabled={busy || !configured}>
                {t('search')}
              </button>
            </form>
            {rows === null ? (
              <p className={css.empty}>{t('unsearched')}</p>
            ) : (
              <>
                <p className={css.muted}>
                  {t('total')}: {total}
                </p>
                {rows.length === 0 && <p className={css.empty}>{t('empty')}</p>}
                <div className={css.results}>
                  {rows.map(item => (
                    <article className={css.row} key={item.id}>
                      <div>
                        <div className={css.name}>
                          <span className={css.resourceIcon}><HubIcon kind={item.type} size={21} /></span>
                          <h2>{item.name}</h2>
                          <span className={css.badge}>{item.type}</span>
                        </div>
                        <p>{item.description}</p>
                        <p className={css.meta}>
                          {item.id} · {t('source')}: {item.source} · {t('version')}: {item.version}
                        </p>
                        <p>
                          <span className={css.status} data-state={!item.hasRuntimeBinding ? 'unsupported' : item.activation}>
                            {item.hasRuntimeBinding ? status(item) : t('missingBinding')}
                          </span>
                        </p>
                      </div>
                      <div className={css.cardBottom}>
                        <button
                          disabled={busy}
                          onClick={() => {
                            void run(signal => openCapability(item, signal))
                          }}
                        >
                          {t('details')}
                        </button>
                        {capabilityActions(item)}
                      </div>
                    </article>
                  ))}
                </div>
                {mode !== 'installed' && (
                  <nav className={css.pagination} aria-label={t('search')}>
                    <button
                      disabled={busy || page <= 1}
                      onClick={() => {
                        void run(signal => search(page - 1, signal))
                      }}
                    >
                      {t('previous')}
                    </button>
                    <span>{page}</span>
                    <button
                      disabled={busy || page * 20 >= total}
                      onClick={() => {
                        void run(signal => search(page + 1, signal))
                      }}
                    >
                      {t('next')}
                    </button>
                  </nav>
                )}
                {mode === 'installed' && (
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm(t('rollbackConfirm'))) return
                      void run(async (signal) => {
                        await invoke('lifecycle', signal, { action: 'rollback' })
                        await search(1, signal)
                        setNotice('operationCompleted')
                      })
                    }}
                  >
                    {t('rollback')}
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>
      <footer className={css.footer}>{t('installationNotice')}</footer>
    </section>
  )
}
