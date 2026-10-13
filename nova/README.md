# Nova enterprise development

English | [中文](README.zh.md)

## Summary

Start with the [Desktop handbook](../docs/nova-desktop-handbook.md) for daily development, intranet transfer and role/team workflows.

This directory contains Nova-owned enterprise integration code. The desktop application remains in the official [Electron application](../apps/desktop/README.md); the existing Nova Hub remains a separate service. [upstream.json](upstream.json) pins the official source baseline. Credentials and deployment-specific intranet addresses do not belong in this public repository.

## Hub transport

[HubClient](hub-client.mjs) calls the existing Hub catalog search, capability, roles, and resolve endpoints. Supply the complete API base URL, including `/api/v1`, a host-owned credential reader, network timeout, and response byte limit. HTTPS is required unless the deployment explicitly permits HTTP. Credential lookup precedes the network timeout; its provider owns lookup cancellation and its own time budget.

The client sends bearer credentials only in the authorization header, refuses redirects, bounds response bytes, and never automatically retries operations. It reports stable error codes and HTTP status without copying remote response text or underlying credential/network errors. Resolve requests require an explicit runtime so the Hub cannot silently select its existing default runtime.

Successful JSON responses remain untrusted domain documents. A consumer must validate capabilities, role versions, configuration declarations, integrity metadata, and execution policy before installing or activating anything. This module is an HTTP library, not a Cordis plugin, installer, permission executor, or desktop UI; it does not connect itself to the desktop. The tests use local HTTP fixtures, not the intranet Hub.

The [Nova enterprise plugin](../apps/nova-enterprise/README.md) owns the desktop **AI Hub**, intranet capability lifecycle, configuration, roles, and resource publication. Its package reference defines the current behavior and qualification boundaries. Business sources use TypeScript with Chinese JSDoc; production loads compiled artifacts.

## Community desktop composition

The Desktop Host carries `@linxin666/dsh-web-all@0.4.5` as a production dependency. [Desktop composition](../apps/desktop/src/nova-community.ts) selects the official base and Web bundles, the published community bundle, and the Host's [intranet defaults](../apps/desktop-host/nova.enterprise.patch.yml), in that order. The workspace and production preparation pin every community family to the same release. No agent-loop, session format, MCP protocol, or ordinary CLI profile is changed.

The desktop launches through the official profile API with the Desktop Host's package manifest as its installation anchor. This keeps the community aggregate's own plugin exports in the installation dependency graph; loading its Bundle patch through a CLI-only anchor is insufficient.

The selected community release includes task boards, Git graphs, usage views, session archives, model-capability settings, presets, themes, pets, and plugin settings. Its own defaults leave SSH, Liangshen, and the skill explorer disabled. Nova additionally disables the public marketplace, public community catalog, remote-Web tunnel, community updater, and GitHub task-board integration. Disabled packages remain in the dependency closure; a configuration override can enable them after qualification. These defaults are not a firewall or an enterprise authorization policy.

See the [complete community inventory](../docs/nova-community-integration.md) for all twenty pinned packages, separate workshop entries, obsolete SDK plugins, and offline-asset boundaries. The private Nova plugin is explicitly packed beside the Desktop Host, and package-set preparation refuses missing Host or Client files; this does not qualify a signed offline installer.

New desktop profiles select the community layers without running a package manager. Existing profiles and user patches are preserved; an existing official-only profile does not automatically acquire the new layers. Native recovery removes community layers and retains the official base and Web bundles; subsequent launches do not re-enable the removed layers. The separate enterprise plugin provides internal AI Hub and role teams; the community public marketplace remains disabled.

The development launchers below skip the existing build. The official comparison uses a separate default home and Electron user-data directory. Explicit `DSH_HOME` settings remain authoritative, and launchers do not replace an existing profile. On a fresh machine, the upstream launcher still downloads Electron and prepares its locked Node/Python/Office payload before opening the window.

```sh
pnpm run start:desktop:official
pnpm run start:desktop
```

Production preparation includes community npm dependencies in the materialized runtime, rather than installing them on the end user's first launch. An intranet handoff requires that materialized runtime and the primary-runtime payload, not just source files or a root lockfile. The current checkout has profile-composition, package-content rejection, recovery, and typecheck evidence; GUI rendering, every community feature, and a disconnected packaged launch require separate qualification. The upstream Electron updater, account services, and analytics also require a deployment-specific outbound-network review.

Community code remains an independently versioned Apache-2.0 dependency from [dsh-web](https://github.com/zhu1090093659/dsh-web), while the official Harness remains MIT. Keep upstream licenses and any applicable notices in the delivered artifacts. Package version pins and dependency integrity metadata do not replace a security review of plugin execution or its transitive dependencies.

Nova's reviewed dependency patches disable automatic public usage heartbeats in twelve published client artifacts. The aggregate client also leaves its child UIs disabled and logs an actionable error when the Host's row-state route cannot answer; it does not mount all children as a fallback. [Production patch selection](../apps/desktop/scripts/runtime-patch-policy.ts) carries the same patch bytes into the packaged dependency tree and checks their hashes against the workspace lockfile. These changes do not block every outbound connection, disable upstream analytics, or authorize enabled tools.

## Verification

Run from the repository root:

```sh
npm run test:nova
node --check nova/hub-client.mjs
```

The tests exercise real local HTTP requests and resource cleanup without production credentials. They do not qualify the desktop build, community plugins, or private npm/GitLab downloads.
