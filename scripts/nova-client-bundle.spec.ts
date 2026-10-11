/** 验证 apps 下的 Nova 插件复用官方构建器、模块表和源码映射，不另外创建浏览器壳。 */
import { join } from 'node:path'
import { build } from 'tsdown'
import { expect, it } from 'vitest'
import { clientBundle } from '../packages/client/tsdown.client.ts'

const root = join(import.meta.dirname, '..'), app = join(root, 'apps/nova-enterprise')

/** @param id 工作区包名。 @returns 官方共享构建器的浏览器配置；实际构建阶段会验证包声明。 */
function clientConfig(id: string) {
  const config = clientBundle(id, [])({ env: {} }).find(config => config.platform === 'browser')
  if (config === undefined) throw new Error('Nova Client config missing')
  return config
}

it('Nova app 的源码映射指向仓库 apps 路径而不是不存在的包目录', () => {
  const options = clientConfig('@deepseek-ai/dsh-nova-enterprise').outputOptions
  if (options === undefined || typeof options === 'function' || Array.isArray(options) || options.sourcemapPathTransform === undefined) throw new Error('Nova source-map transform missing')
  expect(options.sourcemapPathTransform('../src/client/HubPanel.tsx', join(app, 'lib/client.js.map')))
    .toBe('../../../apps/nova-enterprise/src/client/HubPanel.tsx')
})

it('真实 Nova app 清单可构建官方模块加载器工厂，未知包名被拒绝', async () => {
  const configs = await build({ ...clientConfig('@deepseek-ai/dsh-nova-enterprise'), cwd: app,
    config: false, write: false, clean: false, exports: false, report: false, logLevel: 'silent' })
  try {
    expect(configs.flatMap(bundle => bundle.chunks).some(chunk => chunk.type === 'chunk' && chunk.code.includes('@deepseek-ai/dsh-nova-enterprise'))).toBe(true)
  } finally { for (const config of configs) await config[Symbol.asyncDispose]() }
  await expect(build({ ...clientConfig('@deepseek-ai/dsh-nova-missing'), cwd: app,
    config: false, write: false, clean: false, exports: false, report: false, logLevel: 'silent' }))
    .rejects.toThrow(/no workspace package manifest declares/u)
})
