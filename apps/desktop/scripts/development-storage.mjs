/** 桌面开发产物默认落在工作区所在磁盘，不依赖系统盘剩余容量。 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * 配置本进程及子进程的临时目录与 npm 缓存，不修改用户全局环境或清理已有文件。
 * @param {string} buildRoot 当前工作区的桌面构建目录。
 * @param {NodeJS.ProcessEnv} env 可变进程环境；部署可通过 DSH_DESKTOP_SCRATCH_DIR 覆盖。
 * @returns {string} 已创建的绝对工作目录；目录不可写时立即失败。
 */
export function configureDevelopmentStorage(buildRoot, env = process.env) {
  const root = resolve(env.DSH_DESKTOP_SCRATCH_DIR || join(buildRoot, 'scratch'));
  const temporary = join(root, 'temp'), cache = join(root, 'npm-cache');
  mkdirSync(temporary, { recursive: true });
  mkdirSync(cache, { recursive: true });
  env.TEMP = temporary;
  env.TMP = temporary;
  env.TMPDIR = temporary;
  env.npm_config_cache = cache;
  return root;
}
