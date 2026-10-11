---
kind: upgrade-guide
description: "Harness Windows Desktop 用当前用户 DPAPI 加密企业配置，不再通过复制可读 grant 记录迁移账号。"
---

# Windows 企业凭据保护

[English](guide.md) | 中文

## 变更

Windows Desktop 部署补丁默认 `windows-dpapi`，替代企业配置明文 grant。能力参数和会话草稿在读取或写入时成为当前 Windows 用户密文。复制这些记录到其他用户或机器不能提供可用凭据。官方会话及其他插件记录不变；关闭保护也不能读取已有密文。

## 迁移

1. 为原账号保留受访问控制的原凭据库备份；不能随离线安装器分发，也不能将账号秘密复制进源码仓库。
2. 使用同一 Windows 账号，以 `HARNESS_SECRET_PROTECTION=windows-dpapi` 启动更新后的桌面。打开每个已配置能力的参数页，原子迁移对应记录。未读取的旧记录不会自动遍历；各已配置项目需分别迁移。
3. 部署到不同 Windows 身份时重新配置账号。搬运部署声明和制品，不搬运用户密文。加密失败保留旧值并阻止后续操作，检查账号和 DPAPI 环境，不能关闭保护来绕过。
4. 在 Windows 执行 `node --import tsx/esm --test apps/nova-enterprise/tests/credential-protection.test.ts`。项目隔离和记录保护范围由 [包参考](../../../../apps/nova-enterprise/README.zh.md) 定义。
