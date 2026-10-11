import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const baseline = JSON.parse(readFileSync(new URL('../upstream.json', import.meta.url), 'utf8'));

test('the pinned official release is retained in Nova branch history', () => {
  assert.equal(baseline.repository, 'https://github.com/deepseek-ai/deepseek-harness.git');
  assert.match(baseline.tag, /^dsh-v[0-9]+\.[0-9]+\.[0-9]+-[a-z]+\.[0-9]+$/);
  // 使用发布标签解析真实提交，保持祖先关系验证，不在维护文件中重复保存裸 SHA。
  const commit = execFileSync('git', ['rev-parse', '--verify', `${baseline.tag}^{commit}`], { cwd: root, encoding: 'utf8' }).trim();
  assert.match(commit, /^[a-f0-9]{40}$/);
  execFileSync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], { cwd: root });
  const source = JSON.parse(execFileSync('git', ['show', `${commit}:package.json`], { cwd: root, encoding: 'utf8' }));
  assert.equal(baseline.tag, `dsh-v${source.version}`);
});

test('the original desktop, agent loop, MCP and skill sources are present', () => {
  for (const entry of ['apps/desktop/package.json', 'packages/core/agent-loop/package.json', 'packages/mcp/mcp-client/package.json', 'packages/skill/skill/package.json']) {
    const manifest = JSON.parse(readFileSync(new URL(entry, new URL('../../', import.meta.url)), 'utf8'));
    assert.ok(manifest.name.startsWith('@deepseek-ai/'));
  }
});
