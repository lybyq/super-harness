/** Host 专用团队创建参数；不向 Client 安全类型引入 Agent 与 Session 运行服务。 */
import type { AgentOptions } from '@deepseek-ai/dsh-agent'

declare module './types.ts' {
  /** Host 创建请求的额外选项，仅在团队服务入口装配。 */
  interface SpawnTeammateRequest {
    /** 成员独立模型参数；由官方 Subagent 准入并持久化，不修改 Agent Loop。 */
    readonly agentOptions?: AgentOptions
    /** 成员工作目录；官方 WorkingDirectory Provider 校验，未提供时继承父会话。 */
    readonly cwd?: string
  }
}
