/** 从冻结锁导出原始 npm 制品，并在内网显式发布；不把 pnpm store 重新打包成不同哈希的制品。 */
import { createHash, randomUUID } from 'node:crypto'
import { readFile, mkdir, open, rename, rm, access } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { parseArgs, promisify } from 'node:util'
import { execFile } from 'node:child_process'
import yaml from 'js-yaml'
import { z } from 'zod'

const Lock = z.object({ packages: z.record(z.string(), z.object({ version: z.string().optional(), resolution: z.object({ integrity: z.string(), tarball: z.string().optional() }) })) })
const Dist = z.object({ name: z.string(), version: z.string(), dist: z.object({ tarball: z.string().url() }) })
const Artifact = z.object({ name: z.string(), version: z.string(), integrity: z.string(), file: z.string(), tarball: z.string().optional() })
const Inventory = z.object({ format: z.literal(1), lockSha256: z.string(), packages: z.array(Artifact) })
type RegistryArtifact = z.infer<typeof Artifact>
type RegistryInventory = z.infer<typeof Inventory>
const execute = promisify(execFile)

/** @param value 内容。 @returns SHA256；用于锁文件与制品文件名，不替代 npm 完整性校验。 */
function digest(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex') }

/** @param root 仓库根目录。 @returns 精确版本及原始完整性；peer 变体只镜像一次，workspace 源码另行交付。 */
export async function registryInventory(root: string): Promise<RegistryInventory> {
  const text = await readFile(join(root, 'pnpm-lock.yaml'), 'utf8')
  const lock = Lock.parse(yaml.load(text))
  const packages = Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([id, entry]) => {
    const separator = id.lastIndexOf('@')
    if (separator <= 0) throw new Error(`Unsupported lock entry: ${id}`)
    const name = id.slice(0, separator), version = entry.version ?? id.slice(separator + 1)
    if (!/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/u.test(name) || !/^\d+\.\d+\.\d+[a-zA-Z0-9.+-]*$/u.test(version)) throw new Error(`Unsupported registry coordinate: ${id}`)
    return { name, version, integrity: entry.resolution.integrity, file: `${digest(id)}.tgz`, ...entry.resolution.tarball ? { tarball: entry.resolution.tarball } : {} }
  })
  return { format: 1, lockSha256: digest(text), packages }
}

/** @param bytes 原始 tarball。 @param integrity 锁定 SRI。 @returns 是否匹配任意受支持的完整性摘要。 */
export function matchesRegistryIntegrity(bytes: Buffer, integrity: string): boolean {
  return integrity.split(/\s+/u).some(value => {
    const match = /^(sha512|sha256|sha1)-([a-zA-Z0-9+/=]+)$/u.exec(value)
    return match !== null && createHash(match[1]!).update(bytes).digest('base64') === match[2]
  })
}

/** @param value Registry 或 tarball 地址。 @param allowHttp 是否明确允许内网 HTTP。 @returns 不含 URL 凭据的受支持地址。 */
export function registryUrl(value: string, allowHttp: boolean): URL {
  const url = new URL(value)
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:'))) throw new Error('Registry URLs require HTTPS, or explicit --allow-http; URL credentials and query strings are forbidden')
  return url
}

/** 在完成下载后检查原始字节；只清理本次创建的临时文件，不覆盖已存在的不匹配制品。 */
async function downloadArtifact(pkg: RegistryArtifact, directory: string, registry: URL, allowHttp: boolean): Promise<void> {
  const destination = join(directory, pkg.file)
  try {
    const bytes = await readFile(destination)
    if (!matchesRegistryIntegrity(bytes, pkg.integrity)) throw new Error(`Existing artifact differs from lock: ${pkg.name}@${pkg.version}`)
    return
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }
  let tarball = pkg.tarball
  if (!tarball) {
    const url = new URL(`${encodeURIComponent(pkg.name)}/${encodeURIComponent(pkg.version)}`, registry)
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(120_000) })
    if (!response.ok) throw new Error(`Metadata HTTP ${response.status}: ${pkg.name}@${pkg.version}`)
    const metadata = Dist.parse(await response.json())
    if (metadata.name !== pkg.name || metadata.version !== pkg.version) throw new Error(`Metadata coordinate mismatch: ${pkg.name}`)
    tarball = metadata.dist.tarball
  }
  const url = registryUrl(tarball, allowHttp)
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(600_000) })
  if (!response.ok || !response.body) throw new Error(`Tarball HTTP ${response.status}: ${pkg.name}@${pkg.version}`)
  const temporary = join(directory, `${pkg.file}.${randomUUID()}.partial`)
  const file = await open(temporary, 'wx')
  const reader = response.body.getReader()
  let size = 0
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > 512 * 1024 * 1024) throw new Error(`Tarball exceeds 512 MiB: ${pkg.name}@${pkg.version}`)
      await file.writeFile(chunk.value)
    }
    await file.close()
    if (!matchesRegistryIntegrity(await readFile(temporary), pkg.integrity)) throw new Error(`Tarball integrity mismatch: ${pkg.name}@${pkg.version}`)
    await rename(temporary, destination)
  } finally {
    await reader.cancel().catch(() => { /* 已完成或断开的响应无需再次取消。 */ })
    reader.releaseLock()
    await file.close()
    await rm(temporary, { force: true })
  }
}

/** @param root 仓库。 @param directory 制品目录。 @returns 已验证完整制品的清单；缺一项即拒绝发布。 */
export async function verifyRegistryMaterials(root: string, directory: string): Promise<RegistryInventory> {
  const expected = await registryInventory(root)
  const actual = Inventory.parse(JSON.parse(await readFile(join(directory, 'inventory.json'), 'utf8')))
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Inventory differs from the current lockfile; regenerate the materials')
  for (const pkg of expected.packages) {
    if (!matchesRegistryIntegrity(await readFile(join(directory, pkg.file)), pkg.integrity)) throw new Error(`Integrity mismatch: ${pkg.name}@${pkg.version}`)
  }
  return expected
}

/** @param root 仓库。 @param directory 制品目录。 @param source 下载源。 @param allowHttp 是否允许内网 HTTP。 @returns 全部任务完成；失败不隐藏，已验证的制品可续用。 */
export async function downloadRegistryMaterials(root: string, directory: string, source: string, allowHttp = false): Promise<void> {
  const registry = registryUrl(source.endsWith('/') ? source : source + '/', allowHttp)
  const inventory = await registryInventory(root)
  await mkdir(directory, { recursive: true })
  const manifest = await open(join(directory, 'inventory.json'), 'w')
  try { await manifest.writeFile(JSON.stringify(inventory, null, 2) + '\n') } finally { await manifest.close() }
  let next = 0, completed = 0
  const failures: string[] = []
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (;;) {
      const pkg = inventory.packages[next++]
      if (!pkg) return
      try { await downloadArtifact(pkg, directory, registry, allowHttp) } catch (error) {
        failures.push(`${pkg.name}@${pkg.version}: ${error instanceof Error ? error.message : 'download failed'}`)
      }
      completed++
      if (completed % 50 === 0) console.info(`Registry materials ${completed}/${inventory.packages.length}; failures ${failures.length}`)
    }
  }))
  if (failures.length) throw new Error(failures.join('\n'))
  await verifyRegistryMaterials(root, directory)
  console.info(`Verified ${inventory.packages.length} original tarballs`)
}

/** 上传前完整验证；不覆盖同版本，不执行生命周期脚本，npm 配置与认证由内网发布人员提供。 */
async function publish(root: string, directory: string, target: string, allowHttp: boolean): Promise<void> {
  const registry = registryUrl(target, allowHttp).href
  const inventory = await verifyRegistryMaterials(root, directory)
  const npm = join(root, 'apps/nova-enterprise/lib/npm/bin/npm-cli.js')
  await access(npm)
  const options = { windowsHide: true, maxBuffer: 8 * 1024 * 1024, timeout: 600_000 }
  const common = ['--registry', registry, '--ignore-scripts', '--cache', join(directory, '.publish-cache')]
  for (const pkg of inventory.packages) {
    const id = `${pkg.name}@${pkg.version}`
    let existing: string | undefined
    try {
      const result = await execute(process.execPath, [npm, 'view', id, 'dist.integrity', '--json', ...common], options)
      existing = z.string().parse(JSON.parse(result.stdout))
    } catch (error) {
      if (!(error instanceof Error && 'stderr' in error && typeof error.stderr === 'string' && /\bE404\b/u.test(error.stderr))) throw new Error(`Registry lookup failed: ${id}; check internal npm authentication`, { cause: error })
    }
    if (existing !== undefined) {
      if (existing !== pkg.integrity) throw new Error(`Registry version differs from lock: ${id}; no overwrite attempted`)
      console.info(`Already mirrored: ${id}`)
      continue
    }
    await execute(process.execPath, [npm, 'publish', join(directory, pkg.file), ...common], options)
    const result = await execute(process.execPath, [npm, 'view', id, 'dist.integrity', '--json', ...common], options)
    if (JSON.parse(result.stdout) !== pkg.integrity) throw new Error(`Uploaded but registry integrity differs: ${id}; stop and inspect the registry`)
    console.info(`Mirrored: ${id}`)
  }
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { directory: { type: 'string' }, registry: { type: 'string' }, 'allow-http': { type: 'boolean' } } })
  const root = resolve(import.meta.dirname, '..')
  const directory = resolve(values.directory ?? join(root, '.offline/registry-materials'))
  switch (positionals[0]) {
    case 'inventory': {
      await mkdir(directory, { recursive: true })
      const inventory = await registryInventory(root)
      const file = await open(join(directory, 'inventory.json'), 'w')
      try { await file.writeFile(JSON.stringify(inventory, null, 2) + '\n') } finally { await file.close() }
      console.info(`Inventory: ${inventory.packages.length} registry versions; workspace source and non-npm assets are separate`)
      break
    }
    case 'download': await downloadRegistryMaterials(root, directory, values.registry ?? 'https://registry.npmjs.org/', values['allow-http']); break
    case 'verify': console.info(`Verified ${(await verifyRegistryMaterials(root, directory)).packages.length} tarballs`); break
    case 'publish': {
      if (!values.registry) throw new Error('publish requires an explicit --registry')
      await publish(root, directory, values.registry, values['allow-http'] ?? false)
      break
    }
    default: throw new Error('Use inventory | download | verify | publish; publish requires --registry')
  }
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) await main()
