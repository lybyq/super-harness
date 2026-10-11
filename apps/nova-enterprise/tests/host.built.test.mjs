/** 生产 Host 产物冒烟测试；不使用 TS Loader，确认桌面可以仅加载编译产物。 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { boot } from '@deepseek-ai/dsh-app-boot';

test('生产入口与声明均来自 lib，真实 Loader 挂载并完整卸载路由', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.main, 'lib/index.js');
  assert.equal(manifest.exports['.'].import, './lib/index.js');
  assert.equal(manifest.exports['.'].types, './lib/types/host/index.d.ts');
  const ctx = await boot('harness-built-test', fileURLToPath(new URL('./fixtures/cordis.built.yml', import.meta.url)));
  const routes = ctx.get('testRoutes');
  try {
    assert.equal(routes.size, 18);
    const response = await routes.get('/api/nova-hub/connection').fetch(new Request('http://fixture.invalid/api/nova-hub/connection'));
    assert.deepEqual(await response.json(), { ok: true, value: { configured: false, authentication: 'none' } });
  } finally { await ctx.fiber.dispose(); }
  assert.equal(routes.size, 0);
});
