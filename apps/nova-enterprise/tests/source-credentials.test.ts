/** 验证桌面和 CLI 相同的 authRef 规范；使用隔离字典，不读生产环境或发送请求。 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sourceCredential } from '../src/source-credentials.ts'

test('来源引用支持原名及规范化环境键，显式空原值不借其他凭据提权', () => {
  const environment = { NOVA_SECRET_INTERNAL_NPM_TOKEN: 'normalized', 'INTERNAL/NPM_TOKEN': 'direct' }
  assert.equal(sourceCredential('INTERNAL/NPM_TOKEN', environment), 'direct')
  assert.equal(sourceCredential('INTERNAL/NPM_TOKEN', { NOVA_SECRET_INTERNAL_NPM_TOKEN: 'normalized' }), 'normalized')
  assert.equal(sourceCredential('INTERNAL/NPM_TOKEN', { ...environment, 'INTERNAL/NPM_TOKEN': '' }), '')
  assert.equal(sourceCredential(undefined, environment), undefined)
  assert.equal(sourceCredential('missing', environment), undefined)
})
