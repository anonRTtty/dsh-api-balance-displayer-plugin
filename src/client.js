/**
 * dsh-plugin-balance — browser (client) half.
 *
 * Loaded by DSH's client module loader as a `window.__ModuleLoader__.load`
 * bundle. Registers one entry in the right-aligned Session Header utilities
 * list (`conversation.session.header.utilities`) — the same additive slot as
 * the built-in "Session log" button — with order -10 so it renders immediately
 * to the LEFT of that button:
 *
 *     [余额：12.34￥ ↻]  [Session log]        (zh UI)
 *     [Balance: 12.34￥ ↻]  [Session log]    (en UI)
 *
 * The capsule is styled with the same theme variables and geometry as the
 * Session log button (32px pill, 13px font, 18px radius), so the two sit
 * side by side without visual conflict.
 *
 * Localization: the label (余额/Balance), the loading text, and every error
 * reason follow the user's DSH UI language through the official locale
 * service (ctx.locale + the injected `t` seat). The host route returns
 * machine-readable `code`s; this bundle maps them to localized text.
 *
 * Behavior:
 *   - Fetches the balance from the host route `/api/plugin.balance` (the API
 *     key never reaches the browser).
 *   - Auto-refreshes once per page load only: an apply-scope `autoFetched`
 *     flag ensures switching sessions/views (which may remount the header)
 *     does not trigger another fetch; F5 re-runs apply and resets it.
 *   - The ↻ button refreshes on demand; the balance number is followed by ￥.
 *   - The slot is session-scoped, so the capsule hides on the blank hero
 *     page and appears when a session is open.
 */
window.__ModuleLoader__.load({
  id: "dsh-plugin-balance",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    let react = require("react");

    // ------------------------------------------------------------- styles
    const css =
      ".dsh-balance-header{display:inline-flex;align-items:center;gap:6px;height:32px;min-width:0;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.25));border-radius:18px;padding:6px 12px;font-family:var(--dsw-font-family,inherit);font-size:13px;font-weight:400;line-height:20px;color:var(--dsw-alias-label-primary,inherit);background:transparent;white-space:nowrap}" +
      ".dsh-balance-header-text{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".dsh-balance-header-refresh{flex:none;border:none;background:transparent;color:inherit;cursor:pointer;padding:0 2px;font-size:14px;line-height:1;border-radius:4px;font-family:inherit}" +
      ".dsh-balance-header-refresh:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.15))}" +
      ".dsh-balance-header-refresh:active{background:rgba(128,128,128,.28)}" +
      ".dsh-balance-header-refresh:disabled{opacity:.45;cursor:default}";
    const tagId = "dsh-plugin-balance/balance.css";
    if (
      typeof document !== "undefined" &&
      document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null
    ) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-plugin-balance";
      tag.dataset.pluginCss = tagId;
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    // ------------------------------------------------------------ locale
    const NS = "balance";

    /** Simplified Chinese dictionary (key-set source of truth). */
    const zh = {
      "label": "余额：",
      "loading": "余额：加载中…",
      "refresh": "刷新余额",
      "err.timeout": "请求超时",
      "err.network": "网络错误",
      "err.bad-key": "API Key 无效",
      "err.forbidden": "访问被拒绝",
      "err.rate-limited": "请求过于频繁",
      "err.server": "服务器错误",
      "err.http": "请求失败（HTTP {status}）",
      "err.parse": "数据解析失败",
      "err.no-key": "未配置 API Key",
      "err.missing-service": "运行时服务不可用",
      "err.read-key-failed": "读取 API Key 失败",
      "err.failed": "请求失败"
    };

    /** English dictionary, checked complete against the zh key set. */
    const en = {
      "label": "Balance: ",
      "loading": "Balance: Loading…",
      "refresh": "Refresh balance",
      "err.timeout": "Request timed out",
      "err.network": "Network error",
      "err.bad-key": "Invalid API key",
      "err.forbidden": "Access denied",
      "err.rate-limited": "Too many requests",
      "err.server": "Server error",
      "err.http": "Request failed (HTTP {status})",
      "err.parse": "Failed to parse response",
      "err.no-key": "No API key configured",
      "err.missing-service": "Runtime service unavailable",
      "err.read-key-failed": "Failed to read API key",
      "err.failed": "Request failed"
    };

    /** Host error code -> locale key. */
    const CODE_KEY = {
      "missing-service": "err.missing-service",
      "read-key-failed": "err.read-key-failed",
      "no-key": "err.no-key",
      "timeout": "err.timeout",
      "network": "err.network",
      "bad-key": "err.bad-key",
      "forbidden": "err.forbidden",
      "rate-limited": "err.rate-limited",
      "server": "err.server",
      "http": "err.http",
      "parse": "err.parse",
      "failed": "err.failed"
    };

    // -------------------------------------------------------------- capsule
    const BALANCE_ROUTE = "/api/plugin.balance";

    /**
     * Render the balance capsule. Display text is derived from raw state at
     * render time through the injected `t` seat, so switching the DSH UI
     * language re-localizes the capsule without a refetch.
     */
    function BalanceCapsule(props) {
      const t = props.t;
      const [state, setState] = react.useState({ kind: "loading" });
      const [busy, setBusy] = react.useState(false);
      const aliveRef = react.useState({ value: true })[0];

      const refresh = () => {
        if (busy) return;
        setBusy(true);
        setState({ kind: "loading" });
        fetch(BALANCE_ROUTE, {
          method: "GET",
          headers: { accept: "application/json" },
          cache: "no-store",
        })
          .then((res) => res.json().catch(() => null))
          .then((res) => {
            if (!aliveRef.value) return;
            if (res && res.ok) {
              setState({ kind: "ok", balance: String(res.balance) });
            } else if (res && res.code) {
              setState({ kind: "error", code: res.code, status: res.status });
            } else {
              setState({ kind: "error", code: "failed" });
            }
          })
          .catch(() => {
            if (aliveRef.value) setState({ kind: "error", code: "failed" });
          })
          .finally(() => {
            if (aliveRef.value) setBusy(false);
          });
      };

      // Only the first mount after page load auto-fetches; later remounts
      // (e.g. switching sessions) do not re-fetch automatically.
      react.useEffect(() => {
        aliveRef.value = true;
        if (!autoFetched) {
          autoFetched = true;
          refresh();
        }
        return () => {
          aliveRef.value = false;
        };
      }, []);

      let text;
      if (state.kind === "loading") {
        text = t("loading");
      } else if (state.kind === "ok") {
        text = t("label") + state.balance + "\uFFE5";
      } else {
        const key = CODE_KEY[state.code] || "err.failed";
        const params = state.status ? { status: state.status } : undefined;
        text = t("label") + t(key, params);
      }

      return react.createElement(
        "div",
        { className: "dsh-balance-header", title: text },
        react.createElement("span", { className: "dsh-balance-header-text" }, text),
        react.createElement(
          "button",
          {
            type: "button",
            className: "dsh-balance-header-refresh",
            "aria-label": t("refresh"),
            title: t("refresh"),
            onClick: refresh,
            disabled: busy,
          },
          "\u21BB",
        ),
      );
    }

    // ------------------------------------------------------------ plugin body
    /** Services required by the client plugin. */
    const inject = ["slots", "locale"];

    /** Once per page load; reset by F5 because apply re-runs on every load. */
    let autoFetched = false;

    /**
     * Client plugin body: register the dictionaries and the header capsule.
     */
    function apply(ctx) {
      ctx.effect(
        () => ctx.locale.register(NS, { zh, en }),
        "dsh-plugin-balance: dictionaries",
      );
      ctx.slots.inject("conversation.session.header.utilities", () =>
        ctx.slots.register(
          {
            name: "conversation.session.header.utilities",
            id: "deepseek-balance",
            order: -10,
            locale: NS,
          },
          BalanceCapsule,
        ),
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
