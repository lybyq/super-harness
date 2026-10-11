/** 将 Harness 共享安装库构建成单一桌面制品；只在开发构建时需要 Hub 仓库。 */
import { createRequire, isBuiltin } from 'node:module';
import { readFile, cp, mkdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';

const { values } = parseArgs({ options: { from: { type: 'string' }, 'npm-root': { type: 'string' } } });
if (!values.from) throw new Error('bundle-engine: use --from <Harness workspace directory>');
const source = resolve(values.from), output = new URL('../lib/engine.js', import.meta.url);
const require = createRequire(import.meta.resolve('tsdown'));
const { rolldown } = await import(pathToFileURL(require.resolve('rolldown')).href);
const packages = ['core', 'installer', 'contracts'];
const entries = await Promise.all(packages.map(async name => {
  const directory = join(source, 'packages', name);
  const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  if (manifest.name !== `@nova-cbb/harness-${name}`) throw new Error(`bundle-engine: unexpected ${name} package`);
  const entry = resolve(directory, manifest.exports['.'].import);
  const content = await readFile(entry);
  return { name, entry, version: manifest.version, sha256: createHash('sha256').update(content).digest('hex') };
}));
const yamlEntry = createRequire(pathToFileURL(join(source, 'package.json'))).resolve('yaml');
const installerSource = await import(pathToFileURL(entries.find(item => item.name === 'installer').entry).href);
const command = await installerSource.npmInstallCommand();
const npmRoot = values['npm-root'] ? resolve(values['npm-root']) : command.arguments[0] ? dirname(dirname(command.arguments[0])) : undefined;
if (!npmRoot) throw new Error('bundle-engine: supply --npm-root <npm package directory> for this build host');
const npmManifest = JSON.parse(await readFile(join(npmRoot, 'package.json'), 'utf8'));
if (npmManifest.name !== 'npm') throw new Error('bundle-engine: --npm-root must be the npm CLI distribution');
const npmOutput = fileURLToPath(new URL('../lib/npm/', import.meta.url));
await mkdir(npmOutput, { recursive: true });
await cp(npmRoot, npmOutput, { recursive: true });
const bundle = await rolldown({
  input: 'harness-engine-entry', platform: 'node', external: id => isBuiltin(id),
  plugins: [{ name: 'harness-engine-entry',
    resolveId: id => id === 'harness-engine-entry' ? '\0harness-engine-entry' : undefined,
    load: id => id !== '\0harness-engine-entry' ? undefined : [
      ...entries.map(item => `import * as ${item.name} from ${JSON.stringify(item.entry.replaceAll('\\', '/'))};`),
      `import * as yaml from ${JSON.stringify(yamlEntry.replaceAll('\\', '/'))};`,
      'export { core, installer, contracts, yaml };',
      `export const buildSources = ${JSON.stringify(entries.map(({ name, version, sha256 }) => ({ name, version, sha256 })))};`,
    ].join('\n'),
  }],
});
try {
  await bundle.write({ file: fileURLToPath(output), format: 'esm',
    banner: "import { createRequire as __engineCreateRequire } from 'node:module'; const require = __engineCreateRequire(import.meta.url);" });
} finally { await bundle.close(); }
console.log('bundle-engine: self-contained lib/engine.js generated');
