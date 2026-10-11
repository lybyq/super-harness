/** 测试专用连接和原子凭据替身；通过真实 Loader 挂载，不监听额外服务、不读取生产凭据。 */
import { readFile, writeFile } from 'node:fs/promises';
export const name = 'harness-test-host';
export async function apply(ctx) {
  const path = process.env.HARNESS_TEST_RECORD_FILE;
  const records = new Map(path ? JSON.parse(await readFile(path, 'utf8')) : []);
  const routes = new Map();
  ctx.provide('testRoutes', routes);
  ctx.provide('credentials', {
    readRecord: async key => records.get(key),
    modifyRecord: async (key, mutate) => {
      const next = await mutate(records.get(key));
      if (next !== undefined) records.set(key, next);
      if (path) await writeFile(path, JSON.stringify([...records]));
      return next;
    },
  });
  ctx.provide('connection', { fetch: { register: route => {
    routes.set(route.path, route);
    return () => { routes.delete(route.path); };
  } } });
}
