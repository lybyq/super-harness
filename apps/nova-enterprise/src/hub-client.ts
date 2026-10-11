/** Host 侧 Nova Hub HTTP 访问层；只验证传输，调用方必须继续校验领域文档。 */

/** 稳定传输错误：不携带服务端正文、请求体、访问令牌或底层异常消息。 */
export class HubError extends Error {
  readonly code: string
  readonly status: number | undefined
  /**
   * @param code 可供界面本地化和日志定位的稳定错误码。
   * @param status 收到响应时的 HTTP 状态码；无响应时省略。
   */
  constructor(code: string, status?: number) {
    super(code)
    this.name = 'HubError'
    this.code = code
    this.status = status
  }
}

/**
 * 在桌面 Host 中访问管理员指定的 Hub，认证方式显式选择，避免 Renderer 和模型持有令牌。
 * 请求不跟随重定向、不重试写操作；返回 JSON 仍是不可信文档，不代表安装授权。
 */
export class HubClient {
  #base: URL
  #options: HubClientOptions

  /**
   * timeoutMs: number, maxResponseBytes: number, allowInsecureHttp?: boolean, authentication?: 'none'|'bearer',
   * fetch?: typeof globalThis.fetch }} options 部署限制和 Host 凭据读取函数；fetch 仅用于可控测试。
   * @param options 部署限制和 Host 凭据读取函数；fetch 仅用于可控测试。
   * @throws 协议、URL 内凭据或资源预算不合法时拒绝构造。
   */
  constructor(options: HubClientOptions) {
    let base
    try {
      base = new URL(options.apiBaseUrl)
    } catch (_error) {
      throw new HubError('HUB_CONFIG_INVALID')
    }
    if (
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      !/\/api\/v1\/?$/.test(base.pathname) ||
      !['none', 'bearer'].includes(options.authentication ?? 'bearer') ||
      !(base.protocol === 'https:' || (base.protocol === 'http:' && options.allowInsecureHttp === true)) ||
      !Number.isSafeInteger(options.timeoutMs) ||
      options.timeoutMs < 1 ||
      !Number.isSafeInteger(options.maxResponseBytes) ||
      options.maxResponseBytes < 1
    ) {
      throw new HubError('HUB_CONFIG_INVALID')
    }
    base.pathname = `${base.pathname.replace(/\/+$/, '')}/`
    this.#base = base
    this.#options = {
      ...options,
      authentication: options.authentication ?? 'bearer',
    }
  }

  /**
   * runtime?: string, page?: number, pageSize?: number }} query 现有 Hub 支持的搜索和分页条件。
   * @param query 现有 Hub 支持的搜索和分页条件。
   * @param [signal] 调用方取消信号。
   * @returns 原始目录 JSON，必须在展示或使用前逐字段校验。
   */
  search(query: SearchQuery = {}, signal?: AbortSignal) {
    const params = new URLSearchParams()
    const keys = ['q', 'type', 'role', 'tag', 'runtime', 'page', 'pageSize'] as const
    for (const key of keys) {
      if (query[key] !== undefined) params.set(key, String(query[key]))
    }
    return this.#request('GET', `catalog/search?${params}`, undefined, signal)
  }

  /**
   * @param id 当前 Hub 的稳定能力标识，拼接路径前会校验格式。
   * @param [signal] 调用方取消信号。
   * @returns 原始能力 JSON；不是安装或执行授权。
   */
  capability(id: string, signal?: AbortSignal) {
    if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(id)) throw new HubError('HUB_CAPABILITY_ID_INVALID')
    return this.#request('GET', `capabilities/${encodeURIComponent(id)}`, undefined, signal)
  }

  /** @param id 精确能力标识。 @param [signal] 取消信号。 @returns Hub 默认 README；仍须领域准入。 */
  readme(id: string, signal?: AbortSignal) {
    if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(id)) throw new HubError('HUB_CAPABILITY_ID_INVALID')
    return this.#request('GET', `capabilities/${encodeURIComponent(id)}/readme`, undefined, signal)
  }

  /**
   * 读取角色列表；当前 Hub 返回数据库角色行及最新版本，不是裸 RoleProfile 数组。
   * @param [signal] 调用方取消信号。
   * @returns 原始角色列表，发布状态须由调用方检查。
   */
  roles(signal?: AbortSignal) {
    return this.#request('GET', 'roles?view=published', undefined, signal)
  }

  /**
   * 请求角色能力解析；必须明确指定 deepseek-harness，不能沿用 Hub 的 claude-code 默认值。
   * @param request 不含明文密钥的解析输入。
   * @param [signal] 调用方取消信号。
   * @returns 原始期望状态；兼容校验、工具运行权限和执行归调用方负责。
   */
  resolve(request: ResolveRequest, signal?: AbortSignal) {
    if (!request.runtime || !request.role) throw new HubError('HUB_RESOLVE_INPUT_INVALID')
    return this.#request('POST', 'resolve', request, signal)
  }

  /** @param id 部署允许的来源标识。 @returns 发布后显式同步结果；不重试写请求。 */
  syncSource(id: string) {
    if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(id)) throw new HubError('HUB_CAPABILITY_ID_INVALID')
    return this.#request('POST', `sync/source/${encodeURIComponent(id)}`, {}, undefined)
  }

  /**
   * 执行有限时、有响应字节上限的请求；令牌只在请求头内发送，并禁止重定向泄漏凭据。
   * @param method 当前 Hub 接口允许的请求方法。
   * @param path 仅由本类内部构造的相对 API 路径。
   * @param payload JSON 请求体；读取时为 undefined，不得包含明文能力密钥。
   * @param signal 调用方取消信号。
   * @returns 有大小上限的 JSON；不隐含领域校验或可执行性。
   */
  async #request(
    method: 'GET' | 'POST',
    path: string,
    payload: unknown,
    signal: AbortSignal | undefined,
  ): Promise<unknown> {
    if (signal?.aborted) throw new HubError('HUB_CANCELLED')
    let token
    if (this.#options.authentication === 'bearer') {
      try {
        token = await this.#options.getAccessToken()
      } catch (_error) {
        throw new HubError('HUB_CREDENTIAL_UNAVAILABLE')
      }
      if (!token) throw new HubError('HUB_AUTH_REQUIRED')
      if (typeof token !== 'string' || token.length > 16384 || /[\r\n]/.test(token))
        throw new HubError('HUB_CREDENTIAL_UNAVAILABLE')
    }
    const timeout = AbortSignal.timeout(this.#options.timeoutMs)
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout
    try {
      const response = await (this.#options.fetch ?? globalThis.fetch)(new URL(path, this.#base), {
        method,
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
        redirect: 'error',
        signal: requestSignal,
      })
      if (!response.ok) {
        if (response.body) await response.body.cancel()
        throw new HubError('HUB_HTTP_ERROR', response.status)
      }
      if (!response.body) throw new HubError('HUB_RESPONSE_INVALID')
      const reader = response.body.getReader()
      const chunks = []
      let bytes = 0
      try {
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) break
          bytes += chunk.value.byteLength
          if (bytes > this.#options.maxResponseBytes) {
            await reader.cancel()
            throw new HubError('HUB_RESPONSE_TOO_LARGE')
          }
          chunks.push(chunk.value)
        }
      } finally {
        reader.releaseLock()
      }
      let document: unknown
      try {
        document = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch (_error) {
        throw new HubError('HUB_RESPONSE_INVALID')
      }
      return document
    } catch (error) {
      if (error instanceof HubError) throw error
      if (signal?.aborted) throw new HubError('HUB_CANCELLED')
      if (timeout.aborted) throw new HubError('HUB_TIMEOUT')
      throw new HubError('HUB_UNAVAILABLE')
    }
  }
}

/** 只读搜索条件，与 Hub API 支持的字段保持一致。 */
export interface SearchQuery {
  q?: string
  type?: string
  role?: string
  tag?: string
  runtime?: string
  page?: number
  pageSize?: number
}
/** 不携带密钥的角色解析请求。 */
export interface ResolveRequest {
  runtime: string
  role: string
  [key: string]: unknown
}
/** Host 传输限制和凭据读取器；fetch 仅用于隔离测试。 */
export interface HubClientOptions {
  apiBaseUrl: string
  getAccessToken(): Promise<string | undefined>
  timeoutMs: number
  maxResponseBytes: number
  allowInsecureHttp?: boolean
  authentication?: 'none' | 'bearer'
  fetch?: typeof globalThis.fetch
}
