# Nova community integration inventory

English | [中文](nova-community-integration.zh.md)

## Release evidence

The verified published community cohort is [dsh-web v0.4.5](https://github.com/zhu1090093659/dsh-web/releases/tag/v0.4.5), published on 2026-10-05. This inventory uses its published package declarations, defaults, and [aggregate manifest](https://github.com/zhu1090093659/dsh-web/blob/v0.4.5/packages/dsh-web-all/aggregate.yml), not an unpinned development branch or old screenshots.

Nova retains the official source baseline in [upstream.json](../nova/upstream.json) and integrates community packages as reviewed dependencies and patches. The cohort declares support for the official 0.2.0-rc.2 generation and later; that declaration does not qualify every feature against Nova's pinned 0.2.1-alpha.2 baseline.

## Complete dependency inventory

All package names below have the scope `@linxin666/` and are pinned to **0.4.5** in [nova-community.ts](../apps/desktop/src/nova-community.ts). There are **20 packages: one aggregate and 19 modules**, not merely the previously highlighted UI extensions. Included in the dependency closure, enabled in configuration, mounted successfully, and behaviorally qualified are different states.

| Package suffix | Capability | Nova default |
|---|---|---|
| dsh-web-all | Aggregate bundle, defaults, and module switches | Enabled |
| dsh-client-ui-plugin-manager | Community plugin management | Enabled |
| dsh-client-ui-market | Public marketplace | Disabled by Nova |
| dsh-client-ui-task-board | Kanban tasks and execution integration | Enabled |
| dsh-client-ui-task-board-github | GitHub Issues provider and controlled write-back | Disabled by Nova |
| dsh-client-ui-git-graph | Git history and graph | Enabled |
| dsh-remote-web-ui | Remote Web access | Disabled by Nova |
| dsh-update | Community updater | Disabled by Nova |
| dsh-ssh | SSH capability | Disabled upstream |
| dsh-liangshen | Liangshen agent preset and supporting behavior | Disabled upstream |
| dsh-client-ui-skill-explorer | Skill browsing | Disabled upstream |
| dsh-usage | Usage and historical views | Enabled |
| dsh-session-archive | Session archiving | Enabled |
| dsh-client-ui-model-capabilities | Model capability settings | Enabled |
| dsh-client-ui-web-ui-settings | Extended UI settings | Enabled |
| dsh-i18n | Community localization | Enabled |
| dsh-client-ui-community-plugins | Public workshop index | Disabled by Nova |
| dsh-client-ui-preset-center | Preset center | Enabled |
| dsh-client-ui-skin-center | Theme center | Enabled |
| dsh-pet | Desktop pet | Enabled |

The preset, theme, pet, and workshop modules also have separate community repositories; they are dependencies of the selected aggregate, not an unrelated second desktop fork. Their remote catalog entries and downloadable assets are not automatically vendored by an npm version pin.

## More than cosmetic extensions

The selected release adds task-board provider integration, execution acceptance gates, controlled issue write-back, labels and workflow movement; it also extends historical usage inspection and batch plugin updates. These are community enhancements around the official base, not replacements for the Agent Loop.

Liangshen is an optional agent preset with runtime-oriented additions, including namespaced MCP discovery/pagination, loop/stall handling, and persistent fact registration. It is not just a character prompt. Keep it separate from Nova enterprise roles and qualify it before enabling; no performance advantage is assumed.

SSH and remote Web expose additional execution or network surfaces. Enabling their UI is not an enterprise access policy. Intranet equivalents must preserve authentication, scoped credentials, auditing, and explicit deployment approval.

## Workshop plugins and obsolete exports

The public workshop can list third-party plugins that are not aggregate dependencies. Do not promise that every workshop entry has been integrated or is compatible.

- The current aggregate excludes `dsh-better-sidebar@0.19.1` because its peer SDK range targets the older official 0.1.5-rc.1 generation rather than the current cohort.
- It excludes `@mlgbnb/dsh-archive-manager@1.0.7` because its imports use removed APIs. This is distinct from the included session-archive module.
- Compatibility exports such as desktop-launcher, dsh-perf, describe-image, and doctor are empty tombstones, not functioning enhancements. Separate satellite modules also retain old compatibility paths; import-path existence does not prove a feature is present.

For a requested third-party feature, inspect its license, exact SDK imports, version, network behavior, and assets. Port removed API usage to the official extension points or maintain a reviewed local fork. Do not force an obsolete plugin into the new SDK by weakening dependency checks.

## Intranet inclusion and policy

Nova's [deployment defaults](../apps/desktop-host/nova.enterprise.patch.yml) disable the five public-facing modules listed above. Eight of the nineteen modules are disabled in total, including three upstream defaults. Disabled packages remain included; they are not deleted from the repository dependency closure.

Reviewed dependency patches remove automatic public usage heartbeats from twelve client artifacts. Aggregate state failures leave child UIs closed. [Runtime patch policy](../apps/desktop/scripts/runtime-patch-policy.ts) applies the same patch bytes during packaging and verifies their lockfile hashes. These are scoped changes, not a general outbound firewall; official account, analytics, update services, remote assets, and manual external links still require review.

Bring the materialized desktop runtime, its pinned npm dependency closure, primary-runtime payload, approved assets, licenses, and notices into the intranet. Do not rely on end-user startup downloading public packages. The private Nova plugin has an explicit desktop packing step and required-file checks; disconnected installation and signed packaging remain unqualified.

## Nova feature boundary

The [Nova enterprise plugin](../apps/nova-enterprise/README.md) connects the desktop to deployment-owned intranet sources. Its package reference owns installation, configuration, role composition, publication, and qualification boundaries; the community inventory does not duplicate those contracts.

Private npm packages must be installed by exact package identity, version, declared bin, and integrity. GitLab resources need an immutable commit/archive and checksum. The Hub token, source download token, and MCP service account are separate credentials. Existing Claude plugin manifests are not automatically Cordis plugins. These remaining execution adapters must use official Skill, MCP, Plugin, Preset, and permission extension points.

## Verification status

The existing desktop preview mounted the Nova AI Hub and community aggregate through the real official Host and Client. Nova HTTP, form, credential-isolation, role-admission, and built-client tests use local fixtures. Package-selection and orchestration tests verify inclusion rules without producing an installer. No assertion here means that every community module, real private download, or offline launch has passed end-to-end qualification.
