---
kind: upgrade-guide
description: "Harness Windows Desktop encrypts enterprise settings with current-user DPAPI instead of copying readable grants between users."
---

# Windows enterprise credential protection

English | [中文](guide.zh.md)

## Change

The Windows Desktop deployment patch defaults to `windows-dpapi` instead of plaintext enterprise grants. Capability parameters and conversation drafts become current-Windows-user ciphertext when read or written. Copying these records to another user or machine no longer supplies working credentials. Official sessions and other plugins' records are unchanged. Disabling protection does not make encrypted records readable.

## Migration

1. Keep an access-controlled backup of the original credential store for the original account. Do not distribute it with an offline installer or copy account secrets into a source repository.
2. Start the updated desktop under the same Windows account with `HARNESS_SECRET_PROTECTION=windows-dpapi`. Open each installed capability's configuration to migrate that record atomically. Unread old records are not traversed automatically; migrate each configured project separately.
3. Configure accounts again when deploying to another Windows identity. Transfer deployment declarations and artifacts, not encrypted per-user credentials. Encryption failure preserves the old record and blocks dependent work; investigate the account and DPAPI environment without disabling protection as a workaround.
4. Verify with `node --import tsx/esm --test apps/nova-enterprise/tests/credential-protection.test.ts` on Windows. The [package reference](../../../../apps/nova-enterprise/README.md) defines project isolation and stored-record scope.
