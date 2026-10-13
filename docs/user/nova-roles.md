---
description: "Use Harness role composition and independent role teams: templates, session injection, member models, task dependencies, worktrees and permission boundaries."
---

# Harness role composition and role teams

English | [中文](nova-roles.zh.md)

## Choose between two workflows

Role composition gives one chat several responsibilities; a role team creates independent agents that execute tasks separately. Configure a model, select a project and create a chat before opening the AI Hub role view. Hub must contain selectable base roles; deployment staff must populate an empty catalog rather than expect another plugin to create it.

| Your need | Choose | Actual behavior |
|---|---|---|
| One assistant follows frontend, testing or product requirements | Single-session role composition | Combines responsibilities and capabilities in one idle session |
| Frontend and testing work separately with their own models and results | Multi-agent role team | Creates member sessions with tasks and dependencies |
| Default roles do not fully fit your workflow | Custom template | Selects base roles, then adjusts capabilities and working instructions |

## 1. Apply a single-session composition

Start from an idle chat and follow these steps. Applying a role does not invoke a model immediately.

1. Open AI Hub → Roles, load and select base roles, such as frontend and testing.
2. Select “Resolve composition” and review capabilities, requirements and conflicts. This step only previews; it neither installs nor starts tasks.
3. Under “Custom roles and teams”, choose “Single-session role composition” and enter the template ID, name and responsibilities. Use a valid resource ID, such as lowercase letters, digits and hyphens.
4. Adjust added, removed, disabled and included optional capabilities using real Hub capability IDs separated by commas. Removing another capability's dependency can cause a conflict; the desktop does not ignore it.
5. Save the template, select the target session and apply roles and capabilities. Missing capabilities use the shared installation workflow; complete required account parameters on their configuration pages.
6. Send a task in that chat. The next message carries the new responsibilities into model context; installation does not prove Jira or Wiki business access.

Templates stay on this desktop and do not upload to Hub automatically. Manage Hub role records to share base roles with colleagues. Switching responsibilities does not erase chat history; create a new chat for substantially different roles to avoid mixing earlier context.

## 2. Start a role team

Team members can call models concurrently; confirm cost, credentials and project write access first. Teams execute independently rather than add more role instructions to one prompt.

1. Select participating base roles and choose “Multi-agent role team” in the template.
2. Set a member's provider and model together, or leave both unset to use the available default selection. You can set output-token and step limits and request an independent worktree.
3. Enter tasks in “Shared tasks and dependencies (JSON)”, or leave an empty array for the team task to drive work; this is currently a JSON editor, not a drag-and-drop workflow builder.
4. Save the template, select an idle target session, enter the required team task, start the role team and confirm.
5. Inspect members, dependencies, status and results in the official team panel and team-task/worktree inspector. If creation partially succeeds, inspect existing members before retrying.

This task graph assumes the real Hub role IDs are `frontend` and `tester`; replace them with your selected IDs. `member` identifies a role and `dependsOn` identifies tasks, not member sessions.

```json
[
  { "id": "implement", "subject": "实现页面", "description": "实现页面并自测，提交代码与说明", "member": "frontend", "dependsOn": [], "writeScopes": ["apps/web"] },
  { "id": "verify", "subject": "验收页面", "description": "等实现完成后检查功能和回归风险", "member": "tester", "dependsOn": ["implement"], "writeScopes": ["tests"] }
]
```

Missing dependencies, dependency cycles, unknown roles and invalid relative paths fail before creation. `writeScopes` is an advisory collaboration declaration, not an operating-system file ACL or sandbox. Harness tool permissions, project access and service-account authorization still enforce actual restrictions.

## 3. Review team code

Enable separate worktrees only when members need separate code changes. The project must be a Git repository with an existing commit; the desktop does not overwrite existing main-project changes automatically.

After a member finishes, inspect the team, select its worktree and review the result diff. Verify the commit and tests, then specify the commit to merge. The current workflow explicitly cherry-picks one commit; it does not combine every member's code automatically. Resolve conflicts through Git and do not equate task completion with merge completion.

## 4. How capabilities and permissions enter a session

Role resolution produces a capability set that uses the shared installation, version-check and configuration-validation workflow. MCP servers connect through the official MCP Client; skills register through the official Skill Provider; Host plugins load through the native plugin system. Role responsibilities enter the session through official Agent injection, not an Agent Loop modification or replacement of all system prompts.

| Situation | Where to act |
|---|---|
| Base roles exist but resolution conflicts | Adjust base-role capabilities and custom changes, then resolve again |
| A capability needs credentials or a URL | AI Hub → Installed → Details → Configuration |
| A service rejects configured credentials | Check Jira, Wiki or GitLab service authorization and addresses |
| A target session cannot accept roles | Wait for the active run, or create a chat and refresh the session list |
| Team startup fails | Check the default model, task text, team Provider and Git requirements |
| A role disables a tool | Adjust role capabilities without bypassing native permissions or business ACLs |

Role Access controls tool visibility and execution but cannot turn one trusted Host plugin process into a multi-tenant isolation container. Strong isolation requires controlled accounts, separate Hosts or operating-system accounts and sandbox deployment, not merely role names.

## Development and acceptance

Develop, verify and publish new business capabilities through the [capability development guide](../nova-capability-development.md), then reference real IDs in Hub roles. See the [offline development guide](../cookbook/nova-offline-development.md) for builds, restarts and intranet transfer. Verify a composed role calling a read-only tool, two members obeying dependencies and worktree review/merge against real intranet models before claiming those workflows are validated.

## Dev Note

Task graphs still use JSON. Intranet deployment staff verify actual role IDs, models, permissions and team costs. Saving configuration does not prove execution against a real model.
