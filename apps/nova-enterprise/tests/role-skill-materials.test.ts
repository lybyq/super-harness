/** 离线技能制品的可选验收；仅读取显式指定的材料目录，通过官方 Provider 发现并加载每个 Skill。 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem'
import { object } from '../src/catalog.ts'

const library = process.env.NOVA_ROLE_SKILL_LIBRARY
void test('每个打包 Skill 都可被官方发现和读取，入口本地引用文件完整', { skip: !library }, async () => {
  assert.ok(library)
  const root = resolve(library), skills = join(root, 'skills')
  const expected = (await readdir(skills, { withFileTypes: true })).filter(item => item.isDirectory())
  const ctx = new Context(), controller = new AbortController()
  const provider = new FileSystemSkillProvider(ctx, { signal: controller.signal, invalidate() {} },
    { includeDefaultRoots: false, customSkillDirs: [skills], watch: false })
  try {
    const listed = await provider.list({}), candidates = Array.isArray(listed) ? listed : listed.candidates
    assert.equal(candidates.length, expected.length)
    assert.ok(candidates.length >= 100)
    for (const candidate of candidates) {
      assert.ok(candidate.path)
      const skill = await provider.get(candidate, {})
      assert.ok(skill, candidate.path)
      assert.ok(skill.content.includes('内网'), candidate.path)
      const metadata = object(JSON.parse(await readFile(join(dirname(candidate.path), 'UPSTREAM.json'), 'utf8')))
      assert.equal(metadata.name, skill.name)
      assert.match(String(metadata.commit), /^[a-f0-9]{40}$/)
      for (const match of skill.content.matchAll(/\]\(((?:references|scripts|assets|data)\/[^)#\s]+)(?:#[^)]*)?\)/g)) {
        const target = resolve(dirname(candidate.path), decodeURIComponent(match[1]!))
        await assert.doesNotReject(readFile(target), `${skill.name}: ${match[1]}`)
      }
    }
  } finally { controller.abort(); await provider.dispose(); await ctx.fiber.dispose() }
})
