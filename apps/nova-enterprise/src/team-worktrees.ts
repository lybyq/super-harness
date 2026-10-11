/** 独立 Git 工作树由企业层创建；主工作区原有未提交文件保持不动，不自动合并或清理成果。 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, mkdtemp, rmdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, isAbsolute, join } from 'node:path'
import { HubError } from './hub-client.ts'
const execute = promisify(execFile)
const gitEnvironment = () => Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^GIT_/i.test(name)))

/** 桌面保存的工作树收据；界面只能提交成员 ID，不能自行指定路径。 */
export interface TeamWorktreeReceipt {
  path: string
  branch: string
  repository: string
  baseCommit: string
}

/** @param cwd 官方根会话 cwd。 @param home 桌面专属资源目录。 @param role 已准入角色 ID。 @returns 新分支和工作树收据；失败不会删除主项目或既有工作树。 */
export async function createTeamWorktree(cwd: string, home: string, role: string) {
  if (!isAbsolute(cwd) || !isAbsolute(home) || !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(role))
    throw new HubError('HUB_TEAM_WORKTREE_FAILED')
  const suffix = randomUUID(),
    branch = `codex/team-${role}-${suffix}`,
    path = join(home, 'team-worktrees', suffix)
  try {
    const options = { cwd, env: gitEnvironment(), windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 }
    const { stdout } = await execute('git', ['rev-parse', '--show-toplevel'], options)
    const repository = stdout.trim()
    const { stdout: head } = await execute('git', ['rev-parse', 'HEAD'], options)
    await mkdir(join(home, 'team-worktrees'), { recursive: true })
    await execute('git', ['worktree', 'add', '-b', branch, path, head.trim()], options)
    return { path, branch, repository, baseCommit: head.trim() }
  } catch (_error) {
    throw new HubError('HUB_TEAM_WORKTREE_FAILED')
  }
}

/** @param receipt Host 保存的工作树。 @returns 有界 diff 和最近提交，主工作区 HEAD 用于确认时防止误合并。 */
export async function reviewTeamWorktree(receipt: TeamWorktreeReceipt) {
  try {
    const git = (cwd: string, args: string[]) =>
      execute('git', args, { cwd, env: gitEnvironment(), windowsHide: true, timeout: 30000, maxBuffer: 512 * 1024 })
    const [{ stdout: head }, { stdout: status }, { stdout: log }, { stdout: diff }] = await Promise.all([
      git(receipt.repository, ['rev-parse', 'HEAD']),
      git(receipt.path, ['status', '--short']),
      git(receipt.path, ['log', '--max-count=20', '--format=%H%x09%s', `${receipt.baseCommit}..HEAD`]),
      git(receipt.path, ['diff', '--no-ext-diff', '--no-textconv', receipt.baseCommit, '--']),
    ])
    return {
      ...receipt,
      mainCommit: head.trim(),
      status,
      diff,
      commits: log
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [commit, ...subject] = line.split('\t')
          return { commit, subject: subject.join('\t') }
        }),
    }
  } catch (_error) {
    throw new HubError('HUB_TEAM_REVIEW_FAILED')
  }
}

/**
 * 用户审阅后挑选一个已提交成果，主项目必须干净且 HEAD 未变化；冲突保留现场供用户解决。
 * @param receipt Host 所有的收据。 @param commit 已审阅的完整 SHA。 @param expectedMainCommit 审阅时主项目 HEAD。 @param confirmed 用户界面明确确认。
 * @returns merged / conflict / uncertain；不自动重试、不重置文件、不批量合并其他提交。
 */
export async function mergeTeamWorktree(
  receipt: TeamWorktreeReceipt,
  commit: unknown,
  expectedMainCommit: unknown,
  confirmed: unknown,
) {
  if (
    confirmed !== true ||
    typeof commit !== 'string' ||
    !/^[a-f0-9]{40,64}$/.test(commit) ||
    typeof expectedMainCommit !== 'string' ||
    !/^[a-f0-9]{40,64}$/.test(expectedMainCommit)
  )
    throw new HubError('HUB_TEAM_MERGE_REFUSED')
  const git = (cwd: string, args: string[]) =>
    execute('git', args, { cwd, env: gitEnvironment(), windowsHide: true, timeout: 30000, maxBuffer: 512 * 1024 })
  try {
    const review = await reviewTeamWorktree(receipt)
    if (
      review.mainCommit !== expectedMainCommit ||
      !review.commits.some(item => item.commit === commit) ||
      review.status ||
      (await git(receipt.repository, ['status', '--porcelain'])).stdout
    )
      throw new HubError('HUB_TEAM_MERGE_REFUSED')
    const hooks = await mkdtemp(join(dirname(receipt.path), 'empty-hooks-'))
    try {
      await git(receipt.repository, ['-c', `core.hooksPath=${hooks}`, 'cherry-pick', commit])
      return { outcome: 'merged' }
    } catch (_error) {
      try {
        await git(receipt.repository, ['rev-parse', '--verify', 'CHERRY_PICK_HEAD'])
        return { outcome: 'conflict' }
      } catch (_notConflicted) {
        return { outcome: 'uncertain' }
      }
    } finally {
      await rmdir(hooks)
    }
  } catch (error) {
    if (error instanceof HubError) throw error
    throw new HubError('HUB_TEAM_MERGE_REFUSED')
  }
}
