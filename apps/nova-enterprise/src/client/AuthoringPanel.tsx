/** 资源开发与发布入口：文件先校验再由用户确认上传，浏览器不持有来源凭据。 */
import { useEffect, useState, type ReactNode } from 'react'
import { invoke as hostInvoke, HubUiError } from './api.ts'
import type { HubLocaleKey } from './locales.ts'
import css from './HubPanel.module.css'

interface Source {
  id: string
  name: string
  type: 'gitlab' | 'npm'
  scopes: string[]
  manifestPath: string
  manifestField: string
  seedPackages: string[]
}
interface FileDraft {
  path: string
  content: string
}
interface Props {
  workspace?: string
  t: (key: HubLocaleKey) => string
  busy: boolean
  run: (action: (signal: AbortSignal) => Promise<void>) => Promise<void>
  notify: (key: HubLocaleKey) => void
  onDirty: (dirty: boolean) => void
}
/** @param value Host 返回值。 @returns 已排除数组和空值的对象；仍须校验所用字段。 */
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HubUiError('HUB_RESPONSE_INVALID')
  return value as Record<string, unknown>
}
/** @param value 文件列表响应。 @returns 准入后的可编辑文本清单，不执行其中代码。 */
const filesFrom = (value: unknown): FileDraft[] => {
  if (!Array.isArray(value)) throw new HubUiError('HUB_RESPONSE_INVALID')
  return value.map((entry) => {
    const file = object(entry)
    if (typeof file.path !== 'string' || typeof file.content !== 'string') throw new HubUiError('HUB_RESPONSE_INVALID')
    return { path: file.path, content: file.content }
  })
}

/** @param props 官方语言函数和面板操作协调器。 @returns 文本模板、文件编辑、准入与精确发布流程；不会自动上传。 */
export function AuthoringPanel({ t, busy, run, notify, onDirty, workspace = '' }: Props): ReactNode {
  const invoke = (path: string, signal: AbortSignal, payload?: object): Promise<unknown> =>
    hostInvoke(path, signal, payload, workspace)
  const [prepared, setPrepared] = useState<{ draftId: string; id: string; version: string }[]>([]),
    [draftId, setDraftId] = useState('')
  const [sources, setSources] = useState<Source[]>([]),
    [enabled, setEnabled] = useState(false)
  const [budget, setBudget] = useState(0),
    [type, setType] = useState('skill'),
    [id, setId] = useState('my-skill')
  const [version, setVersion] = useState('1.0.0'),
    [sourceId, setSourceId] = useState(''),
    [projectId, setProjectId] = useState('')
  const [packageName, setPackageName] = useState(''),
    [files, setFiles] = useState<FileDraft[]>([]),
    [selected, setSelected] = useState(0)
  const [checksum, setChecksum] = useState(''),
    [result, setResult] = useState('')
  const [pluginFlavor, setPluginFlavor] = useState('standard'),
    [boards, setBoards] = useState<{ id: string }[]>([]),
    [boardReceipt, setBoardReceipt] = useState('')
  const [receipt, setReceipt] = useState(''),
    [dirty, setDirty] = useState(false)
  const source = sources.find(item => item.id === sourceId)
  useEffect(() => {
    onDirty(dirty)
  }, [dirty, onDirty])
  /** @returns 丢弃之前的校验摘要；任意文件或坐标修改都必须重新校验。 */
  const changed = (): void => {
    setChecksum('')
    setResult('')
    setReceipt('')
    setDirty(true)
  }
  useEffect(() => {
    void run(async (signal) => {
      const value = object(await invoke('authoring', signal))
      if (signal.aborted) return
      if (
        typeof value.enabled !== 'boolean' ||
        typeof value.maxRequestBytes !== 'number' ||
        !Array.isArray(value.sources)
      )
        throw new HubUiError('HUB_RESPONSE_INVALID')
      const admitted = value.sources.map((entry) => {
        const row = object(entry)
        if (
          typeof row.id !== 'string' ||
          typeof row.name !== 'string' ||
          !['gitlab', 'npm'].includes(String(row.type)) ||
          (row.scopes !== undefined &&
            (!Array.isArray(row.scopes) || row.scopes.some(scope => typeof scope !== 'string'))) ||
          (row.manifestPath !== undefined && typeof row.manifestPath !== 'string') ||
          (row.manifestField !== undefined && typeof row.manifestField !== 'string') ||
          (row.seedPackages !== undefined &&
            (!Array.isArray(row.seedPackages) || row.seedPackages.some(name => typeof name !== 'string')))
        )
          throw new HubUiError('HUB_RESPONSE_INVALID')
        return {
          id: row.id,
          name: row.name,
          type: row.type as 'gitlab' | 'npm',
          scopes: (row.scopes ?? []) as string[],
          manifestPath: row.manifestPath ?? 'nova.manifest.yaml',
          manifestField: row.manifestField ?? 'novaHarness',
          seedPackages: (row.seedPackages ?? []) as string[],
        }
      })
      setSources(admitted)
      setEnabled(value.enabled)
      setBudget(value.maxRequestBytes)
      setSourceId(admitted.find(item => item.type === 'gitlab')?.id ?? '')
    })
  }, [])
  const draft = (): object => ({
    id,
    type,
    version,
    sourceId,
    files,
    ...(type === 'mcp' ? {} : { projectId: Number(projectId) }),
  })
  return (
    <section className={css.authoring}>
      <header>
        <h2>{t('authoringTitle')}</h2>
        <p className={css.muted}>{t('authoringHint')}</p>
      </header>
      <div className={css.actions}>
        <button
          disabled={busy}
          onClick={() => {
            void run(async (signal) => {
              const result = await invoke('drafts', signal)
              if (!Array.isArray(result)) throw new HubUiError('HUB_RESPONSE_INVALID')
              const admitted = result.map((value) => {
                const row = object(value)
                if (typeof row.draftId !== 'string' || typeof row.id !== 'string' || typeof row.version !== 'string')
                  throw new HubUiError('HUB_RESPONSE_INVALID')
                return { draftId: row.draftId, id: row.id, version: row.version }
              })
              if (!signal.aborted) {
                setPrepared(admitted)
                setDraftId(admitted[0]?.draftId ?? '')
              }
            })
          }}
        >
          {t('loadGeneratedDrafts')}
        </button>
        <select
          aria-label={t('generatedDrafts')}
          disabled={busy}
          value={draftId}
          onChange={(event) => {
            setDraftId(event.target.value)
          }}
        >
          <option value="" />
          {prepared.map(item => (
            <option key={item.draftId} value={item.draftId}>
              {item.id}@{item.version}
            </option>
          ))}
        </select>
        <button
          disabled={busy || !draftId}
          onClick={() => {
            if (files.length && !window.confirm(t('replaceDraftConfirm'))) return
            void run(async (signal) => {
              const value = object(await invoke('drafts', signal, { draftId }))
              if (
                typeof value.id !== 'string' ||
                typeof value.version !== 'string' ||
                !['skill', 'mcp', 'plugin'].includes(String(value.type))
              )
                throw new HubUiError('HUB_RESPONSE_INVALID')
              const imported = filesFrom(value.files)
              if (!signal.aborted) {
                setId(value.id)
                setVersion(value.version)
                setType(String(value.type))
                setFiles(imported)
                setSelected(0)
                setSourceId(sources.find(item => item.type === (value.type === 'mcp' ? 'npm' : 'gitlab'))?.id ?? '')
                changed()
              }
            })
          }}
        >
          {t('importGeneratedDraft')}
        </button>
        <button
          disabled={busy || !draftId}
          onClick={() => {
            if (!window.confirm(t('removeGeneratedDraft'))) return
            void run(async (signal) => {
              await invoke('drafts', signal, { action: 'remove', draftId })
              if (!signal.aborted) {
                setPrepared(previous => previous.filter(item => item.draftId !== draftId))
                setDraftId('')
              }
            })
          }}
        >
          {t('removeGeneratedDraft')}
        </button>
      </div>
      <p className={css.muted}>{t('generatedDraftHint')}</p>
      {!enabled && <p className={css.notice}>{t('publishingDisabled')}</p>}
      <div className={css.authoringFields}>
        <label>
          {t('resourceType')}
          <select
            value={type}
            disabled={busy}
            onChange={(event) => {
              const kind = event.target.value
              changed()
              setType(kind)
              setSourceId(sources.find(item => item.type === (kind === 'mcp' ? 'npm' : 'gitlab'))?.id ?? '')
            }}
          >
            <option>skill</option>
            <option>mcp</option>
            <option>plugin</option>
          </select>
        </label>
        {type === 'plugin' && (
          <label>
            {t('pluginFlavor')}
            <select
              disabled={busy}
              value={pluginFlavor}
              onChange={(event) => {
                setPluginFlavor(event.target.value)
                changed()
              }}
            >
              <option value="standard">{t('standardPlugin')}</option>
              <option value="jira-board">{t('jiraBoard')}</option>
              <option value="gitlab-board">{t('gitlabBoard')}</option>
            </select>
          </label>
        )}
        <label>
          {t('templateId')}
          <input
            value={id}
            disabled={busy}
            onChange={(event) => {
              changed()
              setId(event.target.value)
            }}
          />
        </label>
        <label>
          {t('version')}
          <input
            value={version}
            disabled={busy}
            onChange={(event) => {
              changed()
              setVersion(event.target.value)
            }}
          />
        </label>
        <label>
          {t('publishSource')}
          <select
            value={sourceId}
            disabled={busy}
            onChange={(event) => {
              changed()
              setSourceId(event.target.value)
            }}
          >
            <option value="" />
            {sources
              .filter(item => item.type === (type === 'mcp' ? 'npm' : 'gitlab'))
              .map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
        {type === 'mcp' ? (
          <label>
            {t('packageName')}
            <input
              value={packageName}
              placeholder={`${source?.scopes[0] ?? '@harness'}/${id}`}
              disabled={busy}
              onChange={(event) => {
                changed()
                setPackageName(event.target.value)
              }}
            />
          </label>
        ) : (
          <label>
            {t('gitlabProjectId')}
            <input
              type="number"
              min={1}
              value={projectId}
              disabled={busy}
              onChange={(event) => {
                changed()
                setProjectId(event.target.value)
              }}
            />
          </label>
        )}
      </div>
      <div className={css.actions}>
        <button
          disabled={busy}
          onClick={() => {
            if (files.length && !window.confirm(t('replaceDraftConfirm'))) return
            void run(async (signal) => {
              const generated = filesFrom(
                await invoke('authoring', signal, {
                  action: 'template',
                  id,
                  type,
                  version,
                  ...(type === 'plugin' ? { pluginFlavor } : {}),
                  manifestField: source?.manifestField,
                  packageName: packageName || source?.seedPackages[0] || `${source?.scopes[0] ?? '@harness'}/${id}`,
                }),
              )
              if (!signal.aborted) {
                setFiles(
                  generated.map(file =>
                    file.path === 'nova.manifest.yaml' && source?.type === 'gitlab'
                      ? { ...file, path: source.manifestPath }
                      : file,
                  ),
                )
                setSelected(0)
                changed()
              }
            })
          }}
        >
          {t('generateTemplate')}
        </button>
        <label className={css.fileImport}>
          {t('importFiles')}
          <input
            type="file"
            multiple
            disabled={busy}
            onChange={(event) => {
              const selectedFiles = Array.from(event.target.files ?? [])
              if (files.length && !window.confirm(t('replaceDraftConfirm'))) return
              void run(async (signal) => {
                if (selectedFiles.reduce((sum, file) => sum + file.size, 0) > budget)
                  throw new HubUiError('HUB_REQUEST_TOO_LARGE')
                const imported = await Promise.all(
                  selectedFiles.map(async file => ({
                    path: file.name,
                    content: new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()),
                  })),
                )
                if (!signal.aborted) {
                  setFiles(imported)
                  setSelected(0)
                  changed()
                }
              })
            }}
          />
        </label>
        <label className={css.fileImport}>
          {t('importDirectory')}
          <input
            type="file"
            multiple
            {...{ webkitdirectory: '' }}
            disabled={busy}
            onChange={(event) => {
              const selectedFiles = Array.from(event.target.files ?? []).filter(
                file =>
                  !file.webkitRelativePath.split('/').some(part => ['node_modules', '.git', '.env'].includes(part)),
              )
              if (files.length && !window.confirm(t('replaceDraftConfirm'))) return
              void run(async (signal) => {
                if (selectedFiles.length > 100 || selectedFiles.reduce((sum, file) => sum + file.size, 0) > budget)
                  throw new HubUiError('HUB_REQUEST_TOO_LARGE')
                const imported = await Promise.all(
                  selectedFiles.map(async file => ({
                    path: file.webkitRelativePath.split('/').slice(1).join('/'),
                    content: new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()),
                  })),
                )
                if (!signal.aborted) {
                  setFiles(imported)
                  setSelected(0)
                  changed()
                }
              })
            }}
          />
        </label>
      </div>
      {files.length > 0 && (
        <div className={css.fileEditor}>
          <nav aria-label={t('resourceFiles')}>
            {files.map((file, index) => (
              <button
                key={file.path}
                disabled={busy}
                aria-pressed={selected === index}
                onClick={() => {
                  setSelected(index)
                }}
              >
                {file.path}
              </button>
            ))}
          </nav>
          <label>
            {files[selected]?.path}
            <textarea
              value={files[selected]?.content ?? ''}
              rows={16}
              spellCheck={false}
              disabled={busy}
              onChange={(event) => {
                changed()
                setFiles(previous =>
                  previous.map((file, index) => (index === selected ? { ...file, content: event.target.value } : file)),
                )
              }}
            />
          </label>
        </div>
      )}
      <div className={css.actions}>
        <button
          disabled={busy || !files.length || !sourceId}
          onClick={() => {
            void run(async (signal) => {
              const value = object(await invoke('authoring', signal, { action: 'validate', ...draft() }))
              if (typeof value.checksum !== 'string') throw new HubUiError('HUB_RESPONSE_INVALID')
              if (!signal.aborted) {
                setChecksum(value.checksum)
                notify('draftValidated')
              }
            })
          }}
        >
          {t('validateDraft')}
        </button>
        <button
          className={css.primary}
          disabled={busy || !enabled || !checksum}
          onClick={() => {
            let destination = projectId
            if (type === 'mcp') {
              try {
                destination = String(
                  object(JSON.parse(files.find(file => file.path === 'package.json')?.content ?? '')).name,
                )
              } catch {
                return
              }
            }
            if (
              !window.confirm(`${t('publishConfirm')}\n${source?.name ?? sourceId} · ${id}@${version} · ${destination}`)
            )
              return
            void run(async (signal) => {
              const value = object(
                await invoke('authoring', signal, {
                  action: 'publish',
                  ...draft(),
                  confirmed: true,
                  expectedChecksum: checksum,
                }),
              )
              if (!['published', 'published-not-indexed', 'source-partial'].includes(String(value.outcome)))
                throw new HubUiError('HUB_RESPONSE_INVALID')
              if (
                typeof value.id !== 'string' ||
                typeof value.version !== 'string' ||
                (value.commitSha !== undefined &&
                  (typeof value.commitSha !== 'string' || !/^[a-f0-9]{40,64}$/.test(value.commitSha)))
              )
                throw new HubUiError('HUB_RESPONSE_INVALID')
              if (!signal.aborted) {
                setChecksum('')
                setDirty(false)
                setReceipt(
                  `${source?.name ?? sourceId} · ${value.id}@${value.version}${value.commitSha ? ` · ${value.commitSha}` : ''}`,
                )
                setResult(String(value.outcome))
                notify(
                  value.outcome === 'published'
                    ? 'resourcePublished'
                    : value.outcome === 'source-partial'
                      ? 'publicationPartial'
                      : 'publicationNotIndexed',
                )
              }
            })
          }}
        >
          {t('publishResource')}
        </button>
      </div>
      {result && (
        <p role="status" className={css.muted}>
          {t(
            result === 'published'
              ? 'resourcePublished'
              : result === 'source-partial'
                ? 'publicationPartial'
                : 'publicationNotIndexed',
          )}
        </p>
      )}
      {receipt && (
        <p className={css.muted}>
          <code>{receipt}</code>
        </p>
      )}
      <section>
        <h3>{t('issueBoards')}</h3>
        <p className={css.muted}>{t('issueBoardsHint')}</p>
        <button
          disabled={busy}
          onClick={() => {
            void run(async (signal) => {
              const raw = await invoke('integrations', signal)
              if (!Array.isArray(raw)) throw new HubUiError('HUB_RESPONSE_INVALID')
              const rows = raw.map((value) => {
                const row = object(value)
                if (typeof row.id !== 'string') throw new HubUiError('HUB_RESPONSE_INVALID')
                return { id: row.id }
              })
              if (!signal.aborted) setBoards(rows)
            })
          }}
        >
          {t('loadIssueBoards')}
        </button>
        {boards.map(board => (
          <button
            key={board.id}
            disabled={busy}
            onClick={() => {
              void run(async (signal) => {
                const result = await invoke('integrations', signal, { id: board.id })
                if (!signal.aborted) setBoardReceipt(JSON.stringify(result))
              })
            }}
          >
            {t('refreshIssueBoard')} · {board.id}
          </button>
        ))}
        {boardReceipt && <p role="status">{boardReceipt}</p>}
      </section>
    </section>
  )
}
