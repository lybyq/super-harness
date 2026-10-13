/** Nova 桌面品牌；内网图片只由界面请求，本地 SVG 在加载前和失败时兜底。 */
const fallbackSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#152a37"/><path d="M18 46V18l28 28V18" fill="none" stroke="#edf7f4" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="m49 7 2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#8edec1"/></svg>'

/** 随 preload 只读传递的公开品牌信息，不包含账号，不改变 AppId、协议或用户数据目录。 */
export const NOVA_BRANDING = Object.freeze({
  name: 'Nova',
  logoUrl: 'http://10.64.66.26:7789/static/nova-ui/logo.png',
  fallbackLogoUrl: `data:image/svg+xml,${encodeURIComponent(fallbackSvg)}`,
})

/** @param title 页面标题。 @returns 仅替换应用标题首尾的官方产品名，保留任务或模型名称。 */
export function novaWindowTitle(title: string): string {
  return title.replace(/^(?:DeepSeek Harness|DSH Local Build|DSH 本地构建)(?=\s*(?:[-–—|·]|$))/u, NOVA_BRANDING.name)
    .replace(/(?<=[-–—|·]\s*)(?:DeepSeek Harness|DSH Local Build|DSH 本地构建)$/u, NOVA_BRANDING.name)
}
