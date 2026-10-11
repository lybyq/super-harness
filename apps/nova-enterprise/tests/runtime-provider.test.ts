/** 参数绑定的类型、安全边界与 Electron Node 启动方式单元验证。 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bindValue, mcpConfiguration } from '../src/runtime-provider.ts'
test('精确占位符保留 JSON 类型，缺失参数拒绝，不执行 shell/JS', () => {
  assert.deepEqual(bindValue({ a: '${COUNT}', b: 'url/${NAME}' }, { COUNT: 2, NAME: 'one' }), { a: 2, b: 'url/one' })
  assert.throws(() => bindValue('${TOKEN}', {}), { code: 'HUB_CONFIGURATION_REQUIRED' })
  assert.equal(bindValue('$(whoami)', {}), '$(whoami)')
})
test('stdio 启动按精确 bin 注入参数并使用 Electron Node 模式', async () => {
  const document = { id: 'jira', versions: [{ version: '1.0.0', runtimeBindings: { 'deepseek-harness': {
    configuration: { bin: 'jira', env: { JIRA_TOKEN: '${token.ref}' }, args: ['--project', '${PROJECT}'] },
  } } }] }
  const config = await mcpConfiguration(document, { version: '1.0.0', storePath: '/safe' },
    { values: { PROJECT: 'ONE' }, secrets: { 'token.ref': 'secret' } }, {
      resolveMcpCommand: async (_store, bin) => { assert.equal(bin, 'jira'); return { executable: 'node', arguments: ['/safe/server.js'] } },
    })
  assert.deepEqual(config.args, ['/safe/server.js', '--project', 'ONE'])
  assert.equal(config.env.JIRA_TOKEN, 'secret')
  assert.equal(config.env.ELECTRON_RUN_AS_NODE, '1')
})
