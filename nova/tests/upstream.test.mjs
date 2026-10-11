import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const baseline = JSON.parse(readFileSync(new URL('../upstream.json', import.meta.url), 'utf8'));

test('the pinned official release is retained in Nova branch history', () => {
  assert.equal(baseline.repository, 'https://github.com/deepseek-ai/deepseek-harness.git');
  assert.match(baseline.commit, /^[a-f0-9]{40}$/);
  assert.match(baseline.tag, /^dsh-v[0-9]+\.[0-9]+\.[0-9]+-[a-z]+\.[0-9]+$/);
  execFileSync('git', ['merge-base', '--is-ancestor', baseline.commit, 'HEAD'], { cwd: root });
  const source = JSON.parse(execFileSync('git', ['show', `${baseline.commit}:package.json`], { cwd: root, encoding: 'utf8' }));
  assert.equal(baseline.tag, `dsh-v${source.version}`);
});

test('the original desktop, agent loop, MCP and skill sources are present', () => {
  for (const entry of ['apps/desktop/package.json', 'packages/core/agent-loop/package.json', 'packages/mcp/mcp-client/package.json', 'packages/skill/skill/package.json']) {
    const manifest = JSON.parse(readFileSync(new URL(entry, new URL('../../', import.meta.url)), 'utf8'));
    assert.ok(manifest.name.startsWith('@deepseek-ai/'));
  }
});
