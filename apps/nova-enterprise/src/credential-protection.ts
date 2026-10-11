/** Windows 用户级 DPAPI 保护企业配置记录；秘密只经过子进程 stdin，不进入命令参数或日志。 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { HubError } from './hub-client.ts'
import { object } from './catalog.ts'
import type { CredentialProvider, CredentialKey, CredentialRecord } from '@deepseek-ai/dsh-credentials'

/** 可替换的密文编解码器；实现必须绑定记录键，不允许跨键重放密文。 */
export interface CredentialCipher {
  seal(key: string, value: string): Promise<string>
  open(key: string, value: string): Promise<string>
}

const DPAPI_SCRIPT = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Security
$inputRecord = [Console]::In.ReadToEnd() | ConvertFrom-Json
$data = [Convert]::FromBase64String($inputRecord.data)
$entropy = [Convert]::FromBase64String($inputRecord.entropy)
$scope = [System.Security.Cryptography.DataProtectionScope]::CurrentUser
if ($inputRecord.operation -eq 'seal') {
  $result = [System.Security.Cryptography.ProtectedData]::Protect($data, $entropy, $scope)
} else {
  $result = [System.Security.Cryptography.ProtectedData]::Unprotect($data, $entropy, $scope)
}
[Console]::Out.Write([Convert]::ToBase64String($result))
`

/** @param timeoutMs 子进程最大等待时间。 @returns 当前 Windows 登录账户的 DPAPI 编解码器；其他系统明确拒绝。 */
export function windowsCredentialCipher(timeoutMs: number): CredentialCipher {
  if (process.platform !== 'win32') throw new HubError('HUB_SECRET_PROTECTION_UNAVAILABLE')
  const transform = (operation: 'seal' | 'open', key: string, value: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const env = Object.fromEntries(
        Object.entries(process.env).filter(([name]) => !/KEY|SECRET|TOKEN|PASSWORD/i.test(name)),
      )
      const child = spawn(
        'powershell.exe',
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-EncodedCommand',
          Buffer.from(DPAPI_SCRIPT, 'utf16le').toString('base64'),
        ],
        { windowsHide: true, shell: false, env, stdio: ['pipe', 'pipe', 'pipe'] },
      )
      let output = '',
        failed = false,
        timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        child.kill()
      }, timeoutMs)
      child.on('error', () => {
        failed = true
      })
      child.stdin.on('error', () => {
        failed = true
      })
      child.stderr.on('data', () => {
        failed = true
      })
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString('utf8')
        if (output.length > 4 * 1024 * 1024) {
          failed = true
          child.kill()
        }
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        if (failed || timedOut || code !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(output)) {
          reject(new HubError('HUB_SECRET_PROTECTION_UNAVAILABLE'))
          return
        }
        resolve(operation === 'open' ? Buffer.from(output, 'base64').toString('utf8') : output)
      })
      child.stdin.end(
        JSON.stringify({
          operation,
          entropy: createHash('sha256').update(key).digest('base64'),
          data: operation === 'seal' ? Buffer.from(value, 'utf8').toString('base64') : value,
        }),
      )
    })
  return { seal: (key, value) => transform('seal', key, value), open: (key, value) => transform('open', key, value) }
}

/**
 * 封装企业配置读写；旧明文在原子锁内迁移，失败不提交替换值，不影响其他插件的凭据。
 * @param provider 官方凭据服务。
 * @param cipher 保护器；undefined 显式保留原存储行为。
 * @returns readRecord/modifyRecord，调用者只处理解密后的 Host 记录。
 */
export function protectedCredentials(
  provider: Pick<CredentialProvider, 'readRecord' | 'modifyRecord'>,
  cipher?: CredentialCipher,
) {
  const decode = async (
    key: CredentialKey,
    record: CredentialRecord | undefined,
  ): Promise<CredentialRecord | undefined> => {
    if (!record || record.kind !== 'grant') return record
    const payload = object(record.payload, 'HUB_LOCAL_STATE_INVALID')
    if (payload.protection !== 'windows-dpapi-v1') return record
    if (
      !cipher ||
      typeof payload.ciphertext !== 'string' ||
      Object.keys(payload).some(name => !['protection', 'ciphertext'].includes(name))
    )
      throw new HubError('HUB_SECRET_PROTECTION_UNAVAILABLE')
    let value: unknown
    try {
      value = JSON.parse(await cipher.open(key, payload.ciphertext))
    } catch (_error) {
      throw new HubError('HUB_SECRET_PROTECTION_UNAVAILABLE')
    }
    return { kind: 'grant', payload: object(value, 'HUB_LOCAL_STATE_INVALID') }
  }
  const encode = async (
    key: CredentialKey,
    record: CredentialRecord | undefined,
  ): Promise<CredentialRecord | undefined> => {
    if (!record || record.kind !== 'grant' || !cipher) return record
    try {
      return {
        kind: 'grant',
        payload: { protection: 'windows-dpapi-v1', ciphertext: await cipher.seal(key, JSON.stringify(record.payload)) },
      }
    } catch (_error) {
      throw new HubError('HUB_SECRET_PROTECTION_UNAVAILABLE')
    }
  }
  return {
    /** @param key 企业配置记录键。 @returns 已解密记录；旧值仅在加密成功后原子替换。 */
    async readRecord(key: CredentialKey) {
      const record = await provider.readRecord(key)
      if (cipher && record?.kind === 'grant' && object(record.payload).protection !== 'windows-dpapi-v1') {
        const migrated = await provider.modifyRecord(key, async current => encode(key, await decode(key, current)))
        return decode(key, migrated)
      }
      return decode(key, record)
    },
    /** @param key 企业配置记录键。 @param update 锁内修改解密记录。 @returns 已提交的解密记录，密文始终留在 Provider。 */
    async modifyRecord(
      key: CredentialKey,
      update: (record: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
    ) {
      return decode(
        key,
        await provider.modifyRecord(key, async current => encode(key, await update(await decode(key, current)))),
      )
    },
  }
}
