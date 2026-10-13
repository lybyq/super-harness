/** 用真实 loopback HTTP 和独立临时目录验证离线制品，不访问公网或生产私有源。 */
import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { downloadRegistryMaterials, registryInventory, registryUrl, verifyRegistryMaterials } from '../registry-materials.ts'

/** @param t 测试生命周期。 @returns 本次专用仓库目录。 */
async function fixture(t: TestContext): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'nova-registry-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

const bytes = Buffer.from('fixture original package bytes')
const integrity = 'sha512-' + createHash('sha512').update(bytes).digest('base64')

/** @param root 仓库。 @param direct 是否使用直链。 @returns 已写好的最小锁；仅用于本测试。 */
async function lock(root: string, direct = false): Promise<void> {
  await writeFile(join(root, 'pnpm-lock.yaml'), JSON.stringify({ packages: {
    [direct ? 'fixture@https://example.test/pkg.tgz' : '@fixture/package@1.2.3']: {
      version: '1.2.3', resolution: { integrity, ...direct ? { tarball: 'https://example.test/pkg.tgz' } : {} },
    },
  } }))
}

test('inventory uses the actual version for URL dependencies and rejects credential-bearing registries', async t => {
  const root = await fixture(t)
  await lock(root, true)
  const inventory = await registryInventory(root)
  assert.equal(inventory.packages[0]!.version, '1.2.3')
  assert.equal(inventory.packages[0]!.tarball, 'https://example.test/pkg.tgz')
  assert.match(inventory.packages[0]!.file, /^[a-f0-9]{64}\.tgz$/u)
  assert.throws(() => registryUrl('http://registry.example/', false))
  assert.throws(() => registryUrl('https://user:secret@registry.example/', false))
  assert.throws(() => registryUrl('https://registry.example/?token=secret', false))
  assert.equal(registryUrl('http://registry.example/', true).protocol, 'http:')
})

test('downloads exact original bytes, resumes without fetching again, and rejects local corruption', async t => {
  const root = await fixture(t), directory = join(root, 'materials')
  await lock(root)
  let requests = 0
  const server = createServer((req, res) => {
    requests++
    if (req.url === '/package.tgz') { res.end(bytes); return }
    res.setHeader('content-type', 'application/json')
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('fixture did not bind TCP')
    res.end(JSON.stringify({ name: '@fixture/package', version: '1.2.3', dist: { tarball: `http://127.0.0.1:${address.port}/package.tgz` } }))
  })
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('fixture did not bind TCP')
  const source = `http://127.0.0.1:${address.port}/`
  await downloadRegistryMaterials(root, directory, source, true)
  await downloadRegistryMaterials(root, directory, source, true)
  assert.equal(requests, 2)
  const inventory = await verifyRegistryMaterials(root, directory)
  const artifact = join(directory, inventory.packages[0]!.file)
  assert.deepEqual(await readFile(artifact), bytes)
  await writeFile(artifact, 'corrupt')
  await assert.rejects(downloadRegistryMaterials(root, directory, source, true), /Existing artifact differs/u)
  assert.equal(await readFile(artifact, 'utf8'), 'corrupt')
  assert.equal(requests, 2)
})

test('a missing artifact or changed lock cannot pass the pre-publication verification', async t => {
  const root = await fixture(t), directory = join(root, 'materials')
  await lock(root)
  await mkdir(directory)
  const inventory = await registryInventory(root)
  await writeFile(join(directory, 'inventory.json'), JSON.stringify(inventory))
  await assert.rejects(verifyRegistryMaterials(root, directory), /ENOENT/u)
  await writeFile(join(directory, inventory.packages[0]!.file), bytes)
  await writeFile(join(root, 'pnpm-lock.yaml'), '{}')
  await assert.rejects(verifyRegistryMaterials(root, directory))
  assert.deepEqual(await readdir(directory), ['inventory.json', inventory.packages[0]!.file].sort())
})
