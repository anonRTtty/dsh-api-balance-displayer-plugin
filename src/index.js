// Host half of dsh-plugin-balance.
//
// Registers one exact HTTP route on ctx.webServer — the official plugin
// extension point for adding routes to the dsh web server (exact routes win
// over prefix routes, so /api/plugin.balance never collides with the built-in
// RPC map). The browser half fetches this route, so the DeepSeek API key never
// leaves the host process.
//
// The key is resolved through the same credential seam the built-in
// deepseek adapter uses (credentials.resolve('DEEPSEEK_API_KEY'), i.e. the
// DEEPSEEK_API_KEY entry in ~/.dsh/.credentials.yaml), and the balance is read
// from the free GET https://api.deepseek.com/user/balance endpoint (the
// balance query consumes no tokens).
//
// The plugin body is a plain Cordis plugin loaded by the deployment
// composition, so it runs in the harness process with full Node access —
// global fetch is available and no subprocess/curl indirection is needed.

export const name = 'dsh-plugin-balance'

export const inject = ['webServer', 'credentials']

/** Route path: exact match, distinct from every built-in /api/<method> route. */
export const BALANCE_ROUTE = '/api/plugin.balance'

/** Public DeepSeek balance endpoint (no token charge). */
const BALANCE_URL = 'https://api.deepseek.com/user/balance'

/** Upper bound for the balance request, matching the previous curl --max-time. */
const TIMEOUT_MS = 10000

/** Maximal JSON response writer for node:http. */
function writeJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

/** Human-readable reason for a non-200 HTTP status, shown in the UI capsule. */
function reasonForHttp(status) {
  if (status === 401) return 'API Key 无效'
  if (status === 403) return '访问被拒绝'
  if (status === 429) return '请求过于频繁'
  if (status >= 500) return '服务器错误'
  return '请求失败（HTTP ' + status + '）'
}

/**
 * Resolve the current balance. Never throws: every failure becomes
 * `{ ok: false, reason }` so the browser can show the reason in the capsule.
 */
async function fetchBalance(ctx) {
  let hit
  try {
    hit = await ctx.credentials.resolve('DEEPSEEK_API_KEY')
  } catch (error) {
    return { ok: false, reason: '读取 API Key 失败' }
  }
  if (!hit || !hit.value) {
    return { ok: false, reason: '未配置 API Key' }
  }

  let response
  try {
    response = await fetch(BALANCE_URL, {
      headers: {
        accept: 'application/json',
        authorization: 'Bearer ' + hit.value,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    const timedOut =
      typeof error === 'object' && error !== null &&
      (error.name === 'TimeoutError' || error.name === 'AbortError')
    return { ok: false, reason: timedOut ? '请求超时' : '网络错误' }
  }

  if (response.status !== 200) {
    return { ok: false, reason: reasonForHttp(response.status) }
  }

  let data
  try {
    data = await response.json()
  } catch (error) {
    return { ok: false, reason: '数据解析失败' }
  }

  const infos = data && Array.isArray(data.balance_infos) ? data.balance_infos : []
  const first = infos.find(
    (i) => i && (typeof i.total_balance === 'string' || typeof i.total_balance === 'number'),
  )
  if (!first) return { ok: false, reason: '数据解析失败' }

  const num = Number(first.total_balance)
  if (!Number.isFinite(num)) return { ok: false, reason: '数据解析失败' }

  return {
    ok: true,
    balance: num.toFixed(2),
    currency: typeof first.currency === 'string' ? first.currency : '',
  }
}

/**
 * Host plugin body: register the balance route for the lifetime of this
 * plugin. The register() disposer is wired through ctx.effect so plugin
 * unload (disable/uninstall) removes the route, matching every official
 * webServer registrant.
 */
export function apply(ctx) {
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: BALANCE_ROUTE,
        handler: async (req, res) => {
          if (req.method !== 'GET') {
            writeJson(res, 405, { ok: false, reason: 'method-not-allowed' })
            return
          }
          try {
            writeJson(res, 200, await fetchBalance(ctx))
          } catch (error) {
            ctx.logger.warn(`dsh-plugin-balance: ${String(error)}`)
            writeJson(res, 500, { ok: false, reason: '请求失败' })
          }
        },
      }),
    'dsh-plugin-balance: route',
  )
}
