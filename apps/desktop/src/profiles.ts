/** 桌面多环境目录清单；各环境独立 Harness Home 和 Electron userData，不复制凭据。 */
import { readFileSync, existsSync, realpathSync, readdirSync } from 'node:fs'
import { dirname, isAbsolute, join, parse, relative, resolve, basename, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'

/** 本地注册的桌面环境；id 只用于已注册清单查找，不接受任意启动路径。 */
export interface DesktopProfile {
  readonly id: string
  readonly label: string
  readonly home: string
  readonly userData: string
}

interface ProfileDocument {
  readonly version: 1
  readonly selectedId: string
  readonly profiles: readonly DesktopProfile[]
}

function canonicalPath(path: string): string {
  let ancestor = resolve(path)
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor)
    if (parent === ancestor) throw new Error('desktop profiles: directory has no accessible ancestor')
    ancestor = parent
  }
  return resolve(realpathSync(ancestor), relative(ancestor, resolve(path)))
}

function overlaps(left: string, right: string): boolean {
  const a = process.platform === 'win32' ? left.toLowerCase() : left
  const b = process.platform === 'win32' ? right.toLowerCase() : right
  const rel = relative(a, b)
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`))
}

function validateProfiles(value: unknown): ProfileDocument {
  if (typeof value !== 'object' || value === null || !('version' in value) || value.version !== 1
    || !('selectedId' in value) || typeof value.selectedId !== 'string'
    || !('profiles' in value) || !Array.isArray(value.profiles) || value.profiles.length === 0 || value.profiles.length > 32) {
    throw new Error('desktop profiles: invalid profiles.json document')
  }
  const ids = new Set<string>()
  const paths: string[] = []
  const profiles = value.profiles.map((item: unknown): DesktopProfile => {
    if (typeof item !== 'object' || item === null || !('id' in item) || typeof item.id !== 'string'
      || !/^[a-z0-9-]{1,64}$/u.test(item.id) || ids.has(item.id)
      || !('label' in item) || typeof item.label !== 'string' || item.label.trim() === '' || item.label.length > 100 || /[\r\n\x00]/u.test(item.label)
      || !('home' in item) || typeof item.home !== 'string' || !isAbsolute(item.home)
      || !('userData' in item) || typeof item.userData !== 'string' || !isAbsolute(item.userData)) {
      throw new Error('desktop profiles: each environment needs a unique id, label, and absolute data directories')
    }
    ids.add(item.id)
    const home = canonicalPath(item.home)
    const userData = canonicalPath(item.userData)
    for (const path of [home, userData]) {
      if (parse(path).root === path || paths.some(existing => overlaps(existing, path) || overlaps(path, existing))) {
        throw new Error('desktop profiles: data directories must not overlap or point to a filesystem root')
      }
      paths.push(path)
    }
    return { id: item.id, label: item.label, home, userData }
  })
  if (!ids.has('default') || !ids.has(value.selectedId)) throw new Error('desktop profiles: default or selected environment is missing')
  return { version: 1, selectedId: value.selectedId, profiles }
}

/** 保存在基础 userData 中的环境清单；正在运行的环境不能改变清单位置。 */
export class DesktopProfileCatalog {
  private document: ProfileDocument
  readonly path: string

  /** @param baseUserData 单实例锁和清单的基础目录。 @param defaultHome 原有用户环境。 */
  constructor(baseUserData: string, defaultHome: string) {
    this.path = join(baseUserData, 'desktop', 'profiles.json')
    try {
      const raw = readFileSync(this.path, 'utf8')
      if (raw.length > 64 * 1024) throw new Error('desktop profiles: profiles.json exceeds 64 KiB')
      this.document = validateProfiles(JSON.parse(raw))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      this.document = validateProfiles({ version: 1, selectedId: 'default', profiles: [{ id: 'default', label: 'default',
        home: defaultHome, userData: baseUserData }] })
    }
  }

  /** @returns 已注册环境；调用方不能改变内部清单。 */
  list(): readonly DesktopProfile[] { return this.document.profiles }

  /** @returns 下次冷启动采用的环境 id。 */
  get selectedId(): string { return this.document.selectedId }

  /** @param id 已注册 id。 @returns 对应环境；未知 id 拒绝，不用默认环境替代。 */
  get(id: string): DesktopProfile {
    const profile = this.document.profiles.find(item => item.id === id)
    if (profile === undefined) throw new Error('desktop profiles: requested environment is not registered')
    return profile
  }

  /**
   * 在用户选择的新目录下注册隔离环境，不安装包或复制既有账号。
   * @param directory 用户通过原生目录选择器确认的目录。
   * @returns 原子保存后的新环境。
   */
  async add(directory: string): Promise<DesktopProfile> {
    if (!isAbsolute(directory)) throw new Error('desktop profiles: choose an absolute directory')
    const root = canonicalPath(directory)
    if (parse(root).root === root || (existsSync(root) && readdirSync(root).length !== 0)) {
      throw new Error('desktop profiles: choose a new empty non-root directory')
    }
    const profile: DesktopProfile = { id: randomUUID(), label: basename(root),
      home: join(root, 'harness-home'), userData: join(root, 'electron-user-data') }
    const document = validateProfiles({ ...this.document, profiles: [...this.document.profiles, profile] })
    await this.save(document)
    return profile
  }

  /** @param id 已确认停止旧 Host 后选定的环境。 @returns 原子保存完成，不负责启动新环境。 */
  async select(id: string): Promise<void> { this.get(id); await this.save({ ...this.document, selectedId: id }) }

  private async save(document: ProfileDocument): Promise<void> {
    await writeFileAtomic(this.path, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600, dirMode: 0o700 })
    this.document = document
  }
}
