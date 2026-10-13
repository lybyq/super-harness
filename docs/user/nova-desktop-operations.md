# Nova Desktop operations

English | [中文](nova-desktop-operations.zh.md)

## Summary

Inspect context usage, receive background turn notices, export local diagnostic metadata, and switch isolated desktop environments. Session recovery uses official persistence checkpoints; it never automatically replays tool side effects or rolls back project files.

## Table of Contents

- [Context insights](#context-insights)
- [Recovery and health](#recovery-and-health)
- [Notifications and diagnostics](#notifications-and-diagnostics)
- [Desktop environments](#desktop-environments)
- [Proxy configuration](#proxy-configuration)
- [Intranet verification](#intranet-verification)
- [Dev Note](#dev-note)

## Context insights

<a id="context-insights"></a>

`dsh-context@0.69.1` ships with the desktop Host. Open **Context Insights** in the sidebar, **Context / Fleet** in a chat, or `/context`. Preferences controls placement, charts and optional prompt prefix/suffix; both prompt additions default to empty. Charts use local session projections and a bundled pricing catalog. Public list-price estimates are not your internal billing.

Nova's reviewed patch returns unavailable from the plugin's balance endpoint without resolving credentials or sending balance requests. This does not disable official account, analytics or update traffic. Qualify those services separately with your internal model deployment.

Existing Nova compositions receive the Context bundle once without replacing plugins or patches. Later deliberate removal remains respected. Official-only recovery and custom compositions are unchanged. The version and patch digest belong to the lockfile and desktop runtime; users do not install from public npm at startup. Preserve the Apache-2.0 license and bundled notices.

## Recovery and health

<a id="recovery-and-health"></a>

Official request/tool checkpoints persist logged input before a model request or top-level tool dispatch. After a crash, reopen the chat and continue explicitly. Interrupted remote actions may already have happened; check Jira, GitLab or other target systems before retrying. No recovery operation reverses external writes or restores project files.

After Host readiness, the desktop sends non-overlapping health probes every 30 seconds. A probe times out after 15 seconds; three consecutive misses enter native recovery and stop the affected Host. Restart is explicit, not a replay. A responsive IPC event loop does not prove that a model, MCP or individual tool is healthy.

Deployment variables `NOVA_DESKTOP_HEALTH_INTERVAL_MS`, `NOVA_DESKTOP_HEALTH_TIMEOUT_MS` and `NOVA_DESKTOP_HEALTH_MISS_LIMIT` change these values. `NOVA_DESKTOP_HEALTH_ENABLED=false` disables supervision. Numeric values must be positive integers at most 3600000; invalid configuration stops startup.

## Notifications and diagnostics

<a id="notifications-and-diagnostics"></a>

A live top-level turn ending while the desktop is in the background produces a silent native notification. Completed and stopped/error/blocked turns have different generic messages, with no prompt, response, tool output or session title. Child agents and restored historical endings do not notify. Clicking returns to the desktop without retrying work. `NOVA_DESKTOP_TURN_NOTIFICATIONS=false` disables notices; Windows may also suppress them.

On Windows, right-click the tray icon and choose **Export Diagnostic ZIP…**; the application menu provides the same action. Choose a new file: existing files are not overwritten. The ZIP contains version metadata, Host/update phase, watchdog settings, sanitized plugin coordinates and log file count/size. It excludes raw logs, conversations, environment values, URLs, credentials and source files. Export never uploads. A specific exception may still require an administrator-reviewed, separately redacted crash report.

## Desktop environments

<a id="desktop-environments"></a>

On Windows, open the tray's **Environments / Profiles → Add environment…**. Choose an empty non-root folder on a drive with space. Nova registers separate `harness-home` and `electron-user-data` children. The original environment remains the default; old credentials, conversations and plugins are not copied.

Select a registered environment in the same submenu. Nova locks new request admission, checks active work, asks before interruption, waits for clean Host shutdown, remembers the selection, and relaunches. Cancellation leaves the original environment active; failed shutdown refuses switching. New environments require their own model/account configuration. Roles apply inside a chat, not to desktop environments.

The catalog stays in the original Electron userData's `desktop/profiles.json`. Data directories must be absolute, mutually non-overlapping and not filesystem roots; directory aliases are resolved before comparison. Windows has the Profile tray entry; macOS/Linux do not. Bundled runtime code is shared read-only; writable profiles, cookies and data are isolated. Deployment variables and explicitly shared agent skill directories remain shared unless deployment separates them.

## Proxy configuration

<a id="proxy-configuration"></a>

The browser uses Electron/Chromium networking. The official Node launcher separately resolves `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY` and `NO_PROXY` from the layered launch environment and installs its shared HTTP dispatcher. Loopback stays direct. Put internal domain suffixes in `NO_PROXY`; the matcher does not support IP CIDR rules.

Windows system proxy/PAC settings are not automatically converted to Host environment variables. Browser proxy behavior is not complete Agent/MCP system-proxy support. Intranet-only deployments must clear unwanted proxy variables or supply an approved internal proxy and bypass list. MCP subprocesses or tools with their own network stack need their own settings. Do not disable TLS validation for corporate certificates.

## Intranet verification

<a id="intranet-verification"></a>

Verify Context charts with real internal-model turns, Windows notification policy, hung-Host recovery without duplicate external writes, switch cancellation and clean shutdown, ZIP privacy, and proxy/bypass routing to internal model/Hub/MCP services. Local build/tests do not qualify enterprise networks and policies.

After a lockfile change, refresh the portable store and original npm tarball inventory before transfer archives. Follow the [offline development guide](../cookbook/nova-offline-development.md); do not copy live account directories.

## Dev Note

<a id="dev-note"></a>

File rollback checkpoints and Windows PAC-to-Host synchronization are separate capabilities, not supplied by these recovery or environment features.
