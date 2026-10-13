/** 欢迎页先显示本地品牌图片；只有内网图片真正加载成功后才切换，不循环重试。 */
import { useState } from 'react'
import { NOVA_BRANDING } from '../branding.ts'

/** @param props.label 本地化的品牌名称。 @returns 带即时本地兜底的品牌图标。 */
export function NovaLogo({ label }: { label: string }) {
  const [loaded, setLoaded] = useState(false)
  return <span className="nova-brand-lockup">
    <span className="nova-brand-mark" role="img" aria-label={label}>
      <img src={NOVA_BRANDING.fallbackLogoUrl} alt="" aria-hidden="true" hidden={loaded} width="40" height="40" />
      <img src={NOVA_BRANDING.logoUrl} alt="" aria-hidden="true" hidden={!loaded} width="40" height="40"
        referrerPolicy="no-referrer" onLoad={() => { setLoaded(true) }} onError={() => { setLoaded(false) }} />
    </span>
    <span className="nova-brand-name">{label}</span>
  </span>
}
