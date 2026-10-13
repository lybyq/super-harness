---
description: "Windows x64 Harness offline development: prepare pnpm 10.34.6, store, Node and Electron, transfer source and assets, start Hub/Desktop and package employee installers."
---

# Harness intranet offline development and desktop delivery

English | [中文](nova-offline-development.zh.md)

## Intended outcome

This Windows x64 tutorial prepares dependencies and runtimes outside the intranet, then installs development dependencies, builds and starts Desktop without public networking inside it. A release machine with internal artifact mirrors creates the installer. Both environments pin pnpm 10.34.6. The deployment owner performs target-machine acceptance; this document is not an acceptance receipt.

## Understand the materials first

Source is the code you edit. `node_modules` contains the current machine's installed links and files. The pnpm store contains materials for reinstalling dependencies. Electron, Python, browsers and packaging-tool caches are separate materials. Source alone is insufficient; a store alone is also insufficient. `--offline` restricts pnpm downloads, not arbitrary lifecycle scripts or third-party packaging tools.

Prefer source, a matching store, toolchain and runtime materials, then reconstruct `node_modules` internally. Do not rely only on copying `node_modules`: pnpm links, absolute paths, Windows native binaries and different Node versions can break it. A complete Desktop installer is a separate delivery for employees who do not install development dependencies.

Keep the same operating system, architecture and development Node version outside and inside. Source supports Node 22.19+; the Windows packaging toolchain uses Node 24. macOS/Linux materials cannot replace Windows x64 native packages, Playwright browsers or Python wheels.

## 1. Prepare outside the intranet

Run these PowerShell commands in `E:/ai/super-harness`. Reserve additional disk space for dependencies, runtimes and archives; move the whole checkout to another non-system drive if needed. Exit the old desktop from its tray menu: closing the window may leave a background process locking Electron files.

When pnpm 10 is absent, install a portable copy outside without changing the intranet's global environment:

```powershell
$env:npm_config_cache = 'E:/ai/tools/npm-cache'
npm.cmd install --prefix .offline/toolchain/pnpm --no-save --ignore-scripts --no-audit --no-fund pnpm@10.34.6
./nova/desktop.ps1 -Action check
./nova/desktop.ps1 -Action install
./nova/desktop.ps1 -Action fetch
./nova/desktop.ps1 -Action build
```

`install` reconstructs dependencies, `fetch` fills the lockfile store, and `build` generates Host, Client and Web artifacts. Every step uses the pinned version, without npx/Corepack downloading another pnpm. Update and commit the lockfile outside after migration; keep `--frozen-lockfile` inside rather than resolving versions there. Fix failures before archiving incomplete materials.

Prepare desktop primary-runtime once so it contains pnpm 10 instead of reusing an old pnpm 11 runtime:

```powershell
node .offline/toolchain/pnpm/node_modules/pnpm/bin/pnpm.cjs --dir apps/desktop run prepare:primary-runtime
./nova/desktop.ps1 -Action prepare-materials
./nova/desktop.ps1 -Action start
```

First preparation uses locked downloads and writes `apps/desktop/.desktop-build/targets/win-x64/runtime`. Startup reuses it and rejects a mismatched pnpm runtime. `prepare-materials` copies prepared Node, including its license, and development Electron into `.offline` without downloading missing assets. If the Electron executable is missing, complete the current Electron package's installation outside rather than downloading inside.

When the shared installer changes, build `core/installer/contracts` in `nova-harness`, then run:

```powershell
./nova/desktop.ps1 -Action engine -HubRoot E:/ai/nova-harness
```

UI-only or role-UI changes do not require regenerating the engine. Carry `apps/nova-enterprise/lib/engine.js` and `lib/npm`; source archives exclude ignored `lib`, and omitting these artifacts makes the installation engine unavailable.

## 2. Materials to transfer

Check this table before archiving; the presence of one `node_modules` directory is insufficient.

| Material | Location/requirement | Purpose |
|---|---|---|
| Current source | Both committed repositories, including lockfiles, workspace and patches | Internal development and three-way merge |
| pnpm 10 tooling | `.offline/toolchain/pnpm/node_modules/pnpm` | No package-manager download inside |
| Development Node and license | `.offline/toolchain/node/bin/node.exe` and license, copied from a prepared Node distribution | Repeatable version without C-drive Node |
| Desktop store | `.offline/pnpm-store/v10/files` and `v10/index`; omit machine-local `v10/projects` links | Frozen-lock offline installation |
| Hub store | Separately fetched in the Hub checkout with matching pnpm | Desktop's store may omit Hub dependencies |
| primary-runtime and Office assets | `apps/desktop/.desktop-build/targets/win-x64/runtime` | Bundled Node, pnpm, Python and Office skills |
| primary-runtime download cache | `apps/desktop/.desktop-build/downloads` | Offline runtime preparation |
| Electron cache/executable distribution | `.desktop-build/scratch/electron-cache` and `.offline/assets/electron` | Restoring the backed-up executable after reinstall |
| Packaging-tool caches | `.desktop-build/scratch/builder-cache` and actual release-machine caches | NSIS, signing helpers and Builder are not all npm assets |
| Enterprise installation engine | `apps/nova-enterprise/lib`, including `engine.js`, `npm` and build record | Shared Hub libraries and npm CLI |
| Business capabilities and assets | Complete internal npm dependency mirror, GitLab artifacts, Playwright browsers, OCR/database drivers | A development store is not an offline marketplace for every MCP |
| Hub runtime materials | PostgreSQL and Prisma engines; prepared images and licenses for Docker | The internal Hub must also run |

Prefer bundled Node 24 for development, preserving the `dependencies/node/bin/node.exe` layout. `desktop.ps1` uses `.offline/toolchain/node/bin/node.exe` first, otherwise PATH Node. Do not edit primary-runtime version JSON to pretend it migrated; regenerate it through preparation.

## 2a. Mirror dependencies into the private npm registry

The pnpm store is not an npm registry: it contains unpacked content-addressed files, not the original publication tarballs. [registry-materials.ts](../../nova/registry-materials.ts) reads every exact external package in the lock, downloads original tarballs, and verifies their SRI hashes. Workspace packages remain source/local packed packages; newly installed MCPs and plugins require their own closure. A successful export of this checkout does not cover future Hub installations.

Run these preparation commands outside the intranet; the directory can be on a disk with more free space:

```powershell
$taskNode = './.offline/toolchain/node/bin/node.exe'
& $taskNode --import tsx/esm nova/registry-materials.ts inventory --directory D:/harness-transfer/registry-materials
& $taskNode --import tsx/esm nova/registry-materials.ts download --directory D:/harness-transfer/registry-materials
& $taskNode --import tsx/esm nova/registry-materials.ts verify --directory D:/harness-transfer/registry-materials
```

Download resumes verified files but refuses existing corrupt files. Any missing download or integrity error makes the command fail; do not call a partial directory complete. Transfer the entire directory together with the same source/lock. Tarballs retain their original bytes and licenses; dependency patches remain in the source repository and apply after installation.

The intranet registry owner executes publication below after configuring npm authentication and write permissions. The sample host is a placeholder; replace it with the provided private registry. An ignored deployment npmrc can use `//actual-host/:_authToken=${NPM_TOKEN}`; the release environment supplies the token, not the source repository. HTTP requires explicit `--allow-http` and does not encrypt tokens; prefer company HTTPS rather than disabling certificate validation.

```powershell
$registry = 'http://npm-registry.example.internal/'
$env:NPM_CONFIG_USERCONFIG = 'E:/harness/deployment/npmrc'
& $taskNode --import tsx/esm nova/registry-materials.ts publish --directory D:/harness-transfer/registry-materials --registry $registry --allow-http
```

Publication validates all materials before the first write, disables lifecycle scripts, explicitly selects the target registry, skips an existing version only when its SRI matches, and refuses overwrite. Upload or subsequent read-back failure stops the run; inspect the registry before resuming. The bundled npm CLI under `apps/nova-enterprise/lib/npm` is required. This command is a manual intranet acceptance operation; no publication to the company registry has been tested externally.

This lock includes `xlsx` 0.20.3 as a direct SheetJS CDN URL in `packages/client/ui-sidebar-documentpreview/package.json`. Changing registry alone cannot replace an explicit URL. After mirroring, the intranet branch must replace that dependency with the exact registry version `0.20.3`, generate/review its intranet lock against the private registry, and fetch a matching store. Keep the exact version and integrity; do not replace it with npm's different `latest`. The public development lock remains unchanged. With the existing matching store, frozen offline installation does not need to fetch the CDN.

## 3. Archive with 7z

The archive helper preserves `.offline` and `apps` paths, includes only portable store files/index, checks CRC, and refuses overwrite. It requires local 7-Zip; supply `-SevenZip` for a different executable location. Machine-local projects links are excluded. Builder caches are separate optional publishing materials, not part of this developer/runtime archive.

Before archiving, distinguish a source snapshot from `git archive HEAD`: HEAD excludes uncommitted changes, including a new lockfile. The source you transfer must contain the exact lock used for the materials. Never archive a whole personal checkout indiscriminately; exclude secrets, user homes, caches with credentials, and signing files. The local verification copy was populated from tracked and non-ignored working-tree files, not from an older commit.

7z works, but archive the required materials rather than an entire personal working directory. Commit external changes first: source zip excludes uncommitted files. Complete Git history is not required for building; transfer a Git bundle separately when retaining history inside. Three-way merge existing internal changes instead of replacing the entire checkout.

After installing 7-Zip and creating `E:/transfer`, prepare two archives from the repository root:

```powershell
git archive --format=zip --output=E:/transfer/super-harness-source.zip HEAD
./nova/archive-materials.ps1 -OutputPath E:/transfer/super-harness-materials.7z
Get-FileHash E:/transfer/super-harness-source.zip -Algorithm SHA256
Get-FileHash E:/transfer/super-harness-materials.7z -Algorithm SHA256
```

Archiving is a deployment-owner manual operation; verify actual directories exist and are complete first. Run `prepare-materials` and confirm `.offline/assets/electron` exists; archive Hub materials separately. Restore materials at their matching relative paths inside. Root `node_modules` is unnecessary; if carried as a same-machine backup, offline reinstall and acceptance remain authoritative.

Exclude `.env`, personal `.npmrc`, signing certificates/PINs, `$DSH_HOME`, Electron user data, enterprise accounts and token-bearing logs. The repository's public version-policy `.npmrc` can accompany source. Configure actual deployment YAML, CA and publication credentials inside. SHA256 checks transfer integrity, not source review or signing.

## 4. Install and start offline inside

For a brand-new ZIP checkout, use your configured Git identity and create a local initial commit before building: the build reads a real Git commit for its version metadata. An existing intranet repository keeps its history and uses a reviewed source merge instead; do not run this sequence as a replacement for that merge.

```powershell
git init
git add .
git commit -m "Import Nova source snapshot"
```

Restore source under, for example, `E:/ai/super-harness`, then restore `.offline` and runtimes at matching locations. Back up and three-way merge existing internal changes. Source zip contains no `.git`; run `git init` in a new development directory or use an existing internal GitLab checkout. Postinstall configures Git hooks, so a non-Git directory is not a complete development checkout.

```powershell
./nova/desktop.ps1 -Action check -Offline
./nova/desktop.ps1 -Action install -Offline
./nova/desktop.ps1 -Action restore-electron -Offline
./nova/desktop.ps1 -Action build -Offline
```

Offline install takes materials from `.offline/pnpm-store` and reconstructs local `node_modules`. For a missing tarball, fill the same lockfile store outside and transfer it again; do not remove `--offline`. For missing native files, browsers or an Electron executable, supply the matching platform assets, which a store may not restore automatically. `HARNESS_OFFLINE_BUILD=1` fails immediately for missing primary-runtime download cache; it is not a universal replacement for network isolation.

Copy and edit the [deployment environment example](../../nova/deployment-env.example.ps1): actual Hub `/api/v1`, DeploymentProfile, resource directory, CA and user home. Execute it in the same terminal used to start Desktop, then run:

```powershell
./nova/desktop.ps1 -Action start -Offline
```

`start` neither builds nor downloads primary-runtime, but reconstructs the local development project. Build first. Use an isolated home for initial testing; an existing Profile is not overwritten with enterprise/community layers. Configure actual internal model provider, model and endpoint through official model settings; example variables, paths and role names are not model configuration.

Run Hub in another terminal or on an internal server. `nova-harness` also pins pnpm 10.34.6; its Node development entry is `pnpm run dev`, with API default 3200 and admin UI 3210. Configure PostgreSQL, Prisma generation/migration and DeploymentProfile internally. For existing internal Docker deployment, transfer prepared images, docker load them and use that repository's external-PostgreSQL compose; do not docker pull without networking. Desktop users do not start databases themselves.

### Example for local two-repository integration

The local developer runs these commands against an already running local Hub and mock sources, not a real intranet delivery; they contain no credentials. Use actual HTTPS addresses and source configuration from the deployment example internally. If tooling blocks launch-parameter injection, opening Desktop without those parameters does not establish a Hub connection.

```powershell
$env:DSH_HOME = 'E:/home'
$env:DSH_DESKTOP_USER_DATA_DIR = 'E:/electron-user-data'
$env:NOVA_HUB_API_URL = 'http://localhost:3200/api/v1'
$env:NOVA_HUB_ALLOW_HTTP = 'true'
$env:NOVA_DEPLOYMENT_CONFIG = 'E:/ai/nova-harness/manifests/deployments/mock-host.yaml'
$env:HARNESS_DESKTOP_RESOURCE_HOME = 'E:/ai/super-harness/apps/desktop/.desktop-build/preview-nova/resources'
./nova/desktop.ps1 -Action start -Offline
```

Exit the old desktop from its tray before starting in this terminal; new environment variables do not change a running Host. Configure business accounts, source tokens, publishing access and models separately, not in these commands or the public repository.

## 5. Daily development

Edit source → run affected tests/typechecks → build affected artifacts → exit the old desktop from its tray → start. Restart Hub for Hub API changes, regenerate engine for shared installer changes, and publish a new immutable MCP version before updating it in AI Hub. New npm dependencies require lockfile/store preparation outside or a mirrored internal registry; do not allow internal version drift.

See [package instructions](../../apps/nova-enterprise/README.md) for enterprise incremental commands. Business-plugin development does not require a full repository build every time; dependency migration and release packaging do. `desktop.ps1` does not stop applications, delete source or modify user Profiles automatically.

## 6. Deliver an installer to employees

A development materials archive is not an installer. Build on an internal Windows x64 release machine with Node 24, PowerShell 7, Git, Python, Visual C++ Build Tools, Windows SDK and pinned pnpm. It also requires an internal npm mirror or qualified complete build caches, plus Electron, Node, Python and NSIS assets. The current packager regenerates a production dependency lock: root-store offline installation does not qualify every packaging stage as offline.

Follow the [Windows packaging reference](../../apps/desktop/README.md), copy `apps/desktop/.env.windows.example` into ignored `.env.windows`, and configure company `DSH_DESKTOP_APP_ID`, `DSH_DESKTOP_NPM_REGISTRY` and internal HTTPS publication/policy origins. An anonymous internal policy can use `production` with internal `DOWNLOAD_PROD_ORIGIN` and `DSH_DESKTOP_MANDATORY_UPDATE_PROD_ORIGIN`; the name does not require public networking. Official `test` mode requires a test authentication origin; selecting test does not make it anonymous.

```powershell
./nova/desktop.ps1 -Action package-check
./nova/desktop.ps1 -Action package-unsigned
```

These are deployment-owner acceptance steps, not claims of target-machine packaging success. Unsigned installers are written to `apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts`. Employee distribution uses existing signed `package:desktop:win:x64` and company certificates, with an internal update service. Do not run upstream public COS upload scripts. Without a certificate/publication origin, qualify the test installer on a clean machine rather than inventing signing.

On an employee machine without source, Node or pnpm, disconnect public networking while retaining intranet access: install → start → choose project/model → search Hub → install a read-only MCP → configure → apply role → invoke → remove/restart and recover. Then test teams, updates, invalid certificates and permission denial. Record every result in the [intranet checklist](../nova-intranet-acceptance.md) before distributing further.

## Dev Note

A fresh D-drive source copy installed all 355 workspaces from the existing store with frozen-lock offline installation, without copying node_modules. The registry export verified all 1750 original external tarballs (about 3.28 GiB). Desktop's real open-in-app route returned 200 and spawned VS Code after removing inherited Electron Node mode. These observations do not qualify private registry publication, company model calls or an employee installer.

On 2026-10-12, local verification covered pnpm 10.34.6 frozen-lock offline installation, full build, Node 24.21.0/Python 3.12.14 payload preparation, Electron 44.7.0 materials backup/restore and desktop startup. Real loopback tests covered configuration and lifecycle for mock npm MCP, nested GitLab skills and native plugins, not company accounts. Existing test files still cause repository-wide lint type/style errors; the entire repository gate set is not green.

The intranet deployment owner verifies archiving, target reinstall, business invocations and installer signing. Consult official [offline install options](https://pnpm.io/10.x/cli/install#--offline) and [version management settings](https://pnpm.io/10.x/settings#managepackagemanagerversions).
