/** 验证真实 Client 制品的官方插槽挂载和界面快照；运行前需增量打包本插件。 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import * as officialIcons from '../../../packages/client/ui-primitives/lib/types/icons/index.js';

const require = createRequire(import.meta.url);

function loadClient(brand) {
  let module;
  const styles = [];
  runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    // 官方浏览器从预加载模块表提供 UI 原语；Node 仅使用已编译的真实图标模块，避免加载浏览器 CSS。
    window: { novaBrand: brand, __ModuleLoader__: { load: entry => {
      assert.equal(entry.id, '@deepseek-ai/dsh-nova-enterprise');
      module = entry.factory(id => id === '@deepseek-ai/dsh-client-ui-primitives' ? officialIcons : require(id));
    } } },
    document: { querySelector: () => null, createElement: () => ({ dataset: {} }), head: { appendChild: tag => { styles.push(tag.textContent); } } },
  });
  return { module, styles };
}

test('desktop-only branding shadows native slots while Web keeps the native branding', () => {
  const brand = { name: 'Nova', logoUrl: 'http://10.64.66.26:7789/static/nova-ui/logo.png', fallbackLogoUrl: 'data:image/svg+xml,%3Csvg/%3E' };
  for (const value of [undefined, brand]) {
    const { module } = loadClient(value);
    const registrations = [];
    module.apply({
      effect: fn => { fn(); },
      locale: { register: () => () => {}, bind: () => key => key },
      slots: { inject: (_slot, factory) => { factory(); }, register: (options, component) => { registrations.push({ options, component }); return () => {}; } },
    });
    const branding = registrations.filter(entry => entry.options.name.includes('.brand.'));
    assert.equal(branding.length, value ? 3 : 0);
    if (!value) continue;
    assert.deepEqual(branding.map(entry => entry.options.name), ['sidebar.brand.mark', 'sidebar.brand.name', 'conversation.hero.brand.mark']);
    for (const { options, component } of branding) {
      assert.equal(options.priority, -100);
      const html = renderToStaticMarkup(createElement(component, { size: 24 }));
      assert.equal(html.includes('Nova'), true);
      if (options.name.endsWith('.mark')) {
        assert.equal(html.includes(brand.fallbackLogoUrl), true);
        assert.equal(html.includes(brand.logoUrl), true);
        assert.equal(html.includes('hidden=""'), true);
      }
    }
  }
});

test('built client registers official main/sidebar slots and disposes the locale registration', () => {
  const { module, styles } = loadClient();
  const registrations = [], effects = [];
  let dictionaries, localeMounted = false;
  module.apply({
    effect: fn => { effects.push(fn()); },
    locale: { register: (name, value) => { assert.equal(name, 'nova.hub'); dictionaries = value; localeMounted = true; return () => { localeMounted = false; }; }, bind: () => key => dictionaries.zh[key] },
    slots: { inject: (slot, factory) => { factory(); }, register: (options, component) => { registrations.push({ options, component }); return () => {}; } },
  });
  assert.equal(registrations.find(entry => entry.options.name === 'sidebar.panellist').options.label(), 'AI Hub');
  const icon = registrations.find(entry => entry.options.name === 'sidebar.panellist').component;
  assert.equal(renderToStaticMarkup(createElement(icon, { size: 16 })), renderToStaticMarkup(createElement(officialIcons.IconSearchOutlineRegular, { size: 16 })));
  assert.equal(registrations.find(entry => entry.options.name === 'main').options.key, 'nova-hub');
  assert.equal(styles.length, 1);
  assert.equal(styles[0].includes('--dsw-alias-label-primary'), true);
  for (const dispose of effects) dispose();
  assert.equal(localeMounted, false);
});

test('panel snapshot enters the catalog without URL or token inputs and no misleading install action', () => {
  const { module } = loadClient();
  let panel, dictionary;
  module.apply({
    effect: fn => { fn(); },
    locale: { register: (name, dictionaries) => { dictionary = dictionaries.zh; return () => {}; }, bind: () => key => dictionary[key] },
    slots: { inject: (slot, factory) => { factory(); }, register: (options, component) => { if (options.name === 'main') panel = component; return () => {}; } },
  });
  const html = renderToStaticMarkup(createElement(panel, { t: key => dictionary[key] }));
  const text = html.replace(/<[^>]+>/g, '\n').split('\n').map(line => line.trim()).filter(Boolean);
  assert.deepEqual(text, [
    'AI Hub', '企业能力中心', '搜索内网能力，并管理每个能力的参数与凭据。',
    '配置与安装范围', '用户级（所有项目）', '项目配置与账号独立保存；项目列表来自已打开的会话。Host 插件和 Bundle 请在用户级安装。',
    '统一配置 MCP', '能力目录', '角色组合', '已安装', '开发与发布',
    '全部类型', 'mcp', 'skill', 'plugin', 'agent', 'hook', 'policy', 'pack', '搜索能力',
    '企业能力目录将在进入后自动加载。',
    '精确版本安装与真实运行结果分别显示；工具权限继续由 Nova 原生策略控制。',
  ]);
  assert.equal(html.includes('type="password"'), false);
  assert.equal(html.includes('type="url"'), false);
});
