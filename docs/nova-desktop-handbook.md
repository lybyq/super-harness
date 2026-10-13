---
description: "Harness Desktop manual index: intranet development, offline transfer, roles, capability configuration, plugin development and Windows installers."
---

# Harness Desktop handbook index

English | [中文](nova-desktop-handbook.zh.md)

## Start here

This is the entry point for the enterprise desktop. `super-harness` contains the desktop and Agent workbench; `nova-harness` contains the intranet Hub service and shared installation libraries. Change UI, roles and desktop features in the former, and resource indexing, private-source synchronization or Hub APIs in the latter. Ordinary users install Desktop; they do not need either source checkout, pnpm or a database.

The daily path is: open a project → create a chat → install capabilities and configure their parameters in AI Hub → apply a role → start work in chat. A team runs multiple independent Agents; it is not another set of labels attached to one chat.

## Find the right manual

Each page has a specific purpose. You do not need to read every upstream document first.

| What you need to do | Which document to open |
|---|---|
| Context charts, recovery, health, notices, diagnostics and isolated environments | [Desktop operations](user/nova-desktop-operations.md) |
| Prepare dependencies outside, transfer an archive and install offline | [Offline development and delivery](cookbook/nova-offline-development.md) |
| Export original npm dependencies and publish the private registry | [Offline development and delivery](cookbook/nova-offline-development.md) |
| Develop locally inside, build, restart Desktop and make a Windows installer | [Offline development and delivery](cookbook/nova-offline-development.md) |
| Choose and use role combinations and teams | [Roles and teams tutorial](user/nova-roles.md) |
| Install, update, disable, remove and configure AI Hub capabilities | [Enterprise plugin usage](../apps/nova-enterprise/README.md) |
| Develop MCP, Skill, Plugin or Bundle resources, or publish Agent-created resources | [Capability development and publication](nova-capability-development.md) |
| Understand the twenty community modules and disabled defaults | [Community integration inventory](nova-community-integration.md) |
| Set deployment addresses, authentication, CA and source allowlists | [Intranet handoff and acceptance](nova-intranet-acceptance.md) |
| Understand Electron, NSIS, signing, installers and updates | [Official desktop reference](../apps/desktop/README.md) |
| Develop an official native module, tool or UI extension | [Extension cookbook](cookbook/extension-cookbook.md) |
| Follow upstream development, typing and testing | [Development guide](development.md) |
| Understand the removed catalog status contract when upgrading | [Catalog status upgrade guide](upgrade-guide/v0.2.1-alpha.2/nova-catalog-without-status/guide.md) |

## Work across the two repositories

Develop each change in the repository that owns it. Not every change requires editing both repositories.

| Change | Location | Follow-up |
|---|---|---|
| Desktop AI Hub, parameter UI, role teams and themes | `super-harness/apps/nova-enterprise` | Build affected artifacts and restart Desktop |
| Electron startup, bundled runtime and installer | `super-harness/apps/desktop` and `apps/desktop-host` | Desktop build and packaging tests |
| Hub catalog, GitLab/npm sources and role resolution | `nova-harness/apps/hub-api` and shared packages | Build and restart Hub, then verify its API |
| Downloading, version locking and shared installation | `nova-harness/packages/core`, `installer`, `contracts` | Build shared packages and regenerate desktop `lib/engine.js` |
| A business MCP | The MCP's own repository | Build a new version, publish internally, sync Hub and update the desktop instance |

The shared installer ships with Desktop. Users do not need a local `nova-harness` checkout. Regenerate the engine when installer logic changes. `NOVA_*` variables and `novaHarness` package metadata are existing protocol names; do not rename them just to change display branding.

## Enterprise deployment readiness

The code implements the main workbench capabilities: intranet Hub, exact-version installation and configuration, credential protection, role composition, teams, authoring/publication and offline themes. It can undergo full acceptance inside a controlled intranet. An external build does not qualify every company account, every MCP or the installer.

Before distributing to employees, the deployment owner must complete the [handoff checklist](nova-intranet-acceptance.md): real-source download, minimal read-only invocation, two-project credential isolation, denied role tools, real-model teams, clean-machine installation and cold start without public networking, update services and outbound traffic review. Unchecked items remain target-environment acceptance, not hidden claims of completion. Signing certificates and source credentials must come from the intranet.

Do not add plugins merely to inflate the feature list. Existing native tools handle project files, terminals, Git and tasks. Install business capabilities as needed: code graphs, Wiki, GitLab, Jira, YApi, databases, document conversion and browsers. Six local MCPs have adaptation material; actual CodeGraph, Wiki and GitLab MCP coordinates and authentication still require internal verification. Import compatible external artifacts or develop MCP/native Plugins for missing capabilities, then verify entrypoints, dependencies, configuration, permissions, licenses and a minimal invocation. A successful npm installation is not compatibility evidence.

Roles are not permission sandboxes. They restrict platform tool discovery and execution; server project ACLs, read-only database grants and operating-system permissions remain effective. An anonymous Hub does not require SSO or approval workflows, but does not make private npm publication anonymous. Trusted Host Plugins execute in the host process and require source review.

## Themes and ordinary-user entry points

Desktop initializes themes locally in `$DSH_HOME/skins`. Preview and apply them in the community skin center; official appearance settings control light/dark mode. The original six color-only themes remain; background themes also use bundled local assets only. Themes do not change the active selection, execution permissions, account settings or model capabilities.

Capabilities requiring parameters open the configuration page during installation. Users edit them under AI Hub → Installed → Details → Configuration. Parameter-free capabilities load after installation; users do not enter Hub addresses. Cached data during a Hub outage is not a complete offline marketplace: previously undownloaded artifacts still need an intranet source.

## Dev Note

The actual deployment owner records intranet acceptance. Target-machine instructions in this handbook do not substitute for signed-installer or production-business evidence.
