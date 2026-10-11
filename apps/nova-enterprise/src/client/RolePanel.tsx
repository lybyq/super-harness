/** 角色组合的纯展示组件；网络、凭据和安装操作仍由 Host 与面板控制器拥有。 */
import type { ReactNode } from 'react'
import type { Role, RolePlan } from './api.ts'
import type { HubLocaleKey } from './locales.ts'
import css from './HubPanel.module.css'

/** 角色页只接收脱敏模型和回调，不读取 Cordis 服务、不持有 Hub 令牌。 */
interface Props {
  t: (key: HubLocaleKey) => string
  roles: Role[] | null
  selected: string[]
  plan: RolePlan | null
  busy: boolean
  configured: boolean
  onLoad: () => void
  onSelect: (id: string, selected: boolean) => void
  onResolve: () => void
}

/**
 * 展示已发布角色、多角色选择及解析预览；复选角色是能力组合，不是并发 Agent 团队。
 * @param props 脱敏角色模型、语言函数、忙碌状态和用户操作回调。
 * @returns 角色列表与精确版本、顺序和权限说明；不会调用安装或授予权限。
 */
export function RolePanel({
  t,
  roles,
  selected,
  plan,
  busy,
  configured,
  onLoad,
  onSelect,
  onResolve,
}: Props): ReactNode {
  return (
    <section aria-label={t('rolesTitle')}>
      <h2>{t('rolesTitle')}</h2>
      <p className={css.muted}>{t('rolesIntro')}</p>
      <div className={css.actions}>
        <button disabled={busy || !configured} onClick={onLoad}>
          {t('loadRoles')}
        </button>
        <button disabled={busy || selected.length === 0} onClick={onResolve}>
          {t('resolveRoles')}
        </button>
      </div>
      {roles === null ? (
        <p className={css.empty}>{t('rolesUnloaded')}</p>
      ) : roles.length === 0 ? (
        <p className={css.empty}>{t('rolesEmpty')}</p>
      ) : (
        <div className={css.results}>
          {roles.map(role => (
            <label className={css.roleRow} key={role.id}>
              <input
                type="checkbox"
                disabled={busy || !role.selectable}
                checked={selected.includes(role.id)}
                onChange={(event) => {
                  onSelect(role.id, event.target.checked)
                }}
              />
              <span>
                <span>{role.name}</span>
                <small className={css.meta}>
                  {' '}
                  {role.id} · {role.version} · {t(role.selectable ? 'rolePublished' : 'roleDraft')}
                </small>
                <p className={css.muted}>{role.description}</p>
              </span>
            </label>
          ))}
        </div>
      )}
      {plan && (
        <section className={css.detail} aria-label={t('rolePlanTitle')}>
          <h2>{t('rolePlanTitle')}</h2>
          <p>
            {plan.role.name} · {plan.role.version}
          </p>
          <p className={css.notice}>{t('rolePlanNotice')}</p>
          {plan.missingRuntimeBindings.length > 0 && (
            <p className={css.error}>
              {t('roleMissingBindings')}: {plan.missingRuntimeBindings.join(', ')}
            </p>
          )}
          <ol>
            {plan.installationOrder.map((id) => {
              const capability = plan.capabilities.find(item => item.id === id)
              return (
                <li key={id}>
                  {id} · {capability?.version} · {t(capability?.enabled ? 'roleEnabled' : 'roleDisabled')}
                </li>
              )
            })}
          </ol>
          <h3>{t('rolePermissions')}</h3>
          <p className={css.muted}>{t('rolePermissionsNotice')}</p>
          <ul>
            {plan.permissions.map(rule => (
              <li key={rule.id}>
                {rule.effect} · {rule.action} · {rule.resource}
                {rule.enforced ? ` · ${t('roleEnforced')}` : ''}
              </li>
            ))}
          </ul>
          <p>
            {t('roleRequiredConfig')}: {plan.requiredConfiguration.join(', ') || '—'}
          </p>
          <p>
            {t('roleRequiredSecrets')}: {plan.requiredSecrets.join(', ') || '—'}
          </p>
          <p className={css.muted}>
            {t('roleWarnings')}: {plan.warningCount}
          </p>
          <p className={css.meta}>
            {t('roleChecksum')}: {plan.checksum}
          </p>
        </section>
      )}
    </section>
  )
}
