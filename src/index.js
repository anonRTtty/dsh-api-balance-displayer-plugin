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
// The host never returns display text: every failure is a machine-readable
// `code` (plus an optional `status`), and the browser half localizes it to the
// user's DSH UI language (zh / en).

export const name = 'dsh-plugin-balance'

export const inject = ['webServer', 'credentials']

/** Route path: exact match, distinct from every built-in /api/<method> route. */
export const BALANCE_ROUTE = '/api/plugin.balance'

/** Public DeepSeek balance endpoint (no token charge). */
const BALANCE_URL = 'https://api.deepseek.com/user/balance'

/** Upper bound for the balance request. */
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

/**
 * Resolve the current balance. Never throws: every failure becomes
 * `{ ok: false, code }` (machine-readable; the browser localizes the text).
 */
async function fetchBalance(ctx) {
  if (!ctx.credentials) {
    return { ok: false, code: 'missing-service' }
  }

  let hit
  try {
    hit = await ctx.credentials.resolve('DEEPSEEK_API_KEY')
  } catch (error) {
    return { ok: false, code: 'read-key-failed' }
  }
  if (!hit || !hit.value) {
    return { ok: false, code: 'no-key' }
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
    return { ok: false, code: timedOut ? 'timeout' : 'network' }
  }

  if (response.status !== 200) {
    let code = 'http'
    if (response.status === 401) code = 'bad-key'
    else if (response.status === 403) code = 'forbidden'
    else if (response.status === 429) code = 'rate-limited'
    else if (response.status >= 500) code = 'server'
    return { ok: false, code, status: response.status }
  }

  let data
  try {
    data = await response.json()
  } catch (error) {
    return { ok: false, code: 'parse' }
  }

  const infos = data && Array.isArray(data.balance_infos) ? data.balance_infos : []
  const first = infos.find(
    (i) => i && (typeof i.total_balance === 'string' || typeof i.total_balance === 'number'),
  )
  if (!first) return { ok: false, code: 'parse' }

  const num = Number(first.total_balance)
  if (!Number.isFinite(num)) return { ok: false, code: 'parse' }

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
            writeJson(res, 405, { ok: false, code: 'method', status: 405 })
            return
          }
          try {
            writeJson(res, 200, await fetchBalance(ctx))
          } catch (error) {
            ctx.logger.warn(`dsh-plugin-balance: ${String(error)}`)
            writeJson(res, 500, { ok: false, code: 'failed', status: 500 })
          }
        },
      }),
    'dsh-plugin-balance: route',
  )
}
