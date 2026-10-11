# Harness Desktop implementation and intranet handoff

English | [中文](nova-intranet-acceptance.zh.md)

## Implementation boundary

The desktop changes in `super-harness` extend the official `dsh-v0.2.1-alpha.2` baseline pinned in `nova/upstream.json`. Twenty community packages remain pinned to `0.4.5`; twelve client artifact patches disable automatic public heartbeats. Official Agent Loop, Session, Tool, Skill, MCP and Permission remain the foundation. Enterprise business sources in `apps/nova-enterprise/src` use TypeScript and Chinese JSDoc; `.mjs` remains for build bootstraps, tests and executable fixtures.

The companion `nova-harness` owns Hub indexing, private-source artifact contracts, publication and role resolution, not another Agent engine. Type checks, actual Loader compositions and loopback private-source tests do not qualify real intranet deployments or signed installers.

## Implemented features

| Capability | Implementation and entry |
|---|---|
| Desktop AI Hub | Responsive cards, README detail, search, exact-version install, update, disable/enable, rollback and removal |
| Configuration forms | AI Hub → Installed → Detail → Configuration: field types, help, required validation, masked secrets, save/clear/reload; incomplete installs open configuration |
| User/project accounts | Scope selector uses official live-session absolute cwd identity; instances, runtime files and tool visibility are isolated; arbitrary client paths refused |
| MCP startup files | Public JSON/TOML/text fields under `binding.configuration.files` create temporary config files; secrets use environment or explicit bindings; `${TOKEN}` remains for MCP resolution |
| Credential protection | Windows defaults to DPAPI, migrating read legacy records atomically; failures preserve originals; no secrets in logs, argv or Hub |
| Custom roles | Base role plus `add/remove/disable/includeOptional`, instructions, template CRUD, real Hub resolution and official Agent.inject; next task consumes the model |
| Role teams | Official continuable teammates, individual models, maxTokens, durable maxSteps, task DAG, independent Git worktrees, actual-state reads, explicit review and one-commit cherry-pick |
| Author entry | Conversation tool `harness_prepare_resource` creates a review draft; Develop and publish imports files/directories, templates, validates and explicitly writes selected GitLab/npm sources |
| Plugin SDK | `ctx.harnessCapabilities.registerTool` attributes dynamic tools and effect teardown; native Plugin/Bundle settings bind before apply without replacing core |
| Private community task sources | Jira/GitLab Provider templates, normal installation/configuration and manual refresh; first 100 issues, deduplication, read-only, no auto-execution/write-back |
| Direct Hub publication | Upload/sync directly indexes resources without approval workflow; role publication commits immutable versions, not administrator approval |
| Role migration | Eight default profiles use real MCP IDs and DeepSeek runtime; seed preserves existing roles and does not blindly publish missing templates; explicit validated migration publishes directly |

Project scope supports MCP/Skill only; Host Plugin/Bundle requires user scope because it is process-wide trusted code, not a project sandbox. User-scoped same-name capabilities are not silently replaced by project instances. `writeScopes` is advisory, not filesystem authorization; `maxSteps` is a request-step limit, not a monetary or cumulative-token budget. Conditional/abstract policies remain rejected, and roles never elevate native permissions.

## Transfer sources and artifacts

Transfer changes from both repositories using three-way file merges, preserving intranet modifications. Record commits and local diffs, retaining upstream MIT and community Apache-2.0 licenses. No commit/push, dependency reinstall or full build was performed on your behalf.

Also transfer the `novaHarness` metadata now added to package.json in all six local MCP directories: `yapi-mcp`, `memory-mcp`, `mcp/nova-ui-plus-mcp`, `markitdown`, `jira-mcp`, `dbhub`. Versions remain unchanged for merging, not falsely published; select an unused version before intranet publication. Preparation commands below check/adapt other checkouts; these six declarations do not need rewriting.

Desktop delivery requires enterprise `lib/index.js`, `lib/client.js`, `lib/engine.js`, `lib/npm`, official package-set, patched community dependencies and primary-runtime. Source, root lockfile or frontend bundle alone is not an offline desktop. Existing Profiles do not automatically acquire new plugins: first use a separate E-drive test home, then the official Profile/patch API; never replace real user Profiles wholesale.

Also transfer the Jira MCP changes in `jira-mcp/src/config/config.ts`, `test/config.test.ts`, and `README.md`. `JIRA_CONFIG_MODE=env-only` prevents accidental fallback to another local account. Publish a new immutable npm version containing this fix.

## Deployment-owned settings

Copy the [environment example](../nova/deployment-env.example.ps1), create its E-drive directories and replace the Hub/deployment paths. Ordinary users do not enter Hub URLs/tokens. Use `NOVA_HUB_AUTH_ENABLED=false` on Hub and `NOVA_HUB_AUTH_MODE=none` on Desktop. Anonymous browsing belongs on a controlled intranet and does not grant anonymous source writes.

Copy Hub's `manifests/deployments/desktop-intranet.example.yaml`; supply real GitLab groups, npm registry/static index, CA and download allowlists. Resolve source `authRef` through the existing Host environment credential adapter; never commit `.env`, `.npmrc` or passwords. Installation pins exact versions, GitLab SHA/entryPath and npm integrity/archive hashes, not mutable branches or tags.

Official Electron updates are separate from the disabled community updater. Set `DSH_DESKTOP_AUTO_UPDATE_ENV=test`, internal HTTPS `DOWNLOAD_TEST_ORIGIN` and a 32-character lowercase hexadecimal `DOWNLOAD_TEST_RELEASE_ID`; verify feed/bin paths before packaging. Do not use the public production feed for enterprise updates. Existing upload scripts target upstream COS, not an internal static-source uploader. Real certificates, update hosting, analytics and account requests require the checks below.

## Exact adaptation for six MCP packages

Run in the Hub repository. The default checks only; `--apply` modifies the target package.json:

```powershell
node --import tsx/esm scripts/prepare-mcp-manifest.ts --package E:/ai/yapi-mcp/package.json
# After checking the receipt, apply; bump and publish a new immutable version.
node --import tsx/esm scripts/prepare-mcp-manifest.ts --package E:/ai/yapi-mcp/package.json --apply
```

Replace package.json for each directory below. `manifests/mcp-adapters/desktop.json` checks exact names/bins instead of guessing tags or paths.

| Source directory | Desktop parameters | Required intranet checks |
|---|---|---|
| yapi-mcp | REGISTRY_JSON; YAPI_MCP_TOKEN, optional YAPI_MCP_UID | Registry structure, project authorization and HTTP reachability; temporary registry via REGISTRY_PATH/FILE_REGISTRY |
| memory-mcp | No required settings; isolated JSONL under INSTANCE_HOME | Project isolation, no account secrets in memory, locked and mirrored dependency closure |
| mcp/nova-ui-plus-mcp | CONFIG_JSON; optional GITLAB_TOKEN | Actual package/bin, internal UI assets, caches/archives and native dependencies |
| markitdown | CONFIG_JSON | Office/Python/OCR/binaries on the target; project scope and WORKSPACE_CWD for file access |
| jira-mcp | JIRA_BASE_URL, JIRA_USERNAME, JIRA_API_TOKEN | Default Bearer PAT; password-based deployments need a separate secret/binding and new adapter version, not a password disguised as PAT |
| dbhub | CONFIG_TOML, DB_DSN | `${DB_DSN}` in TOML, `--transport stdio --config FILE_CONFIG`; least-privilege test DB, drivers, SSH, TLS and network |

The GitLab MCP source directory, package name, bin, arguments, protocol and authentication are unavailable; it is not marked adapted. Use a custom declaration after transfer and qualify it below. Skills use the same public configuration form but do not support secrets; MCP/Plugin owns account secrets. Parameter-free resources load immediately. Not every Claude plugin is an official Host plugin: require a DeepSeek native binding or explicit conversion adapter.

## Additional MCP and developer entry

See the [capability development standard](nova-capability-development.md) for new/external capabilities, desktop module rules, unified configuration, SDK, roles and the exact Agent creation/publication workflow. Hub preparation now accepts custom `--manifest` declarations without adding each package to the built-in six-package list. Differing existing declarations are not overwritten. Discoverable indexes/matching rules remain required for new packages.

| Capability | Available material/entry | Required intranet material and verification |
|---|---|---|
| CodeGraph | No local source found; package/environment names are not guessed | Source path, package/bin/version, index commands, database/cache, project scan limits, minimal read-only call |
| Playwright (playwrite-mcp) | Local pinned `@playwright/mcp@0.0.80`; new Hub `manifests/mcp-adapters/playwright.json`, verified package/CLI | Actual private coordinates, dependency closure, preinstalled browser path, origins, firewall, tools/list/page tests; not completed browser integration |
| Wiki | No local source found; product unspecified | Product/version, source path, package/bin, REST/authentication fields, space permissions, read-only queries/redaction |
| GitLab MCP | Source/package coordinates unavailable; distinct from GitLab source or Board Provider | Repository/package, authentication, project restrictions, actual protocol/tool permissions |
| Future internal/external imports | Internal npm artifact with novaHarness; independent custom adapter | Exact version, license, dependency closure, runtime assets, public/secret fields, migration and full lifecycle |

Keep one internal record per added MCP: `source repository/path=pending; original version/SHA=pending; private package/version/bin=pending; Hub ID/sourceId=pending; parameter/secret keys (no values)=pending; read-only tool/result=unverified; disable/update/rollback/remove=unverified; two-project isolation=unverified`. Missing material cannot mean installation-ready. Do not publish placeholder records as actual resources.

Choose either the official per-Session Playwright Provider or generic Hub MCP, without duplicate activation. Agent drafts and user-confirmed publication exist; arbitrary-code build sandboxes/GitLab CI do not. The development standard distinguishes content validation, author tests and real installation acceptance. User confirmation is not administrator approval. Build complex source before importing runtime artifacts.

## Migrate default role mappings

Publish/sync the six real packages first. Supply an explicit ID mapping JSON, for example `{ "jira": "jira-mcp" }`, then run in Hub:

```powershell
node --import tsx/esm scripts/import-desktop-roles.ts --hub https://harness.example.internal/api/v1 --mapping E:/harness/deployment/role-id-map.json
# Only after dependency, binding, inheritance and version checks pass:
node --import tsx/esm scripts/import-desktop-roles.ts --hub https://harness.example.internal/api/v1 --mapping E:/harness/deployment/role-id-map.json --apply
```

Published version content is immutable and downgrades are refused; explicitly use `--version 1.2.0` when needed. Parents publish first with individual receipts, not an atomic whole-graph transaction. Repeating skips identical published versions. Upgrade Hub before Desktop consumes `roles?view=published`; drafts no longer hide older roles. Instructions apply only after actual activation, not merely completed downloads.

## Local regression commands

Set TEMP/TMP to E. Scoped desktop checks/build do not rebuild the whole desktop:

```powershell
node node_modules/typescript/bin/tsc -b apps/nova-enterprise/tsconfig.host.json apps/nova-enterprise/tsconfig.client.json
node --import tsx/esm --test --test-concurrency=1 nova/tests/*.test.mjs apps/nova-enterprise/tests/*.test.ts
node node_modules/vitest/vitest.mjs run apps/nova-enterprise/tests/role-runtime.spec.ts apps/nova-enterprise/tests/RolePanel.spec.tsx apps/nova-enterprise/tests/HubPanel.spec.tsx apps/nova-enterprise/tests/RoleWorkspace.spec.tsx --maxWorkers=1 --no-file-parallelism
# Run scoped enterprise Host/Client bundling from apps/nova-enterprise:
node ../../node_modules/tsdown/dist/run.mjs --config-loader native
# Return to the desktop root; artifact tests do not use the TS loader:
node --test --test-concurrency=1 apps/nova-enterprise/tests/*.built.test.mjs
```

Real loopback installation/recovery requires local Hub/mock sources plus `HARNESS_TEST_HUB_URL=http://localhost:3200/api/v1` and `HARNESS_TEST_DEPLOYMENT_FILE` pointing to Hub's `manifests/deployments/mock-host.yaml`; otherwise it explicitly skips. A skip is not a pass. Hub and Jira scoped tests live in their tests/package scripts. No real production model, publication destination or user database was exercised.

## Local evidence recorded on 2026-10-11

| Scope | Result |
|---|---|
| Hub full local suite | 26 files, 92 passing tests |
| Enterprise source/Loader/private-source/recovery suite | 71 passing tests, zero skipped; loopback Hub integration explicitly enabled |
| Desktop/community/profile/package-set/privacy suite | 73 passing tests; Windows filesystem-copy test timeout set to 30 seconds |
| Role runtime and React panel/workspace suite | 21 passing tests |
| Compiled Host/Client/standalone engine artifacts | 4 passing tests without TS loader |
| Jira env-only configuration | 3 passing tests |

Host/Client and Hub/script TypeScript checks, scoped source lint, six package/bin adapter checks, Git whitespace checks and six English/Chinese document pairs passed. Only enterprise Host/Client and Hub API were incrementally compiled. Signed installers, real intranet sources, GUI screenshot verification and complete offline target launch are not covered by these 264 grouped regression cases. A restarted desktop is required to consume the new Host artifact.

## Intranet acceptance checklist

Unchecked items require actual target receipts, logs and screenshots. Never export personal credentials, DB contents or Authorization-bearing captures.

- [ ] Addresses/CA/allowlists: anonymous browse/search without Hub token entry or administrator approval; reject bad certificates, redirects and unauthorized artifact hosts.
- [ ] Every MCP (six packages plus CodeGraph/Playwright/Wiki/GitLab): complete the records above, exact downloads, required forms, bad/good accounts, tools/list, a minimal read-only call, reload, disable, update/rollback/remove; two-project accounts must remain separate.
- [ ] Private dependency closure: full npm transitives/integrity, GitLab SHA/nested Skill, native platform packages/Python/Office/OCR/themes/pet assets mirrored; lifecycle scripts stay blocked, not globally relaxed for one package.
- [ ] Publish loop: test GitLab project/private npm package, generate/import → validate → confirm → upload → sync → exact install; reject duplicates and recover partial tag/index receipts without duplicate writes.
- [ ] Author extensions: real Skill/Plugin/Bundle, parameterless loading and forms when needed; SDK late registration, disable, role denial and restart; separate trusted-code review.
- [ ] Roles/teams: eight mappings, custom composition, logged instructions, actual provider/model, DAG readiness, durable exhaustion, independent worktrees, retained conflicts and explicit merges.
- [ ] Jira/GitLab Provider: actual REST edition, PAT/Basic, project rights, read-only first 100 items, dedup/frozen-content errors, no auto-execution; cancellation on disable, no remote writes.
- [ ] Windows DPAPI: legacy same-account migration, wrong-user refusal, preserved originals on failure; no user credentials in installer; access-controlled pre-upgrade store backup.
- [ ] Full installer: real Windows signing, clean-machine disconnected launch, no development checkout, E-drive paths and licenses; GUI card/form/team/board screenshot acceptance is separate from source tests.
- [ ] Outbound review: firewall permits only Hub/GitLab/npm/model/internal updater; audit official account/analytics/update and community assets; disabled public market/tunnel/GitHub Provider stays offline.
- [ ] Internal update/recovery: TLS feed, SHA-512, publisher signature, no silent interruption, explicit confirmation, preserved Profile/roles/config; reject corrupt releases, reinstall old artifacts and restore backed-up data without claiming one-click data downgrade.

## Explicit non-goals

Anonymous deployment does not add SSO or an approval backend. Arbitrary conditional policies lack an authoritative executor and remain fail-closed; trusted Host plugins do not provide an OS sandbox. These deliberate limits are not disconnected missing features, and do not authorize bypassing official permissions. Actual CodeGraph/Wiki/GitLab MCP material, production publication authority, Windows certificates and real intranet qualification cannot be filled externally.
