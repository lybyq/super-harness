/** 真正创建隔离 Git 仓库与工作树；验证脏主项目拒绝、用户确认合并和 HEAD 漂移保护。 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTeamWorktree, reviewTeamWorktree, mergeTeamWorktree } from '../src/team-worktrees.ts'
const execute = promisify(execFile)

test('独立工作树不复制主项目未提交内容，审阅后显式挑选提交，脏目录和旧 HEAD 均拒绝', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'harness-team-git-')); t.after(() => rm(root, { recursive: true, force: true }))
  const repository = join(root, 'repository'), home = join(root, 'resources'); await mkdir(repository)
  const git = (cwd: string, args: string[]) => execute('git', args, { cwd, windowsHide: true, timeout: 30000 })
  await git(repository, ['init']); await git(repository, ['config', 'core.autocrlf', 'false']); await git(repository, ['config', 'user.email', 'fixture@invalid']); await git(repository, ['config', 'user.name', 'Fixture']); await git(repository, ['config', 'commit.gpgsign', 'false'])
  await writeFile(join(repository, 'code.txt'), 'base\n'); await git(repository, ['add', 'code.txt']); await git(repository, ['commit', '-m', 'base'])
  await writeFile(join(repository, 'code.txt'), 'main-uncommitted\n')
  const receipt = await createTeamWorktree(repository, home, 'frontend')
  assert.equal(await readFile(join(receipt.path, 'code.txt'), 'utf8'), 'base\n')
  await writeFile(join(receipt.path, 'result.txt'), 'reviewed-result\n'); await git(receipt.path, ['add', 'result.txt']); await git(receipt.path, ['commit', '-m', 'result'])
  const review = await reviewTeamWorktree(receipt), commit = review.commits[0].commit
  assert.ok(review.diff.includes('reviewed-result'))
  await assert.rejects(mergeTeamWorktree(receipt, commit, review.mainCommit, true), { code: 'HUB_TEAM_MERGE_REFUSED' })
  await writeFile(join(repository, 'code.txt'), 'base\n')
  await assert.rejects(mergeTeamWorktree(receipt, commit, review.mainCommit, false), { code: 'HUB_TEAM_MERGE_REFUSED' })
  assert.deepEqual(await mergeTeamWorktree(receipt, commit, review.mainCommit, true), { outcome: 'merged' })
  assert.equal(await readFile(join(repository, 'result.txt'), 'utf8'), 'reviewed-result\n')
  await assert.rejects(mergeTeamWorktree(receipt, commit, review.mainCommit, true), { code: 'HUB_TEAM_MERGE_REFUSED' })
  assert.equal(await readFile(join(receipt.path, 'result.txt'), 'utf8'), 'reviewed-result\n')
})
