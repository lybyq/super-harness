/** 只拷贝已构建引擎到隔离目录，证明运行时不依赖另一个仓库或外部 npm 依赖。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
test('桌面引擎制品在无 Harness 仓库的目录可导入', async () => {
  const root = await mkdtemp(join(tmpdir(), 'harness-engine-artifact-'));
  try {
    await copyFile(new URL('../lib/engine.js', import.meta.url), join(root, 'engine.mjs'));
    const module = await import(pathToFileURL(join(root, 'engine.mjs')).href);
    assert.equal(typeof module.core.CapabilityManager, 'function');
    assert.equal(typeof module.installer.ArtifactInstaller, 'function');
    assert.equal(typeof module.contracts.capabilitySchema.parse, 'function');
    assert.equal(module.buildSources.length, 3);
    assert.deepEqual(module.yaml.parse('name: harness'), { name: 'harness' });
  } finally { await rm(root, { recursive: true, force: true }); }
});
