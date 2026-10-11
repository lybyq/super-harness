/** 凭据保护回归：真实 Windows DPAPI、旧记录迁移、失败保留和跨键拒绝。 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { protectedCredentials, windowsCredentialCipher } from '../src/credential-protection.ts'
import type { CredentialKey, CredentialRecord } from '@deepseek-ai/dsh-credentials'

/** @returns 原子写入测试存储；回调抛错不会提交新值。 */
function storage() {
  const records = new Map<CredentialKey, CredentialRecord>()
  return { records, readRecord: async (key: CredentialKey) => records.get(key),
    modifyRecord: async (key: CredentialKey, update: (record: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>) => {
      const next = await update(records.get(key))
      if (next !== undefined) records.set(key, next)
      return next ?? records.get(key)
    } }
}
test('真实 DPAPI 密文不含秘密，读取时原子迁移，密文不能换键解密', { skip: process.platform !== 'win32', timeout: 30000 }, async () => {
  const store = storage(), cipher = windowsCredentialCipher(10000), protectedStore = protectedCredentials(store, cipher)
  const key = 'configuration-one', original: CredentialRecord = { kind: 'grant', payload: { values: { URL: 'https://jira.invalid' }, secrets: { TOKEN: 'fixture-private-中文' } } }
  store.records.set(key, original)
  assert.deepEqual(await protectedStore.readRecord(key), original)
  assert.equal(JSON.stringify(store.records.get(key)).includes('fixture-private'), false)
  assert.equal(store.records.get(key)?.kind, 'grant')
  store.records.set('configuration-two', store.records.get(key)!)
  await assert.rejects(protectedStore.readRecord('configuration-two'), { code: 'HUB_SECRET_PROTECTION_UNAVAILABLE' })
  await assert.rejects(protectedCredentials(store).readRecord(key), { code: 'HUB_SECRET_PROTECTION_UNAVAILABLE' })
  await protectedStore.modifyRecord(key, async record => ({ kind: 'grant', payload: { ...record?.kind === 'grant' ? record.payload : {}, changed: true } }))
  assert.equal((await protectedStore.readRecord(key))?.kind, 'grant')
})
test('加密失败不覆盖旧明文，不把底层异常中的秘密暴露给调用者', async () => {
  const store = storage(), key = 'old-configuration'
  const original: CredentialRecord = { kind: 'grant', payload: { TOKEN: 'must-retain' } }; store.records.set(key, original)
  const secure = protectedCredentials(store, { seal: async () => { throw new Error('fixture-password') }, open: async () => '' })
  await assert.rejects(secure.readRecord(key), { code: 'HUB_SECRET_PROTECTION_UNAVAILABLE' })
  assert.deepEqual(store.records.get(key), original)
})
