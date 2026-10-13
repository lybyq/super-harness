---
description: "Connect an enterprise Hub, install and configure intranet capabilities, apply role instructions, and launch official agent teams."
kind: "package-reference"
---

# @deepseek-ai/dsh-nova-enterprise

English | [中文](README.zh.md)

## Summary

Open AI Hub to search, install, configure, and publish capabilities through responsive cards. Users do not enter a Hub URL or token. MCPs, Skills, native plugins, and configured Bundles load through official extension points; secrets stay Host-owned. Roles restrict session tools and Skill discovery; official Agent Teams use each member's own role plan. Valid cached metadata and artifacts support restart recovery without Hub access. Real intranet packages and signed offline installers still require qualification.

Catalog publication requires no approval. Local download, configuration, compatibility, and activation checks remain separate from native tool permissions.

Desktop branding uses the native sidebar mark/name and conversation hero slots at priority `-100`, supplied with readonly `window.novaBrand` from the desktop preload. Pending or failed intranet images show a bundled Nova fallback immediately. Without this desktop value, the plugin contributes no brand overrides; disposing the plugin restores the native occupants.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

The Nova Desktop Host deployment patch mounts this package alongside the official UI.

### When to choose it

Choose it for the current Nova Hub protocol. Continue using the official Plugin Manager for existing official bundles. This is a plain Cordis plugin, not a bundle: it has no `dsh.bundle.patch`, so do not install it as a profile layer with `dsh plugin add`.

### Minimal configuration

In a composition, the smallest mount is:

```yaml
- id: nova-enterprise
  name: '@deepseek-ai/dsh-nova-enterprise'
```

The official authenticated `connection` and `credentials` services must already be present. [Config](src/index.ts) owns accepted settings; the new application-owned plugin does not yet have a generated config-catalog entry.

| Field | Default | Meaning |
|---|---|---|
| apiBaseUrl | empty | Administrator-managed API URL ending in `/api/v1`; empty reports an unconfigured deployment without network requests |
| secretProtection | none | Plugin default preserves its Provider; Windows Desktop defaults to windows-dpapi bound to the current Windows user |
| authentication | none | Explicit `none` or `bearer`; authentication failures never trigger anonymous fallback |
| tokenEnvironmentVariable | NOVA_HUB_TOKEN | Host environment variable holding a Bearer token; not read or sent in `none` mode |
| allowInsecureHttp | false | Allow an explicitly configured HTTP Hub; HTTP does not protect tokens in transit |
| timeoutMs | 15000 | Hub network request timeout, positive integer, at most 120000 ms |
| maxResponseBytes | 2097152 | Response byte limit, positive integer, at most 16777216 |
| maxRequestBytes | 65536 | Configuration request byte limit, positive integer, at most 1048576 |
| engineEntry | empty | Empty uses bundled `lib/engine.js` and npm CLI; optional development anchor resolves shared packages without executing CLI main |
| deploymentFile | empty | Trusted-source DeploymentProfile; Hub URL and runtime must match the desktop |
| resourceHome | empty | Desktop-owned Store root, separate from CLI state |
| seedBuiltinThemes | false | Seed missing offline themes; the Desktop Host enables this without changing the active skin |
| maxHistory | 10 | Retained capability revisions, range 1–100 |
| offlineMaxEntries | 200 | Validated read-cache entries per Hub, range 1–1000 |
| offlineMaxBytes | 16777216 | Total read-cache bytes, range 1–67108864 |
| offlineMaxAgeMs | 86400000 | Cache lifetime in milliseconds, range 1–2592000000 |
| activationTimeoutMs | 30000 | Native plugin startup wait, range 1–120000 ms |
| allowPublishing | false | Explicit deployment source-write switch, not a publication approval workflow |
| publishingTimeoutMs | 120000 | npm publication timeout, range 1000–600000 ms |
| teamProvider | spawn | Official continuable subagent provider |
| teamStartupTimeoutMs | 60000 | Teammate provisioning budget, range 1000–120000 ms |

The Desktop Host patch reads `NOVA_HUB_API_URL`, `NOVA_HUB_AUTH_MODE` (default `none`), and `NOVA_HUB_ALLOW_HTTP` (`true` explicitly permits HTTP). Administrators supply these in the desktop launch environment and restart the desktop. For `bearer`, inject `NOVA_HUB_TOKEN` through the enterprise launch environment; it is not returned to the Client or sent to the model. HTTP does not protect credentials in transit. Do not commit addresses or tokens to the public repository. Real intranet connectivity must be verified in the target network.

### Offline desktop themes

The Desktop Host seeds six paired light/dark palettes into `$DSH_HOME/skins`: Obsidian, Deep Sea, Pine, Polar, Warm Paper and Mist. It also supplies Quiet Dunes, Distant Horizon and Architectural Arc with local SVG backgrounds. Open the community Skin Center to preview and apply them; official appearance settings select light, dark or system mode. Styles, previews and backgrounds come from bundled data, without network requests, fonts or executable hooks. Backgrounds decorate the conversation scrolling area while input and code surfaces retain their palette colors. Existing same-ID entries and the active selection are never overwritten. Removing a supplied theme restores it at the next startup while seeding is enabled; disabling seeding does not remove existing files. Directory failures produce a startup warning without disabling the Hub. Actual desktop visual acceptance remains manual.

### Configure capabilities in the desktop

Windows Desktop defaults to `windows-dpapi`, explicitly selectable with `HARNESS_SECRET_PROTECTION`. Old enterprise configurations migrate on first read under the official credential lock; unread records are not traversed. Failures preserve old records and refuse dependent work. Encrypted records remain unreadable with protection disabled. This protects capability parameters and conversation drafts, not the entire official credential store; see the [upgrade guide](../../docs/upgrade-guide/v0.2.1-alpha.2/harness-windows-credential-protection/guide.md).

Choose user scope or an open project at the panel top. Project IDs derive from official root-session cwd; settings, credentials, install state and MCP processes are separate. Team worktrees inherit the Lead project identity. Host plugins and Bundles install at user scope because they contribute global services. User capabilities remain global and are not implicitly replaced by project capabilities.

1. Open **AI Hub**. The enterprise catalog loads automatically without a Hub connection form.
2. Search by text and capability type. An unconfigured deployment asks you to contact an administrator; connection failures offer **Reload** after checking the enterprise network or VPN. Empty results appear only after a successful response.
3. **Details** opens README by default. **Configure** shows field explanations, types, and required markers. Choose an exact version and **Install**; missing account settings retain the download as configuration-needed, never as active.
4. Saving reloads installed capabilities; blank secrets retain existing values and may be cleared individually. **Installed** supports update, enable/disable, remove, and rollback. These are local runtime observations, not Hub publication approval states.

Supported schemas include string, number, integer, boolean, scalar enum, absolute URI format, and string arrays with item constraints, item-count limits, and uniqueness. Arrays use a JSON text area, for example `["NOVA", "PLATFORM"]`. Required fields and supported bounds are rechecked by the Host against a freshly fetched Hub declaration. URI validation is syntax validation, not an outbound-network permission policy.

Unknown constraints, nested objects, references, secret arrays, duplicate keys, and non-user secret scopes are refused. Schema defaults are neither exposed nor automatically injected. Valid environment-variable keys map directly for stdio MCP; map other keys explicitly with `${KEY}` in binding `env`/`args`. HTTP MCP uses `url`/`headers`. Native Host plugins receive similarly bound configuration. Skill public settings append to model-visible content; configure secrets on the MCP it calls instead.

Installation requires deployment-owned `NOVA_DEPLOYMENT_CONFIG` and `HARNESS_DESKTOP_RESOURCE_HOME`; `HARNESS_ENGINE_ENTRY` is optional. The desktop package contains the shared core/installer/contracts libraries, YAML parser, and npm CLI. npm runs with desktop-owned temporary/cache directories and scripts disabled by default. Deployment lists GitLab/npm sources, trusted hosts, and independent `authRef` environment variables. Installation identifies npm package/version/integrity and GitLab SHA/entryPath and rejects changed caches. An optional development anchor requires already-built shared packages; end-user delivery does not require the Hub source checkout.

For a configured Bundle, declare `configuration.bundleRows: [{ id, name, configuration }]` in its native runtime binding. Each row must match an ordinary plugin row in the official Bundle inventory and must not override core rows. Put `${KEY}` references in the row configuration; every saved parameter must be mapped. The adapter installs disabled, validates ownership, then enables through official Plugin Manager. Bound secrets enter the final in-memory plugin configuration, never the Bundle patch or immutable Store. Configuration is saved in official credentials and reapplied on activation; restart-required remains distinct from active.

Network failure or timeout can reuse previously validated searches, capability documents, READMEs, and role plans until their cache expires. Authentication errors, deleted resources, invalid responses, and cancellation never fall back. Offline searches reuse the exact cached query, not a complete mirror of the Hub. Restart restoration revalidates cached artifacts; it cannot download missing artifacts without their source. Running MCPs still need access to their own business services.

### Create and publish resources

Conversation tool `harness_prepare_resource` saves bounded UTF-8 drafts without executing or publishing code. Import and review current-project drafts, or delete them. Directory import preserves relative paths and excludes `.git`, `node_modules` and `.env`; final admission stays Host-owned. Native plugin templates use `ctx.harnessCapabilities.registerTool` and declare `inject: ['harnessCapabilities']`. The exported author SDK retains ownership for later dynamic tools and disposal; no separate community SDK is required.

MCP bindings can declare `configuration.files: [{ name: 'CONFIG', field: 'CONFIG_JSON', format: 'json' }]`. The field must be public text; `format: 'text'` supports TOML. The Host generates files outside Store and injects `${FILE_CONFIG}`; disable deletes only launch files, not MCP data. Environment references inside content remain for the MCP to resolve, never replaced with Host secrets. `${INSTANCE_HOME}` is stable instance data; `${WORKSPACE_CWD}` is Lead cwd, falling back to Host cwd at user scope. Prefer project scope for project-file access. Hub's `manifests/mcp-adapters/desktop.json` and `scripts/prepare-mcp-manifest.ts` prepare six exact npm adapters; GitLab MCP still requires its real coordinates.

Open **AI Hub → Develop and publish**, select a deployment source, create a Skill/MCP/Plugin template or import UTF-8 text files, edit, then validate. Publication requires a fresh checksum and explicit confirmation of the destination and version. GitLab targets must already exist within the deployment-owned group; publication writes files to their default branch and creates an immutable `v<version>` tag pointing to the returned commit. npm publication uses the exact package/version and configured private registry, with scripts disabled and credentials outside the uploaded package. The Host then requests source synchronization and verifies that Hub indexes the same version/commit. See the [GitLab commit API](https://docs.gitlab.com/api/commits/) and [tag API](https://docs.gitlab.com/api/tags/).

Deployment enables source writes with `HARNESS_ALLOW_PUBLISHING=true` and source-specific credentials; ordinary users never fill registry tokens in this panel. There is no publication approval state. An existing version, changed draft, or invalid destination stops publication. A commit whose tag fails returns `source-partial`; a successful source write not yet indexed returns `published-not-indexed`. Receipts show exact coordinates and commit when available. Uncertain writes are not automatically retried. Import supports text files within the request budget, not arbitrary binary archives or creating GitLab projects.

### Preview roles

Open **AI Hub → Role composition → Load roles**, select published roles, then choose **Resolve composition**. The Host sends `runtime: deepseek-harness`, the selected role IDs, and `scope: user` to the existing Hub resolver. It does not send saved secrets, configuration overrides, or permission overrides.

Preview shows exact versions, dependency order, permission declarations, and missing settings without secrets. On the right, save, edit, or delete local role/team templates, enter responsibilities, and explicitly select an idle root session. **Apply role** ensures required capabilities are active and queues official `Agent.inject` context; the next user task consumes and logs it without an implicit model call. **Start team** requires a task and cost confirmation, creating independent teammates through official `spawn`. Partial failure reports already-created members rather than restarting them.

Role installation uses the selected user/project scope without uninstalling other capabilities. Host masks Hub MCP tools, tracked native plugin tools and Skill discovery to the selected session's role. Members receive individual plans before the first request; children inherit owner restrictions and saved assignments restore at startup. Native permissions never elevate. Only unconditional `deny` rules with `resource: '*'` and `action: 'tool:<name-or-trailing-prefix*>'` map to guards; conditional, abstract-resource and approval rules are refused. Hub RoleProfile uses its description for responsibilities; personal instructions live in templates.

Desktop uses `roles?view=published`, so newer drafts do not hide published roles. Hub's `scripts/import-desktop-roles.ts` validates the entire default-role graph and explicit capability-ID mapping before writes. `--apply` publishes new versions in inheritance order; partial publication reports completed IDs, not an atomic migration.

Team templates define member Provider/Model, per-request `maxTokens`, durable step limit `maxSteps` and independent Git worktrees. Steps commit before model admission and survive restart; they are not a financial or total-token budget. Worktrees start at committed HEAD without copying dirty files. Task JSON defines `id/subject/description/member/dependsOn/writeScopes`; the Host validates the DAG then persists through official Team tasks. Write scopes are advisory. Inspect real tasks, members, budgets and receipts; review bounded worktree diffs and recent commits, then explicitly cherry-pick one commit. The main checkout must be clean with unchanged HEAD and no running teammates. Conflicts/uncertain outcomes retain the scene without reset or retry; worktrees remain for user-managed archival.

Template fields `add/remove/disable/includeOptional` customize a selected base role. The Host resolves them again before applying; team optional selections affect only members whose inherited roles declare them. The updated Hub returns `optionalCapabilities` for that purpose; upgrade an older API before using team optional selections. Disabling a capability excludes it from that role, not from other projects.

**Develop and publish → Plugin** includes Jira/GitLab task-board Provider templates. Install in user scope and configure address/project/account in the configuration tab, then use **Develop and publish → Refresh integrations** and the manual pull button. Providers consume the pinned community board's public API v1 without enabling its public GitHub integration. They import the first 100 open issues as backlog cards and never automatically execute tasks, poll, or write remote status. Jira uses REST v2 with PAT/Bearer or Basic authentication; real editions and account rights remain intranet acceptance items.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Host business sources and source tests use TypeScript; Client sources use TS/TSX. Separate Host and Client projects inherit strict repository checks. Production exports load `lib/index.js` with declarations under `lib/types/host`, not raw source files or a TS loader. The Client contributes official sidebar/main slots, and requests use the authenticated connection. Host effects own transport, credentials, admission, and runtime disposal.

| Source | Responsibility |
|---|---|
| [index.ts](src/index.ts) | Deployment limits, authenticated routes, atomic credential modification, redacted errors |
| [hub-client.ts](src/hub-client.ts) | Bounded Hub HTTP requests, cancellation, timeout, redirect refusal |
| [offline-client.ts](src/offline-client.ts) | Validated, bounded, deployment-isolated read cache |
| [catalog.ts](src/catalog.ts) | Untrusted catalog and form admission; configuration validation |
| [roles.ts](src/roles.ts) | Published-role selection and redacted exact-version preview |
| [capability-engine.ts](src/capability-engine.ts) | Shared-library admission, trusted deployment, and installer |
| [lifecycle.ts](src/lifecycle.ts) | Serialized changes, receipts, missing-settings states, recovery, and rollback |
| [runtime-provider.ts](src/runtime-provider.ts) | Official MCP/Skill/Plugin lifecycle and parameter binding |
| [bundle-configuration.ts](src/bundle-configuration.ts) | Owned Bundle row parameters in the final in-memory configuration |
| [role-access.ts](src/role-access.ts) | Session tool masks, final execution guards, Skill discovery restrictions |
| [role-runtime.ts](src/role-runtime.ts) | Local template CRUD, responsibility queueing, official teams |
| [publication.ts](src/publication.ts) | Resource templates, validation, explicit source publication and Hub indexing |
| [workspace.ts](src/workspace.ts), [credential-protection.ts](src/credential-protection.ts) | Project identity and Windows credential protection |
| [capability-tools.ts](src/capability-tools.ts), [resource-drafts.ts](src/resource-drafts.ts) | Dynamic tool author SDK and reviewable conversation drafts |
| [runtime-files.ts](src/runtime-files.ts), [team-worktrees.ts](src/team-worktrees.ts) | Public config-file lifecycle and review/confirmed merge |
| [Client entry](src/client/index.ts) | Official slots and bilingual locale contributions |
| [HubPanel](src/client/HubPanel.tsx) | Automatic catalog loading, retry, search, capability configuration, role-request control |
| [RolePanel](src/client/RolePanel.tsx) | Pure role-composition display; no credential or service access |
| [AuthoringPanel](src/client/AuthoringPanel.tsx) | Text drafting, checksum validation, destination confirmation and receipts |

Capability grants use the official credential Provider with optional Windows DPAPI protection. The connection route is read-only; old user-saved Hub connection records are ignored, not deleted. Administrators own connection settings and Host token injection. Source registry authentication remains separate from the Hub token.

</details>

<a id="further-exploration"></a>
## Further Exploration

- [Nova development](../../nova/README.md) — baseline, community layers, and verification boundaries.
- [Capability development](../../docs/nova-capability-development.md) — MCP/Skill/Plugin/module extensions, configuration, roles and Agent publication workflow.
- [Community inventory](../../docs/nova-community-integration.md) — complete pinned module inventory and disabled defaults.
- [Official desktop](../desktop/README.md) — bundled runtime and delivery contract.
- [Client group](../../packages/client/README.md) — shared browser module-loader build.

<a id="model-experience"></a>
## Model Experience

Enabled MCPs expose official registry tools named `mcp__hub_<id hash>__<tool>`; disabling/removing revokes contributions. Official Skill discovery loads content and public settings on demand. Role responsibilities are model-visible user context queued by `Agent.inject` and recorded at the next task. Native plugins can contribute tools or prompts. Hub tokens never enter the model; account secrets bind only to executing capabilities, not role instructions or Skill content. Tool results may contain sensitive business data and require each MCP's own controls.

#### KV Cache effect

MCP changes and role capability restrictions alter the tool catalog and may affect cache reuse. Role responsibilities append user context without changing the fixed system prefix; earlier role messages remain in history. Skill content enters task context only when read. Teammates use independent sessions, so Lead context-cache reuse must not be assumed.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

These are explicit current boundaries; local isolated tests do not qualify every intranet resource.

- GitLab Host plugins need built, self-contained entries; Claude-only plugins without native bindings are rejected. Bundles require official Plugin Manager and explicit row mappings when configured. Role application may install partial capabilities and is not an atomic transaction.
- Role restrictions are not an OS sandbox. Native plugins and owned Bundle rows using the author SDK support dynamic tool ownership; later legacy tools bypassing it and core override rows are not guaranteed attributable.
- Settings are per user/project instance, but secret declarations still use the supported user type. There is no conditional-policy executor or SSO login flow; anonymous deployments do not need SSO. Windows DPAPI has no cross-user export or other-OS keychains. Cache expires and disconnected first starts cannot discover uncached resources.
- Actual intranet access and a disconnected packaged launch remain unverified. The desktop pack pipeline explicitly includes this private plugin and checks required files; no signed offline installer has been qualified.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Core additions use Chinese JSDoc for responsibilities, parameters, results, and security boundaries. Do not modify Agent Loop, silently execute lifecycle scripts, infer a binary from capability ID, or treat `hasRuntimeBinding` as compatibility approval. Keep source-specific configuration inside the current Hub binding's `configuration` object; sibling custom fields would be stripped by its existing schema.

Generate the installer artifact from the already-built shared workspace before packing the desktop:

```sh
node apps/nova-enterprise/scripts/bundle-engine.mjs --from ../nova-harness
```

The build records shared entry versions and hashes and includes npm's dependency tree and license files in `lib/npm`. `lib/` is ignored source-build output: transferring only Git sources does not transfer these artifacts. Transfer the prepared package/payload or regenerate it before offline packaging. Runtime loading with empty `engineEntry` never resolves the external checkout.

The desktop development launcher and target packager put temporary files and npm cache under `.desktop-build/scratch` on the project disk; `DSH_DESKTOP_SCRATCH_DIR` overrides that directory. Development `--skip-build --reuse-runtime` reuses verified existing artifacts/runtime instead of rebuilding the runtime. The prepared runtime must contain `runtime.json`. This does not move or delete existing C-drive files, and external tools not started by these launchers still own their storage settings.

After changing this plugin, incremental verification is sufficient; the existing root build need not be repeated:

```sh
node node_modules/typescript/bin/tsc -b apps/nova-enterprise/tsconfig.host.json apps/nova-enterprise/tsconfig.client.json
```

Run its Host and Client bundles from the package directory:

```sh
node ../../node_modules/tsdown/dist/run.mjs --config-loader native
```

Then run from the repository root:

```sh
node --import tsx/esm --test --test-concurrency=1 nova/tests/*.test.mjs apps/nova-enterprise/tests/*.test.ts
node --test --test-concurrency=1 apps/nova-enterprise/tests/*.built.test.mjs
```

Source tests run through the TS loader; `.built.test.mjs` tests run without it and load production artifacts. Standalone build scripts and executable npm/plugin fixtures keep ESM JavaScript intentionally. Optional integration in `tests/composition.test.ts` requires `HARNESS_TEST_HUB_URL`, `HARNESS_TEST_DEPLOYMENT_FILE`, and indexed `mock-mcp`/`mock-nested-skill` fixtures; `HARNESS_TEST_ENGINE_ENTRY` is optional. It tests restart recovery while Hub/artifact endpoints are closed. Role tests use a keyless model; Bundle tests verify pre-apply binding, and publication tests use temporary loopback private sources. These checks do not qualify production credentials or signed installers.

Remaining deployment qualification and extensions:

| Work | Concrete location/approach | Acceptance |
|---|---|---|
| Intranet resource adaptation inventory | Per-MCP schema/binding.env/headers/bin; GitLab SHA and Skill entryPath | Real tools/list, call, reload, and uninstall for yapi, memory, nova-ui-plus, markitdown, jira, dbhub, gitlab |
| Signed offline desktop delivery | Existing Desktop package-set and target-specific signing | Packaged disconnected cold launch on the target Windows machine, without either development checkout |
| Deployment security | Windows-account DPAPI migration, registry rights and trusted plugin review | Reconfigure identities without exporting secrets; anonymous Hub needs network controls, not SSO |

The [intranet handoff](../../docs/nova-intranet-acceptance.md) records implemented features, exact adapter commands and unchecked target-environment acceptance items. Conditional permission languages remain rejected without an authoritative policy engine.

</details>
