---
kind: upgrade-guide
description: "Nova Hub capability summaries no longer expose or require publication status."
---

# Nova capability summaries omit publication status

English | [中文](guide.zh.md)

## Change

Nova's Host previously required each Hub capability to include a recognized status and returned it to clients. The Host now accepts status-free documents, ignores legacy status values, and omits status from capability summaries and configuration responses. Custom clients that read this field must change. Runtime bindings, configuration validation, credentials, and tool execution permissions remain unchanged. This does not enable capability installation.

## Migration

1. Update the Nova Hub server and desktop plugin together. Remove status-dependent filtering, badges, and query parameters from custom clients. Do not infer installation or permission from a legacy status.
2. Accept the status-free summary fields returned by `api/nova-hub/catalog` and configuration responses. Older Hub documents with status fields remain readable, but their status is not returned to the client.
3. Verify with `pnpm run test:nova`: the catalog tests accept status-free documents and omit legacy status values. Open AI Hub against the updated deployment and confirm catalog entries load without publication status.
