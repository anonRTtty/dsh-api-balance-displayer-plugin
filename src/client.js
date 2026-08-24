/**
 * dsh-plugin-balance — browser (client) half.
 *
 * Loaded by DSH's client module loader as a `window.__ModuleLoader__.load`
 * bundle. Registers one entry in the right-aligned Session Header utilities
 * list (`conversation.session.header.utilities`) — the same additive slot as
 * the built-in "Session log" button — with order -10 so it renders immediately
 * to the LEFT of that button:
 *
 *     [余额：12.34 ↻]  [Session log]
 *
 * The capsule is styled with the same theme variables and geometry as the
 * Session log button (32px pill, 13px font, 18px radius), so the two sit
 * side by side without visual conflict.
 *
 * Behavior:
 *   - Fetches the balance from the host route `/api/plugin.balance` (the API
 *     key never reaches the browser).
 *   - Auto-refreshes once per page load only: an apply-scope `autoFetched`
 *     flag ensures switching sessions/views (which may remount the header)
 *     does not trigger another fetch; F5 re-runs apply and resets it.
 *   - The ↻ button refreshes on demand; failures show the concrete reason
 *     in the capsule (e.g. 「余额：请求超时」).
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

    // -------------------------------------------------------------- capsule
    const BALANCE_ROUTE = "/api/plugin.balance";

    /**
     * Render the balance capsule. Reads nothing from props; all state is
     * local and all data comes from the host route.
     */
    function BalanceCapsule() {
      const [text, setText] = react.useState("余额：加载中…");
      const [busy, setBusy] = react.useState(false);
      const aliveRef = react.useState({ value: true })[0];

      const refresh = () => {
        if (busy) return;
        setBusy(true);
        setText("余额：加载中…");
        fetch(BALANCE_ROUTE, {
          method: "GET",
          headers: { accept: "application/json" },
          cache: "no-store",
        })
          .then((res) => res.json().catch(() => null))
          .then((res) => {
            if (!aliveRef.value) return;
            if (res && res.ok) setText("余额：" + res.balance);
            else setText("余额：" + ((res && res.reason) || "请求失败"));
          })
          .catch(() => {
            if (aliveRef.value) setText("余额：请求失败");
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

      return react.createElement(
        "div",
        { className: "dsh-balance-header", title: text },
        react.createElement("span", { className: "dsh-balance-header-text" }, text),
        react.createElement(
          "button",
          {
            type: "button",
            className: "dsh-balance-header-refresh",
            "aria-label": "刷新余额",
            title: "刷新余额",
            onClick: refresh,
            disabled: busy,
          },
          "\u21BB",
        ),
      );
    }

    // ------------------------------------------------------------ plugin body
    /** Services required by the client plugin. */
    const inject = ["slots"];

    /** Once per page load; reset by F5 because apply re-runs on every load. */
    let autoFetched = false;

    /**
     * Client plugin body: register the balance capsule in the Session Header
     * utilities list, next to the built-in "Session log" button.
     */
    function apply(ctx) {
      ctx.slots.inject("conversation.session.header.utilities", () =>
        ctx.slots.register(
          {
            name: "conversation.session.header.utilities",
            id: "deepseek-balance",
            order: -10,
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
