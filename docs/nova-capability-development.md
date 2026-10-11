---
description: "Harness enterprise capability development reference for MCP, Skill, native Plugin/Bundle, intranet imports, configuration, roles and Agent draft publication."
---

# Harness capability development standard

English | [中文](nova-capability-development.zh.md)

## Summary

This reference extends the current desktop without creating another Agent engine. Capability authors develop MCP/Skill/Plugin in independent repositories, platform developers extend official services and UI in `super-harness`, and `nova-harness` owns discovery, downloads and role resolution. Installation uses AI Hub; resources without parameters load directly, while required parameters must be configured before activation.

Agents can create text drafts. Users review and publish them to a selected internal source, synchronize Hub, install them and add them to roles. Publication does not mean generated code passed tests; there is no sandbox that automatically builds arbitrary drafts, nor a preconfigured GitLab CI pipeline for authors. Real intranet verification belongs in the [handoff checklist](nova-intranet-acceptance.md).

## Table of Contents

- [Choose an extension entry](#extension-entry)
- [Source and module standards](#module-development)
- [Add and import MCP](#mcp-onboarding)
- [Configuration and permissions](#configuration-permissions)
- [Skill and native Plugin](#skill-plugin)
- [Agent creation and publication workflow](#agent-authoring)
- [Acceptance and failure recovery](#acceptance)
- [Dev Note](#dev-note)

-----

<a id="extension-entry"></a>
## Choose an extension entry

Use the smallest extension that meets the goal. An arbitrary npm package or Claude plugin is not a Harness Plugin.

| Goal | Type and entry | Publication location | Constraint |
|---|---|---|---|
| External tools such as Jira/Wiki/code graphs/browsers | MCP; official MCP Client | Private npm with capability declarations | npm CLI entries currently run under Node; Python/native binaries need explicit wrappers or independent services |
| Procedures, domain conventions and delivery requirements | Skill; official filesystem Skill Provider | GitLab `skills` Group | Public parameters can reach the model; Skill secrets are unsupported |
| Host services, tools, event listeners and task sources | Native Cordis Plugin; `apply(ctx, config)` | GitLab `plugins` Group | Trusted process-level code, user scope only |
| Pluggable composition of official/enterprise plugins | Bundle; `dsh.bundle.patch` in `package.json` | GitLab `plugins` Group | Uses official Plugin Manager; desktop restart may be required |
| Desktop panels, settings and rendering components | Official Client plugin or Bundle with Client code | Desktop package set/verified Bundle | A standalone Client package cannot be imported as Host JS |
| Model routing, permission policy or storage replacement | Existing Service Provider/Preset/Profile extension | Enterprise platform source/Bundle | No Agent Loop changes or official permission bypass |

MCP tools, Skill procedures and Role responsibilities are separate layers. Roles compose existing capabilities rather than implement tools. Team members have their own roles and capability scopes; a tool installed by the Lead is not unconditionally shared.

-----

<a id="module-development"></a>
## Source and module standards

Enterprise Host code lives in `apps/nova-enterprise/src`, and Client code in its `src/client`; their entries are `src/index.ts` and `src/client/index.ts`. Add domain modules in the corresponding directory instead of placing every feature in an entry file. Independent official service packages follow [adding a package](cookbook/adding-a-package.md) and the [architecture](architecture.md). Community ports remain plugins/Bundles, not renamed runtime identities presented as official implementations.

Develop with TypeScript, ESM, strict checking and Chinese JSDoc. Repository source packages follow local `.ts` import and compiler rewriting rules; independent MCP repositories use their own build configuration. Deliver compiled JS and required static assets, not raw TS that the target desktop must load. The template `index.js`/`server.mjs` files are directly validated runtime artifacts, not a requirement to write business source in JS.

Public methods document parameters, return values, rejection conditions, side effects and cleanup ownership. Errors use structured codes and actionable UI reports, without tokens, authentication headers or plaintext configuration logs. Optional services use `ctx.get()`; required services declare `inject` and fail explicitly when absent. Events and registrations use `ctx.on()`/`ctx.effect()`; disposal cancels requests, closes subprocesses and removes tools/listeners.

New tools follow [adding a tool](cookbook/adding-a-tool.md), with stable names, explicit JSON argument/result schemas and designed result presentation. Responsibilities, tool results and context visible to the model must be reconstructable from official Session logs, not only edited in-memory prompts. Do not rewrite released Session data formats directly.

Host and Client compile separately; public type changes update every consumer. UI copy belongs in typed locale dictionaries rather than hardcoded Chinese buttons. Independent plugins own their source, tests, build and README; published artifacts exclude `.env`, `.npmrc`, accounts, development caches and local-machine paths.

Development acceptance covers success/rejection, dynamic registration/disposal, two-project isolation, execution refusal under denied roles, timeout/cancellation and cold-start recovery. Source tests do not replace built-artifact Loader tests. Model-visible changes also need repository-required keyless replay. Changes to official core types, Sessions or SDKs follow their owning standards, not only enterprise tests.

-----

<a id="mcp-onboarding"></a>
## Add and import MCP

The desktop loads declarations rather than dedicated CodeGraph/Wiki switches. The preparation tool supports custom JSON through `--manifest`. Hub discovers resources from source indexes and package declarations, so adding a package usually needs no desktop core changes. The tool checks by default; only `--apply` modifies the specified package.json. It does not download, start or publish anything.

This is a format example, not the parameters of any real Wiki/CodeGraph implementation. Confirm the package name, version, bin and environment variables against its source. Optional `packageVersion` requires an exact match when supplied, suitable for pinned upstream adaptations.

```json
{
  "packageName": "@internal/future-mcp",
  "packageVersion": "1.0.0",
  "manifest": {
    "id": "future-mcp",
    "displayName": "Future MCP",
    "configuration": [
      { "key": "BASE_URL", "required": true, "description": "服务根地址", "schema": { "type": "string", "format": "uri" } }
    ],
    "secrets": [
      { "key": "API_TOKEN", "required": true, "scope": "user", "description": "当前用户访问令牌" }
    ],
    "runtimeBindings": {
      "deepseek-harness": {
        "type": "mcp",
        "compatibility": ">=0.2.1-alpha.2",
        "configuration": { "transport": "stdio", "bin": "future-mcp", "args": [], "env": { "SERVICE_URL": "${BASE_URL}" } }
      }
    }
  }
}
```

The tool writes `manifest` to `package.json.novaHarness`, not the outer package coordinates. Object `bin` entries require an exact key and safe relative entry path. String single-entry packages omit binding `bin`, matching the desktop installer. Package/name/version/entry mismatches, missing stdio MCP bindings and differing existing declarations reject. The tool does not overwrite customized declarations.

The six existing adapters still use built-in declarations. The new Playwright declaration lives in the Hub repository at `manifests/mcp-adapters/playwright.json`. Run the following from Hub; the second command checks the local dependency and applies only when this development-checkout path exists. Neither modifies `node_modules`.

```powershell
node --import tsx/esm scripts/prepare-mcp-manifest.ts --package E:/ai/yapi-mcp/package.json
node --import tsx/esm scripts/prepare-mcp-manifest.ts --package E:/ai/super-harness/packages/experimental/browser-use-playwright-mcp/node_modules/@playwright/mcp/package.json --manifest manifests/mcp-adapters/playwright.json
```

Package authors publish from independent source checkouts: validate, build and test, choose an unused private version, package the compiled entry/production dependency lock/README/declaration, publish to private npm, update `seedPackages` or the static index, ensure `packagePatterns` matches the exact name, then synchronize Hub. Uploading a tarball without a discoverable index is insufficient. If repackaging changes content, record the original version/license and new private coordinates/integrity rather than claiming the original upstream artifact.

External imports first pin a source/package version and inspect licenses, executable scripts, network requests, dependencies and native assets. Mirror the complete dependency set internally. `npm-shrinkwrap.json` can lock dependencies in npm artifacts; a pnpm development lockfile alone does not fix versions when the installer uses npm. Lifecycle scripts are disabled by default; prebuild assets in a controlled build environment rather than enabling arbitrary scripts globally. A GitLab MCP repository cannot use the current Skill/Plugin publication path solely because it is a Git repository; specify its MCP artifact entry.

For CodeGraph, confirm indexing commands, index database/cache paths, project root, initial indexing cost, Node/Python/native dependencies and scan limits. For Wiki, confirm product/version, REST paths, account authentication, space/project restrictions, read-only tools and sensitive content. Their source was not found locally, so adaptation cannot be declared complete. Record actual coordinates and verification in the [intranet handoff](nova-intranet-acceptance.md).

Playwright (written as playwrite-mcp by the user) has two separate entries: official `experimental-browser-use-playwright-mcp` provides a per-Session browser; AI Hub installation of `@playwright/mcp` provides a generic MCP per capability instance. Avoid enabling both and duplicating tools. The new declaration is checked against local `@playwright/mcp@0.0.80`, with an isolated headless browser, explicit executable path, allowed origins and instance output directory. It does not promise a separate browser for each chat in a project. The official Session Provider is not automatically a Hub-role-managed capability.

Preinstall the Playwright browser, pinned dependencies and target-system libraries internally; `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` does not install a browser. Upstream `allowed-origins` does not restrict redirects, so a firewall owns final network controls. Page logins/Cookies must not become public Hub parameters; the current template does not import login state. Only package/CLI declarations were verified; real page operations and image-model routing require intranet tests.

-----

<a id="configuration-permissions"></a>
## Configuration and permissions

Users open AI Hub → Installed → resource details → Configuration, after choosing user or project scope. Missing required installation parameters open the form. A resource is usable only after configuration and successful activation. Deployment staff configure Hub URLs/source authentication; users do not fill Hub tokens. Each new MCP declares its own fields rather than a mandatory URL-plus-token template.

Public fields use `configuration`, and account secrets use `secrets`. The desktop supports string/number/integer/boolean/string arrays and its defined enum/range/length/uri schema options, not arbitrary JSON Schema. Complex JSON/TOML uses documented string fields; `_JSON`/`_TOML` fields have multiline editors. Renaming configuration keys or changing authentication is a compatibility change requiring migration guidance, not silently treating an old password as a new token.

Exact `${FIELD}` replacement preserves JSON types. Ordinary environment-name fields enter stdio child environments; `env` explicitly maps names expected by the server. Temporary public files use `{name, field, format}` in `configuration.files`, supporting json/text. Host supplies `FILE_<name>`, `INSTANCE_HOME` and `WORKSPACE_CWD`; fields must not impersonate reserved values. MCP cwd is the artifact Store, not automatically the project directory. Servers needing the project path explicitly reference `WORKSPACE_CWD` in their parameters.

Configuration files contain only public content; `${DB_DSN}` and similar references remain for MCP environment resolution rather than secret interpolation into generated files. Secrets remain in Host credential records/runtime memory, with Windows DPAPI; normal reads do not return them to UI, Hub or Skill text. MCP tool outputs can still leak credentials themselves, so authors own redaction; arbitrary plugin code is not a platform sandbox.

Roles control capability visibility and supported execution-level tool denials. Server ACLs, read-only database accounts and project/file restrictions remain authoritative permissions. Code generation, installation and role composition do not elevate them. Project ownership uses real cwd rather than Client-selected paths. Host Plugin/Bundle is user-scoped only. Unsupported conditional policies and abstract resource approval rules reject explicitly rather than allowing by default.

-----

<a id="skill-plugin"></a>
## Skill and native Plugin

Skill artifacts contain `SKILL.md` name/description frontmatter, procedures, README and GitLab `nova.manifest.yaml`; `metadata.id` matches the capability ID, and `runtimeBindings.deepseek-harness.type=skill`. Configuration can be appended to model-visible Skill content, so only public work conventions belong there. Secret operations rely on MCP/Plugin instead. Role add/remove/disable/includeOptional composes existing capabilities without editing the original default role.

Native Plugin artifacts contain ESM/compiled `main`/`dsh` declarations in `package.json`, the JS entry, README and a plugin binding in `nova.manifest.yaml`. The development/publication page offers standard Plugin and Jira/GitLab Board templates. Executable template files are owned by the [template implementation](../apps/nova-enterprise/src/publication.ts), not a duplicated SDK example that can drift.

Enterprise tools use `ctx.harnessCapabilities.registerTool(definition)` with `inject=['harnessCapabilities']`. The SDK uses the installed instance's actual owner, applies role limits to dynamic tools, and returns asynchronous disposal managed as an effect. Do not forge `harnessCapabilityOwner` or register delayed tools through another registry to bypass ownership. Arbitrary dynamic behavior in legacy native plugins that bypass this SDK is outside enterprise exact-ownership guarantees.

Plugin `${FIELD}` configuration binds before official Fiber mounting. Bundle configuration maps owned plugin rows before enabling, not other Bundles or core-service overrides. Standalone Client plugins do not use Host import; build them with official Client/Bundle rules and verify Loader delivery. An npm name, Claude manifest or single JS file alone is not a native Harness plugin.

Role teams inject responsibilities through official Agent.inject and create tasks by dependency graph. Members can choose provider/model, maxTokens/maxSteps and independent Git worktrees. Installed capabilities must still be assigned to member roles; team permissions do not expand automatically. `maxSteps` is not a monetary limit, and worktrees are not OS file sandboxes. Team operation and intranet verification remain in the [handoff document](nova-intranet-acceptance.md).

-----

<a id="agent-authoring"></a>
## Agent creation and publication workflow

The current workflow keeps publication decisions with the user, not a resource-approval system. Users request Skill/MCP/Plugin creation; the model saves UTF-8 text drafts through `harness_prepare_resource`. The tool does not execute generated code or read publication credentials. Drafts bind to actual sessions/projects, retain at most 20 drafts and 100 files per draft, and use deployment `maxRequestBytes` (64 KiB default, configurable to 1 MiB), not a large artifact repository.

1. Describe the capability, business scope, read-only requirements, actual platform version and parameter names in the project chat, without real passwords. The Agent generates README, declarations and necessary source/runtime files, then saves a draft.
2. Open AI Hub → Development and publication, load/import the generated draft or your directory/files, review content and choose the exact source/version. Drafts can be edited/deleted; deletion does not delete remote packages.
3. Build and test in an independent development workspace, then import compiled artifacts. The current page is a text-file editor, not an automatic dependency/build/binary-packaging system for arbitrary TypeScript/Python source.
4. The page validates paths, declarations, native entries, exact versions, source scope and content digests. Skill secrets, sensitive files, npm publication scripts and external publishConfig reject. Validation is not a code security review or MCP business integration test.
5. Confirm the same digest explicitly. Skill/Plugin publication writes an existing GitLab project and tags a fixed SHA; MCP publication targets an exact private npm version. GitLab projects are not created automatically; deployment Group/scope restrictions and account permissions apply.
6. Synchronize the source and confirm the corresponding Hub version/SHA, then install that version, configure parameters, verify tool calls and add it to personal roles/teams. This uses normal installation, not automatic generated-code execution when publication succeeds.

The workflow therefore covers creation—review—publication—discovery—installation—use, not automatic build—business testing—production deployment. Complex MCP delivery belongs in the repository's GitLab CI/artifact pipeline, while the desktop consumes built artifacts. Removing user confirmation does not substitute for missing test infrastructure.

-----

<a id="acceptance"></a>
## Acceptance and failure recovery

Record exact IDs/package versions/SHAs/manifestChecksum, not only successful downloads. Source changes need focused type checks and tests; published artifacts need actual desktop installation-chain checks. Receipts omit tokens, business data and authentication headers.

| Stage | Required record | Unsupported conclusion |
|---|---|---|
| Declaration validation | Actual name/bin/binding/field constraints | Protocol or account already works |
| Local integration | Official Loader, MCP handshake, tools/list, minimal read-only call | Actual intranet ACL passed |
| Lifecycle | Configure/reload/update/rollback/disable/remove and tool cleanup | Arbitrary third-party code is sandboxed |
| Permissions | Wrong account rejected, two projects isolated, execution denied by roles | Roles replace server permissions |
| Offline artifacts | Dependency/native/browser mirrors, no-public-network cold start | Source tests equal a signed installer |
| Author publication | Digest confirmation, source write, Hub discovery and subsequent install/use | Valid declarations mean generated code is safe |

`source-partial` preserves the GitLab commit SHA when commit succeeded but tag creation failed; verify next steps rather than automatically resubmitting all files. `published-not-indexed` means source publication succeeded but Hub sync/discovery did not; repair/synchronize the index without republishing the same npm version. Unknown network-write outcomes also stop for remote inspection instead of silent retries. Preserve existing user configuration and installation receipts.

Tool-list changes can invalidate old role-denial lists, so review role configuration when capabilities update; authors own stable native tool names. Public/secret key renames, platform dependency changes and Bundle restart requirements need upgrade guidance. CodeGraph/Wiki/GitLab MCP without supplied source, real browsers and private publication links remain intranet acceptance items, not completed tests.

## Dev Note

None. Unexecuted intranet operations belong in the handoff checklist, not completion claims in this reference.
