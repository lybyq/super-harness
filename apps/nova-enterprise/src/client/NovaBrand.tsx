/** 通过原生品牌插槽展示 Nova；只读品牌数据由桌面 preload 提供，普通 Web 不被换牌。 */
import { useState } from 'react'

/** 桌面 preload 公开的品牌信息；不附带 Node、网络代理或凭据操作。 */
export interface NovaDesktopBrand {
  readonly name: string
  readonly logoUrl: string
  readonly fallbackLogoUrl: string
}

declare global {
  interface Window {
    readonly novaBrand?: NovaDesktopBrand
  }
}

/** @param props 官方表面尺寸、样式和桌面品牌。 @returns 加载期间与失败时立即显示本地兜底的 Logo。 */
export function NovaBrandMark({ size, className, brand }: { size: number; className?: string | undefined; brand: NovaDesktopBrand }) {
  const [loaded, setLoaded] = useState(false)
  return <span className={className} role="img" aria-label={brand.name} style={{ display: 'inline-flex', width: size, height: size, flexShrink: 0 }}>
    <img src={brand.fallbackLogoUrl} alt="" aria-hidden="true" hidden={loaded} width={size} height={size} style={{ objectFit: 'contain' }} />
    <img src={brand.logoUrl} alt="" aria-hidden="true" hidden={!loaded} width={size} height={size} style={{ objectFit: 'contain' }}
      referrerPolicy="no-referrer" onLoad={() => { setLoaded(true) }} onError={() => { setLoaded(false) }} />
  </span>
}

/** @param props 桌面品牌。 @returns 不含官方字标的 Nova 名称。 */
export function NovaBrandName({ brand }: { brand: NovaDesktopBrand }) {
  return <span style={{ fontFamily: 'var(--dsw-font-family-brand)', fontSize: 18, fontWeight: 600, letterSpacing: '-.02em', color: 'var(--dsw-alias-label-primary)' }}>{brand.name}</span>
}
