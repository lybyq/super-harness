/** 单资源详情和统一 MCP 向导共用的动态字段控件；不自行推断 MCP 参数或保存凭据。 */
import type { ReactNode } from 'react'
import type { Field, ConfigurationValue } from './api.ts'
import type { HubLocaleKey } from './locales.ts'
import css from './HubPanel.module.css'

interface Props {
  field: Field
  value: ConfigurationValue | undefined
  arrayDraft?: string | undefined
  configured: boolean
  busy: boolean
  prefix: string
  t: (key: HubLocaleKey) => string
  onChange: (value: ConfigurationValue) => void
  onArray: (value: string) => void
}

/** @param props 权威字段与当前资源独立草稿。 @returns 具备关联标签、必填和类型约束的受控控件。 */
export function ConfigurationInput({ field, value, arrayDraft, configured, busy, prefix, t, onChange, onArray }: Props): ReactNode {
  const common = { id: `${prefix}-${field.key}`, disabled: busy, required: field.required && !configured,
    'aria-describedby': `${prefix}-${field.key}-hint` }
  if (field.schema.type === 'array') return <>
    <textarea {...common} rows={3} value={arrayDraft ?? JSON.stringify(value ?? [])}
      onChange={(event) =>{  onArray(event.target.value) }} />
    <small className={css.muted}>{t('arrayHint')}</small>
  </>
  if (field.schema.enum) return <select {...common}
    value={value === undefined || Array.isArray(value) ? '' : String(field.schema.enum.indexOf(value))}
    onChange={(event) => {
      const selected = event.target.value === '' ? '' : field.schema.enum?.[Number(event.target.value)]
      if (selected !== undefined) onChange(selected)
    }}>
    <option value="" />
    {field.schema.enum.map((entry, index) => <option key={index} value={index}>{String(entry)}</option>)}
  </select>
  if (field.schema.type === 'boolean') return <select {...common} value={value === undefined ? '' : String(value)}
    onChange={(event) =>{  onChange(event.target.value === '' ? '' : event.target.value === 'true') }}>
    <option value="" /><option value="true">true</option><option value="false">false</option>
  </select>
  if (!field.secret && field.schema.type === 'string' && /_(?:JSON|TOML)$/.test(field.key)) return <textarea {...common}
    rows={8} spellCheck={false} value={typeof value === 'string' ? value : ''}
    minLength={field.schema.minLength} maxLength={field.schema.maxLength} onChange={(event) =>{  onChange(event.target.value) }} />
  const numeric = field.schema.type === 'integer' || field.schema.type === 'number'
  return <input {...common} type={field.secret ? 'password' : numeric ? 'number' : field.schema.format === 'uri' ? 'url' : 'text'}
    autoComplete={field.secret ? 'new-password' : 'off'} value={String(value ?? '')}
    min={field.schema.minimum} max={field.schema.maximum} minLength={field.schema.minLength} maxLength={field.schema.maxLength}
    step={field.schema.type === 'integer' ? 1 : 'any'} placeholder={field.secret && configured ? t('secretConfigured') : undefined}
    onChange={(event) =>{  onChange(numeric && event.target.value !== '' ? Number(event.target.value) : event.target.value) }} />
}
