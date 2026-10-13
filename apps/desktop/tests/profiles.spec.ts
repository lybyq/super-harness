import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, parse } from 'node:path'
import { expect, it } from 'vitest'
import { DesktopProfileCatalog } from '../src/profiles.ts'

it('keeps original paths and remembers isolated selections without copying credentials', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nova-profiles-'))
  try {
    const base = join(root, 'electron')
    const home = join(root, 'home')
    const catalog = new DesktopProfileCatalog(base, home)
    await mkdir(home)
    await writeFile(join(home, 'credentials.json'), 'DO-NOT-COPY')
    expect(catalog.selectedId).toBe('default')
    const next = await catalog.add(join(root, 'research'))
    expect(next.home).toBe(join(root, 'research', 'harness-home'))
    expect(next.userData).toBe(join(root, 'research', 'electron-user-data'))
    await catalog.select(next.id)
    const restarted = new DesktopProfileCatalog(base, next.home)
    expect(restarted.selectedId).toBe(next.id)
    expect(restarted.get('default').home).toBe(home)
    expect(await readFile(join(home, 'credentials.json'), 'utf8')).toBe('DO-NOT-COPY')
    await expect(readFile(join(next.home, 'credentials.json'), 'utf8')).rejects.toHaveProperty('code', 'ENOENT')
    await expect(catalog.add(join(root, 'research'))).rejects.toThrow('overlap')
    await expect(catalog.add(parse(root).root)).rejects.toThrow('non-root')
    expect(() => catalog.get('unknown')).toThrow('not registered')
    await expect(catalog.select('unknown')).rejects.toThrow('not registered')
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('refuses invalid, nested, and nonempty profile directories without rewriting their files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nova-profiles-invalid-'))
  try {
    const catalog = new DesktopProfileCatalog(join(root, 'electron'), join(root, 'home'))
    await mkdir(join(root, 'occupied'))
    await writeFile(join(root, 'occupied', 'user.txt'), 'existing')
    await expect(catalog.add(join(root, 'occupied'))).rejects.toThrow('empty')
    await expect(catalog.add(join(root, 'home', 'nested'))).rejects.toThrow('overlap')
    await mkdir(join(root, 'electron', 'desktop'), { recursive: true })
    const invalid = '{"version":1,"selectedId":"other","profiles":[]}'
    await writeFile(catalog.path, invalid)
    expect(() => new DesktopProfileCatalog(join(root, 'electron'), join(root, 'home'))).toThrow('invalid')
    expect(await readFile(catalog.path, 'utf8')).toBe(invalid)
  } finally { await rm(root, { recursive: true, force: true }) }
})
