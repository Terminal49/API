/**
 * The MCP Apps view for show_container_dashboard
 * (ui://terminal49/container-dashboard.html).
 *
 * One self-contained HTML document with no external requests, so it needs no
 * CSP allowances. It speaks the MCP Apps postMessage protocol (JSON-RPC 2.0,
 * spec 2026-01-26) directly instead of bundling @modelcontextprotocol/ext-apps:
 * ui/initialize, tool-input and tool-result notifications, tools/call for
 * drill-downs, ui/message, ui/update-model-context, ui/open-link,
 * ui/request-display-mode and size-changed.
 *
 * The page source must not contain backticks or "${" because it lives in a
 * template literal; container-dashboard-view.test.ts enforces that.
 */

export const MCP_APP_MIME_TYPE = 'text/html;profile=mcp-app';

export const CONTAINER_DASHBOARD_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Terminal49 container dashboard</title>
<style>
:root {
  --bg: var(--color-background-primary, #ffffff);
  --bg2: var(--color-background-secondary, #f6f7f9);
  --fg: var(--color-text-primary, #14171f);
  --fg2: var(--color-text-secondary, #5b6372);
  --line: var(--color-border-primary, #e3e6eb);
  --accent: #2463eb;
  --accent-soft: rgba(36, 99, 235, 0.12);
  --ok: #1a8a4a;
  --warn: #b7791f;
  --bad: #d23c3c;
  --bad-soft: rgba(210, 60, 60, 0.12);
  --radius: var(--border-radius-md, 10px);
  --font: var(--font-sans, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  color-scheme: light dark;
}
html[data-theme="dark"] {
  --bg: var(--color-background-primary, #17191e);
  --bg2: var(--color-background-secondary, #1f2228);
  --fg: var(--color-text-primary, #eceef2);
  --fg2: var(--color-text-secondary, #9aa3b2);
  --line: var(--color-border-primary, #2e323a);
  --accent: #6b9bff;
  --accent-soft: rgba(107, 155, 255, 0.16);
  --ok: #4cc685;
  --warn: #e0a84a;
  --bad: #ff6b6b;
  --bad-soft: rgba(255, 107, 107, 0.15);
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--fg); font: 13px/1.45 var(--font); }
body { padding: 14px; position: relative; min-height: 100vh; }
button { font: inherit; color: inherit; }
.row { display: flex; gap: 10px; align-items: center; }
.spacer { flex: 1; }
.muted { color: var(--fg2); }
.small { font-size: 11.5px; }
header h1 { font-size: 16px; margin: 0; font-weight: 650; letter-spacing: -0.01em; }
.brand { width: 22px; height: 22px; border-radius: 6px; background: var(--accent); color: #fff; display: grid; place-items: center; font-weight: 700; font-size: 11px; flex: none; }
.btn { border: 1px solid var(--line); background: var(--bg); border-radius: 8px; padding: 5px 10px; cursor: pointer; white-space: nowrap; }
.btn:hover { background: var(--bg2); }
.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn.primary:hover { filter: brightness(1.08); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 2px; min-height: 0; }
.chip { display: inline-flex; gap: 6px; align-items: center; padding: 3px 4px 3px 9px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font-size: 12px; }
.chip button { border: 0; background: transparent; cursor: pointer; padding: 0 5px; color: inherit; font-size: 14px; line-height: 1; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); gap: 10px; margin-top: 12px; }
.tile { text-align: left; border: 1px solid var(--line); border-radius: var(--radius); background: var(--bg); padding: 11px 12px; cursor: pointer; transition: border-color .15s, transform .15s; }
.tile:hover { border-color: var(--accent); transform: translateY(-1px); }
.tile.active { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
.tile .n { font-size: 24px; font-weight: 680; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.tile .l { color: var(--fg2); font-size: 12px; }
.tile.bad .n { color: var(--bad); }
.tile.warn .n { color: var(--warn); }
.grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 10px; margin-top: 10px; }
.grid3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; margin-top: 10px; }
.card { border: 1px solid var(--line); border-radius: var(--radius); background: var(--bg); padding: 12px; min-width: 0; }
.card h2 { font-size: 12px; font-weight: 620; margin: 0 0 10px; color: var(--fg2); text-transform: uppercase; letter-spacing: .04em; }
.days { display: flex; align-items: flex-end; gap: 3px; height: 86px; margin-top: 16px; }
.day { flex: 1; min-width: 6px; display: flex; flex-direction: column; justify-content: flex-end; align-items: stretch; height: 100%; cursor: pointer; position: relative; }
.day .bar { background: var(--accent); border-radius: 3px 3px 1px 1px; min-height: 2px; opacity: .85; }
.day.zero .bar { background: var(--line); opacity: 1; }
.day.overdue .bar { background: var(--bad); }
.day.today .bar { outline: 2px solid var(--accent-soft); }
.day:hover .bar { opacity: 1; filter: brightness(1.1); }
.day .c { position: absolute; top: -2px; left: 0; right: 0; text-align: center; font-size: 10px; color: var(--fg2); transform: translateY(-100%); }
.axis { display: flex; justify-content: space-between; margin-top: 5px; font-size: 10.5px; color: var(--fg2); }
.bars { display: flex; flex-direction: column; gap: 6px; }
.hbar { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 8px; cursor: pointer; border-radius: 6px; padding: 2px 4px; margin: 0 -4px; }
.hbar:hover { background: var(--bg2); }
.hbar .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hbar .cnt { font-variant-numeric: tabular-nums; color: var(--fg2); }
.hbar .track { grid-column: 1 / -1; height: 5px; background: var(--bg2); border-radius: 3px; overflow: hidden; }
.hbar .fill { height: 100%; background: var(--accent); border-radius: 3px; }
.hbar.bad .fill { background: var(--bad); }
.empty { color: var(--fg2); font-size: 12px; padding: 8px 0; }
.tablecard { margin-top: 10px; padding: 0; overflow: hidden; }
.tablecard .toolbar { padding: 10px 12px; border-bottom: 1px solid var(--line); }
.search { flex: 1; max-width: 280px; border: 1px solid var(--line); background: var(--bg); border-radius: 8px; padding: 5px 9px; font: inherit; color: inherit; }
.tablewrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--line); white-space: nowrap; }
th { font-size: 11.5px; font-weight: 600; color: var(--fg2); cursor: pointer; user-select: none; background: var(--bg2); position: sticky; top: 0; }
th.sorted::after { content: " \25BE"; }
th.sorted.asc::after { content: " \25B4"; }
tbody tr { cursor: pointer; }
tbody tr:hover { background: var(--bg2); }
tbody tr.sel { background: var(--accent-soft); }
.num { font-weight: 600; }
.pill { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 11.5px; background: var(--bg2); border: 1px solid var(--line); }
.pill.s-available { color: var(--ok); border-color: currentColor; }
.pill.s-hold, .pill.s-notavailable { color: var(--bad); border-color: currentColor; }
.pill.s-onship, .pill.s-onrail { color: var(--accent); border-color: currentColor; }
.badge { display: inline-block; padding: 0 6px; border-radius: 5px; font-size: 11px; margin-left: 5px; }
.badge.bad { background: var(--bad-soft); color: var(--bad); }
.badge.warn { background: rgba(224, 168, 74, .16); color: var(--warn); }
.badge.ok { background: rgba(76, 198, 133, .14); color: var(--ok); }
.hold { display: inline-block; padding: 0 6px; margin-right: 3px; border-radius: 5px; background: var(--bad-soft); color: var(--bad); font-size: 11px; }
.foot { padding: 9px 12px; }
.loading { position: fixed; inset: 0 0 auto 0; height: 2px; background: linear-gradient(90deg, transparent, var(--accent), transparent); background-size: 200% 100%; animation: slide 1s linear infinite; display: none; z-index: 20; }
body.busy .loading { display: block; }
@keyframes slide { from { background-position: 100% 0; } to { background-position: -100% 0; } }
.skeleton { background: linear-gradient(90deg, var(--bg2), var(--line), var(--bg2)); background-size: 200% 100%; animation: slide 1.2s linear infinite; border-radius: 6px; }
.drawer-bg { position: absolute; inset: 0; min-height: 100vh; background: rgba(0, 0, 0, .28); display: none; z-index: 10; }
.drawer { position: absolute; top: 0; right: 0; width: min(440px, 100%); max-height: 100vh; border-radius: var(--radius) 0 0 var(--radius); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); background: var(--bg); border-left: 1px solid var(--line); box-shadow: -12px 0 30px rgba(0,0,0,.12); transform: translateX(105%); transition: transform .22s ease; visibility: hidden; z-index: 11; display: flex; flex-direction: column; }
body.drawer-open .drawer { transform: none; visibility: visible; }
html.fullscreen .drawer { position: fixed; bottom: 0; top: 0 !important; border-radius: 0; }
body.drawer-open .drawer-bg { display: block; }
.drawer .head { padding: 14px 16px; border-bottom: 1px solid var(--line); }
.drawer .body { padding: 14px 16px; overflow-y: auto; flex: 1; }
.drawer .actions { padding: 0 16px 12px; border-bottom: 1px solid var(--line); display: flex; gap: 8px; flex-wrap: wrap; }
.drawer .head { border-bottom: 0; }
.kv { display: grid; grid-template-columns: 120px 1fr; gap: 5px 10px; margin-bottom: 14px; }
.kv dt { color: var(--fg2); }
.kv dd { margin: 0; overflow-wrap: anywhere; }
.timeline { list-style: none; padding: 0; margin: 0; position: relative; }
.timeline::before { content: ""; position: absolute; left: 5px; top: 4px; bottom: 4px; width: 2px; background: var(--line); }
.timeline li { position: relative; padding: 0 0 11px 20px; }
.timeline li::before { content: ""; position: absolute; left: 0; top: 4px; width: 12px; height: 12px; border-radius: 50%; background: var(--bg); border: 2px solid var(--accent); }
.timeline li.future::before { border-style: dashed; border-color: var(--fg2); }
.timeline li.void { opacity: .45; text-decoration: line-through; }
.err { color: var(--bad); padding: 10px 0; }
@media (max-width: 560px) { body { padding: 10px; } .hide-sm { display: none; } }
@media (max-width: 900px) { .c-eta { display: none; } }
td.wrap { white-space: normal; min-width: 140px; max-width: 220px; }
</style>
</head>
<body>
<div class="loading"></div>
<header class="row">
  <div class="brand">49</div>
  <div>
    <h1 id="title">Container dashboard</h1>
    <div class="muted small" id="subtitle">Loading&hellip;</div>
  </div>
  <div class="spacer"></div>
  <button class="btn hide-sm" id="ask-view" title="Ask Claude about what this dashboard shows">Ask about this view</button>
  <button class="btn" id="refresh" title="Refresh">&#x21bb;</button>
  <button class="btn" id="fullscreen" title="Fullscreen" hidden>&#x2922;</button>
</header>
<div class="chips" id="chips"></div>
<section class="tiles" id="tiles"></section>
<section class="grid2">
  <div class="card"><h2>Last free days &middot; next 3 weeks</h2><div id="lfd"></div></div>
  <div class="card"><h2>Arrived at port &middot; last 3 weeks</h2><div id="arrivals"></div></div>
</section>
<section class="grid3">
  <div class="card"><h2>By status</h2><div class="bars" id="by-status"></div></div>
  <div class="card"><h2>By terminal</h2><div class="bars" id="by-terminal"></div></div>
  <div class="card"><h2>By carrier</h2><div class="bars" id="by-carrier"></div></div>
  <div class="card"><h2>Holds</h2><div class="bars" id="by-hold"></div></div>
</section>
<section class="card tablecard">
  <div class="toolbar row">
    <input class="search" id="search" placeholder="Filter loaded rows: number, BL, terminal&hellip;" autocomplete="off">
    <div class="spacer"></div>
    <span class="muted small" id="rowcount"></span>
  </div>
  <div class="tablewrap"><table>
    <thead><tr id="thead"></tr></thead>
    <tbody id="rows"></tbody>
  </table></div>
  <div class="foot row"><span class="muted small">Click a row for details and its event timeline.</span><div class="spacer"></div><button class="btn" id="more" hidden>Load more</button></div>
</section>
<div class="drawer-bg" id="drawer-bg"></div>
<aside class="drawer" id="drawer" aria-hidden="true">
  <div class="head row"><div><div class="num" id="d-title" style="font-size:16px"></div><div class="muted small" id="d-sub"></div></div><div class="spacer"></div><button class="btn" id="d-close" title="Close">&times;</button></div>
  <div class="actions"><button class="btn primary" id="d-ask">Ask Claude about this container</button><button class="btn" id="d-open">Open in Terminal49</button></div>
  <div class="body" id="d-body"></div>
</aside>
<script>
(function () {
  "use strict";

  // ---------- MCP Apps bridge (JSON-RPC 2.0 over postMessage) ----------
  var PROTOCOL_VERSION = "2026-01-26";
  var nextId = 1;
  var pending = {};
  var host = { capabilities: {}, context: {} };

  function post(message) {
    message.jsonrpc = "2.0";
    window.parent.postMessage(message, "*");
  }
  function request(method, params, timeoutMs) {
    var id = nextId++;
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        delete pending[id];
        reject(new Error(method + " timed out"));
      }, timeoutMs || 60000);
      pending[id] = { resolve: resolve, reject: reject, timer: timer };
      post({ id: id, method: method, params: params || {} });
    });
  }
  function notify(method, params) {
    post({ method: method, params: params || {} });
  }
  var handlers = {
    "ui/notifications/tool-input": function (p) {
      if (p && p.arguments) {
        state.args = cleanArgs(p.arguments);
        renderChips();
      }
      setBusy(true);
    },
    "ui/notifications/tool-result": function (p) {
      setBusy(false);
      acceptResult(p);
    },
    "ui/notifications/tool-cancelled": function () { setBusy(false); },
    "ui/notifications/host-context-changed": function (p) { applyHostContext(p); }
  };
  window.addEventListener("message", function (event) {
    if (event.source !== window.parent) return;
    var m = event.data;
    if (!m || m.jsonrpc !== "2.0") return;
    if (m.id !== undefined && m.id !== null && !m.method) {
      var waiter = pending[m.id];
      if (!waiter) return;
      clearTimeout(waiter.timer);
      delete pending[m.id];
      if (m.error) waiter.reject(new Error(m.error.message || "Request failed"));
      else waiter.resolve(m.result);
      return;
    }
    if (m.method && m.id !== undefined && m.id !== null) {
      // Requests from the host: teardown and ping need only an empty result.
      post({ id: m.id, result: {} });
      return;
    }
    if (m.method && handlers[m.method]) handlers[m.method](m.params || {});
  });

  function applyHostContext(ctx) {
    if (!ctx) return;
    for (var k in ctx) host.context[k] = ctx[k];
    if (ctx.theme) document.documentElement.setAttribute("data-theme", ctx.theme);
    var vars = ctx.styles && ctx.styles.variables;
    if (vars) {
      for (var name in vars) {
        if (vars[name]) document.documentElement.style.setProperty(name, vars[name]);
      }
    }
    document.documentElement.classList.toggle("fullscreen", host.context.displayMode === "fullscreen");
    var modes = host.context.availableDisplayModes || [];
    el("fullscreen").hidden = modes.indexOf("fullscreen") < 0;
    el("fullscreen").innerHTML = host.context.displayMode === "fullscreen" ? "&#x2921;" : "&#x2922;";
  }

  function callTool(name, args) {
    setBusy(true);
    return request("tools/call", { name: name, arguments: args || {} }, 120000)
      .then(function (result) {
        setBusy(false);
        if (!result || result.isError) {
          var text = result && result.content && result.content[0] && result.content[0].text;
          throw new Error(text || (name + " failed"));
        }
        return result.structuredContent || parseText(result);
      }, function (error) { setBusy(false); throw error; });
  }
  function parseText(result) {
    try { return JSON.parse(result.content[0].text); } catch (e) { return null; }
  }
  function sendMessage(text) {
    return request("ui/message", { role: "user", content: [{ type: "text", text: text }] })
      .catch(function () { toast("This host can't take messages from the dashboard."); });
  }
  function updateModelContext(text) {
    request("ui/update-model-context", { content: [{ type: "text", text: text }] }).catch(function () {});
  }
  function openLink(url) {
    request("ui/open-link", { url: url }).catch(function () { window.open(url, "_blank", "noopener"); });
  }

  // ---------- state ----------
  var state = {
    args: {},
    data: null,
    rows: [],
    page: 1,
    hasMore: false,
    sortKey: null,
    sortAsc: true,
    query: "",
    selected: null
  };

  var DISCHARGED = "Available,Not available,At Terminal,Awaiting Inland Transfer";
  var FILTER_LABELS = {
    current_status: "Status",
    requires_attention: "Needs attention",
    has_holds: "Has holds",
    has_fees: "Has fees",
    shipping_line_scac: "Carrier",
    pickup_lfd: "LFD",
    arrival: "Arrival",
    pod_code: "POD",
    pol_code: "POL",
    tags: "Tags",
    number: "Number",
    pod_terminal_id: "Terminal",
    sort: "Sort",
    include_stopped_tracking: "Include stopped"
  };

  function el(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmt(n) { return (n || 0).toLocaleString(); }
  function setBusy(on) { document.body.classList.toggle("busy", !!on); }
  function cleanArgs(args) {
    var out = {};
    for (var k in args) if (args[k] !== undefined && args[k] !== null && args[k] !== "") out[k] = args[k];
    return out;
  }
  function day(iso) { return iso ? String(iso).slice(0, 10) : ""; }
  function todayIso() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function pad(n) { return n < 10 ? "0" + n : String(n); }
  function addDays(iso, n) {
    var d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function daysBetween(a, b) {
    return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
  }
  function shortDate(iso) {
    if (!iso) return "";
    var d = new Date(day(iso) + "T00:00:00Z");
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  }
  function dateTime(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d)) return esc(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
  function statusClass(s) { return "s-" + String(s || "").toLowerCase().replace(/[^a-z]/g, ""); }
  var toastTimer;
  function toast(text) {
    el("subtitle").textContent = text;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(renderSubtitle, 4000);
  }

  // ---------- data flow ----------
  function acceptResult(result) {
    var data = result && (result.structuredContent || parseText(result));
    if (!data || !data.totals) {
      if (result && result.isError) toast("The dashboard could not load. Ask Claude to try again.");
      return;
    }
    state.data = data;
    state.rows = data.containers || [];
    state.page = (data.page && data.page.page) || 1;
    state.hasMore = !!(data.page && data.page.has_more);
    render();
  }

  function reload(newArgs) {
    state.args = cleanArgs(newArgs);
    renderChips();
    return callTool("show_container_dashboard", state.args).then(function (data) {
      acceptResult({ structuredContent: data });
      if (data && data.summary) updateModelContext("The user changed the Terminal49 dashboard view.\n" + data.summary);
    }, function (error) { toast(error.message); });
  }

  function setFilter(key, value) {
    var args = Object.assign({}, state.args);
    var advanced = key === "pod_terminal_id";
    if (advanced) {
      args.advanced_filters = Object.assign({}, args.advanced_filters || {});
      if (value === undefined) delete args.advanced_filters[key];
      else args.advanced_filters[key] = value;
      if (!Object.keys(args.advanced_filters).length) delete args.advanced_filters;
    } else if (value === undefined) {
      delete args[key];
    } else {
      args[key] = value;
    }
    if (key === "requires_attention") {
      if (value === true) args.sort = "attention_priority";
      else if (args.sort === "attention_priority") delete args.sort;
    }
    delete args.title;
    reload(args);
  }

  function loadMore() {
    var args = Object.assign({}, state.args);
    delete args.title;
    args.page = state.page + 1;
    args.page_size = 25;
    callTool("list_containers", args).then(function (data) {
      var items = (data && data.items) || [];
      state.rows = state.rows.concat(items);
      state.page += 1;
      state.hasMore = !!(data && data._metadata && data._metadata.has_more);
      renderTable();
    }, function (error) { toast(error.message); });
  }

  // ---------- rendering ----------
  function render() {
    var d = state.data;
    el("title").textContent = d.title || "Container dashboard";
    renderSubtitle();
    renderChips();
    renderTiles();
    renderDays("lfd", d.breakdowns.lfd_by_day, true);
    renderArrivals(d.breakdowns.arrivals_by_day);
    renderBars("by-status", d.breakdowns.status, function (g) { setFilter("current_status", g.label || g.key); });
    renderBars("by-terminal", d.breakdowns.terminal, function (g) { if (g.key) setFilter("pod_terminal_id", g.key); });
    renderBars("by-carrier", d.breakdowns.carrier, function (g) { if (g.label) setFilter("shipping_line_scac", g.label); });
    renderBars("by-hold", d.breakdowns.hold_type, function () { setFilter("has_holds", true); }, true);
    renderTable();
  }

  function renderSubtitle() {
    var d = state.data;
    if (!d) return;
    el("subtitle").textContent = fmt(d.totals.containers) + " containers · updated " +
      new Date(d.generated_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function renderChips() {
    var parts = [];
    var a = state.args;
    Object.keys(a).forEach(function (k) {
      if (k === "title") return;
      if (k === "advanced_filters") {
        Object.keys(a.advanced_filters || {}).forEach(function (ak) {
          parts.push(chip(ak, a.advanced_filters[ak], "pod_terminal_id" === ak ? terminalName(a.advanced_filters[ak]) : null));
        });
        return;
      }
      parts.push(chip(k, a[k]));
    });
    el("chips").innerHTML = parts.join("");
    Array.prototype.forEach.call(el("chips").querySelectorAll("button[data-k]"), function (b) {
      b.addEventListener("click", function () { setFilter(b.getAttribute("data-k"), undefined); });
    });
  }
  function terminalName(id) {
    var groups = (state.data && state.data.breakdowns.terminal) || [];
    for (var i = 0; i < groups.length; i++) if (groups[i].key === id) return groups[i].label;
    return null;
  }
  function chip(key, value, label) {
    var shown = label || (value === true ? "" : Array.isArray(value) ? value.join(" + ") : typeof value === "object" ? JSON.stringify(value) : String(value));
    if (key === "current_status" && value === DISCHARGED) shown = "At terminal (discharged)";
    return '<span class="chip">' + esc(FILTER_LABELS[key] || key) + (shown ? ": " + esc(shown) : "") +
      '<button data-k="' + esc(key) + '" title="Remove filter">&times;</button></span>';
  }

  function statusCount(labels) {
    var groups = state.data.breakdowns.status;
    return groups.reduce(function (sum, g) { return labels.indexOf(g.label || g.key) >= 0 ? sum + g.count : sum; }, 0);
  }

  function renderTiles() {
    var d = state.data;
    var a = state.args;
    var tiles = [
      { n: d.totals.containers, l: "Active containers", active: !a.current_status && !a.requires_attention && !a.has_holds, click: function () {
        var args = Object.assign({}, a); delete args.current_status; delete args.requires_attention; delete args.has_holds; delete args.sort; delete args.title; reload(args);
      } },
      { n: statusCount(["On Ship"]), l: "On ship", active: a.current_status === "On Ship", click: function () { setFilter("current_status", "On Ship"); } },
      { n: statusCount(DISCHARGED.split(",")), l: "At terminal, not picked up", active: a.current_status === DISCHARGED, click: function () { setFilter("current_status", DISCHARGED); } },
      { n: statusCount(["Available"]), l: "Ready for pickup", cls: "", active: a.current_status === "Available", click: function () { setFilter("current_status", "Available"); } },
      { n: d.totals.needs_attention, l: "Needs attention", cls: d.totals.needs_attention ? "bad" : "", active: a.requires_attention === true, click: function () { setFilter("requires_attention", true); } },
      { n: d.totals.with_holds, l: "Hold flags", cls: d.totals.with_holds ? "warn" : "", active: a.has_holds === true, click: function () { setFilter("has_holds", true); } }
    ];
    var box = el("tiles");
    box.innerHTML = "";
    tiles.forEach(function (t) {
      var b = document.createElement("button");
      b.className = "tile " + (t.cls || "") + (t.active ? " active" : "");
      b.innerHTML = '<div class="n">' + fmt(t.n) + '</div><div class="l">' + esc(t.l) + "</div>";
      b.addEventListener("click", t.click);
      box.appendChild(b);
    });
  }

  function renderDays(id, groups, isLfd) {
    var today = todayIso();
    var counts = {};
    var overdue = 0;
    groups.forEach(function (g) {
      if (g.key < today) overdue += g.count;
      else counts[g.key] = g.count;
    });
    var cells = [];
    if (isLfd) cells.push({ key: "overdue", label: "Past due", count: overdue, overdue: true });
    for (var i = 0; i < 21; i++) {
      var k = addDays(today, i);
      cells.push({ key: k, label: shortDate(k), count: counts[k] || 0, today: i === 0 });
    }
    var max = cells.reduce(function (m, c) { return Math.max(m, c.count); }, 0) || 1;
    var html = '<div class="days">';
    cells.forEach(function (c, idx) {
      var h = Math.max(2, Math.round((c.count / max) * 70));
      html += '<div class="day' + (c.count ? "" : " zero") + (c.overdue && c.count ? " overdue" : "") + (c.today ? " today" : "") +
        '" data-i="' + idx + '" title="' + esc(c.label + ": " + c.count) + '">' +
        (c.count ? '<span class="c">' + c.count + "</span>" : "") + '<div class="bar" style="height:' + h + 'px"></div></div>';
    });
    html += '</div><div class="axis"><span>' + (isLfd ? "Past due" : "Today") + "</span><span>" + shortDate(addDays(today, 7)) +
      "</span><span>" + shortDate(addDays(today, 14)) + "</span><span>" + shortDate(addDays(today, 20)) + "</span></div>";
    var total = cells.reduce(function (s, c) { return s + c.count; }, 0);
    if (!total) html += '<div class="empty">' + (isLfd ? "No last free days in this window." : "No arrivals in this window.") + "</div>";
    var box = el(id);
    box.innerHTML = html;
    Array.prototype.forEach.call(box.querySelectorAll(".day"), function (node) {
      node.addEventListener("click", function () {
        var c = cells[Number(node.getAttribute("data-i"))];
        if (!c.count) return;
        var key = isLfd ? "pickup_lfd" : "arrival";
        setFilter(key, c.key === "overdue" ? "<" + today : c.key);
      });
    });
  }

  // Actual arrivals (ATA) over the last three weeks, oldest first.
  function renderArrivals(groups) {
    var today = todayIso();
    var counts = {};
    groups.forEach(function (g) { counts[g.key] = g.count; });
    var cells = [];
    for (var i = 20; i >= 0; i--) {
      var k = addDays(today, -i);
      cells.push({ key: k, label: shortDate(k), count: counts[k] || 0, today: i === 0 });
    }
    var max = cells.reduce(function (m, c) { return Math.max(m, c.count); }, 0) || 1;
    var html = '<div class="days">' + cells.map(function (c, idx) {
      var h = Math.max(2, Math.round((c.count / max) * 70));
      return '<div class="day' + (c.count ? "" : " zero") + (c.today ? " today" : "") + '" data-i="' + idx + '" title="' + esc(c.label + ": " + c.count) + '">' +
        (c.count ? '<span class="c">' + c.count + "</span>" : "") + '<div class="bar" style="height:' + h + 'px"></div></div>';
    }).join("") + '</div><div class="axis"><span>' + shortDate(addDays(today, -20)) + "</span><span>" + shortDate(addDays(today, -13)) +
      "</span><span>" + shortDate(addDays(today, -6)) + "</span><span>Today</span></div>";
    if (!cells.some(function (c) { return c.count; })) html += '<div class="empty">No arrivals in the last three weeks.</div>';
    var box = el("arrivals");
    box.innerHTML = html;
    Array.prototype.forEach.call(box.querySelectorAll(".day"), function (node) {
      node.addEventListener("click", function () {
        var c = cells[Number(node.getAttribute("data-i"))];
        if (c.count) setFilter("arrival", c.key);
      });
    });
  }

  function renderBars(id, groups, onClick, bad) {
    var box = el(id);
    var list = (groups || []).slice(0, 7);
    if (!list.length) { box.innerHTML = '<div class="empty">Nothing to show.</div>'; return; }
    var max = list[0].count || 1;
    box.innerHTML = list.map(function (g, i) {
      var name = g.label || g.key || (id === "by-terminal" ? "No terminal yet" : "None");
      return '<div class="hbar' + (bad ? " bad" : "") + '" data-i="' + i + '" title="Filter to ' + esc(name) + '"><span class="name">' + esc(name) +
        '</span><span class="cnt">' + fmt(g.count) + '</span><div class="track"><div class="fill" style="width:' +
        Math.max(2, Math.round((g.count / max) * 100)) + '%"></div></div></div>';
    }).join("") + (groups.length > list.length ? '<div class="muted small">+' + (groups.length - list.length) + " more</div>" : "");
    Array.prototype.forEach.call(box.querySelectorAll(".hbar"), function (node) {
      node.addEventListener("click", function () { onClick(list[Number(node.getAttribute("data-i"))]); });
    });
  }

  var COLUMNS = [
    { key: "number", label: "Container", get: function (r) { return r.number; } },
    { key: "status", label: "Status", get: function (r) { return r.status; } },
    { key: "terminal", label: "Terminal · carrier", get: function (r) { return r.pod_terminal; } },
    { key: "eta", cls: "c-eta", label: "POD ETA / ATA", get: function (r) { return r.shipment && (r.shipment.pod_ata_at || r.shipment.pod_eta_at); } },
    { key: "lfd", label: "LFD", get: function (r) { return r.pickup_lfd; } },
    { key: "holds", label: "Holds & fees", get: function (r) { return (r.holds || []).length + (r.fees || []).length; } }
  ];

  function renderTable() {
    var head = el("thead");
    head.innerHTML = COLUMNS.map(function (c) {
      var sorted = state.sortKey === c.key;
      return '<th data-k="' + c.key + '" class="' + (c.cls || "") + " " + (sorted ? "sorted" + (state.sortAsc ? " asc" : "") : "") + '">' + esc(c.label) + "</th>";
    }).join("");
    Array.prototype.forEach.call(head.querySelectorAll("th"), function (th) {
      th.addEventListener("click", function () {
        var k = th.getAttribute("data-k");
        if (state.sortKey === k) state.sortAsc = !state.sortAsc;
        else { state.sortKey = k; state.sortAsc = true; }
        renderTable();
      });
    });

    var q = state.query.toLowerCase();
    var rows = state.rows.filter(function (r) {
      if (!q) return true;
      var hay = [r.number, r.status, r.pod_terminal, r.shipment && r.shipment.bill_of_lading, r.shipment && r.shipment.shipping_line_scac,
        r.shipment && r.shipment.pod_vessel, (r.holds || []).join(" ")].join(" ").toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    if (state.sortKey) {
      var col = COLUMNS.filter(function (c) { return c.key === state.sortKey; })[0];
      rows = rows.slice().sort(function (x, y) {
        var a = col.get(x), b = col.get(y);
        if (a == null || a === "") return 1;
        if (b == null || b === "") return -1;
        var cmp = a < b ? -1 : a > b ? 1 : 0;
        return state.sortAsc ? cmp : -cmp;
      });
    }
    var today = todayIso();
    el("rows").innerHTML = rows.length ? rows.map(function (r) {
      var s = r.shipment || {};
      var lfd = day(r.pickup_lfd);
      var lfdBadge = "";
      if (lfd && r.status !== "Picked up" && r.status !== "Empty Returned" && r.status !== "Delivered") {
        var left = daysBetween(today, lfd);
        lfdBadge = left < 0 ? '<span class="badge bad">' + -left + "d over</span>" :
          left <= 2 ? '<span class="badge warn">' + (left === 0 ? "today" : "in " + left + "d") + "</span>" :
          '<span class="badge ok">in ' + left + "d</span>";
      }
      var eta = s.pod_ata_at ? shortDate(s.pod_ata_at) + ' <span class="muted small">arrived</span>' : s.pod_eta_at ? shortDate(s.pod_eta_at) : "";
      var feeTotal = (r.fees || []).reduce(function (sum, f) { return sum + (Number(f.amount) || 0); }, 0);
      return '<tr data-id="' + esc(r.id) + '"' + (state.selected === r.id ? ' class="sel"' : "") + '>' +
        '<td><span class="num">' + esc(r.number) + '</span>' + (s.bill_of_lading ? '<div class="muted small">' + esc(s.bill_of_lading) + "</div>" : "") + "</td>" +
        '<td><span class="pill ' + statusClass(r.status) + '">' + esc(r.status || "Unknown") + "</span></td>" +
        '<td class="wrap">' + esc(r.pod_terminal || "") + (s.shipping_line_scac ? '<div class="muted small">' + esc(s.shipping_line_scac) + "</div>" : "") + "</td>" +
        '<td class="c-eta">' + eta + "</td>" +
        "<td>" + (lfd ? shortDate(lfd) + lfdBadge : "") + "</td>" +
        "<td>" + (r.holds || []).map(function (h) { return '<span class="hold">' + esc(h) + "</span>"; }).join("") +
        (feeTotal ? '<span class="badge warn">$' + fmt(Math.round(feeTotal)) + "</span>" : "") + "</td></tr>";
    }).join("") : '<tr><td colspan="6" class="empty">No containers match.</td></tr>';
    Array.prototype.forEach.call(el("rows").querySelectorAll("tr[data-id]"), function (tr) {
      tr.addEventListener("click", function () { openContainer(tr.getAttribute("data-id"), tr); });
    });
    var total = state.data ? state.data.totals.containers : rows.length;
    el("rowcount").textContent = "Showing " + fmt(rows.length) + " of " + fmt(total);
    el("more").hidden = !state.hasMore;
  }

  // ---------- container drawer ----------
  var current = null;
  function openContainer(id, anchor) {
    state.selected = id;
    // Inline, the frame grows to fit the page, so open the panel beside the row.
    var top = anchor ? anchor.getBoundingClientRect().top + window.scrollY - 120 : window.scrollY;
    el("drawer").style.top = Math.max(0, Math.min(top, document.documentElement.scrollHeight - 640)) + "px";
    renderTable();
    var row = state.rows.filter(function (r) { return r.id === id; })[0] || {};
    current = { id: id, number: row.number, detail: null };
    el("d-title").textContent = row.number || "Container";
    el("d-sub").textContent = [row.status, row.pod_terminal].filter(Boolean).join(" · ");
    el("d-body").innerHTML = '<div class="skeleton" style="height:120px;margin-bottom:12px"></div><div class="skeleton" style="height:220px"></div>';
    el("d-open").hidden = true;
    document.body.classList.add("drawer-open");
    el("drawer").setAttribute("aria-hidden", "false");
    callTool("get_container", { id: id }).then(function (c) {
      if (!current || current.id !== id) return;
      current.detail = c;
      renderDrawer(c);
      var dem = c.demurrage || {};
      updateModelContext("In the Terminal49 dashboard the user opened container " + c.container_number + " (id " + c.id + "): status " + c.status +
        (c.pod_terminal && c.pod_terminal.name ? ", terminal " + c.pod_terminal.name : "") +
        (dem.pickup_lfd ? ", pickup LFD " + day(dem.pickup_lfd) + " (" + dem.urgency + ")" : "") +
        ((dem.holds_at_pod_terminal || []).length ? ", has terminal holds" : "") + ".");
    }, function (error) {
      el("d-body").innerHTML = '<div class="err">' + esc(error.message) + "</div>";
    });
  }
  function closeDrawer() {
    document.body.classList.remove("drawer-open");
    el("drawer").setAttribute("aria-hidden", "true");
    current = null;
    state.selected = null;
    renderTable();
  }
  function kv(pairs) {
    var rows = pairs.filter(function (p) { return p[1] !== null && p[1] !== undefined && p[1] !== ""; });
    if (!rows.length) return "";
    return '<dl class="kv">' + rows.map(function (p) { return "<dt>" + esc(p[0]) + "</dt><dd>" + p[1] + "</dd>"; }).join("") + "</dl>";
  }
  function renderDrawer(c) {
    el("d-title").textContent = c.container_number;
    var eq = c.equipment || {};
    var loc = c.location || {};
    var dem = c.demurrage || {};
    var sh = c.shipment || {};
    el("d-sub").textContent = [c.status, eq.length ? eq.length + "' " + (eq.type || "") : null, sh.shipping_line_name || sh.line].filter(Boolean).join(" · ");
    var urgency = dem.urgency === "overdue" ? '<span class="badge bad">overdue</span>' : dem.urgency === "imminent" ? '<span class="badge warn">soon</span>' : "";
    var holds = (dem.holds_at_pod_terminal || []).map(function (h) {
      var name = typeof h === "string" ? h : (h && (h.name || h.description)) || "hold";
      return '<span class="hold">' + esc(name) + "</span>";
    }).join("");
    var html = "";
    html += kv([
      ["Status", '<span class="pill ' + statusClass(c.status) + '">' + esc(c.status) + "</span>"],
      ["Location", esc(loc.current_location || "")],
      ["Terminal", esc(c.pod_terminal && c.pod_terminal.name || "")],
      ["Available", loc.availability_known ? (loc.available_for_pickup ? "Yes" : "No") : ""],
      ["Pickup LFD", dem.pickup_lfd ? esc(dem.pickup_lfd_local || day(dem.pickup_lfd)) + urgency : ""],
      ["Appointment", dem.pickup_appointment_at ? dateTime(dem.pickup_appointment_at) : ""],
      ["Holds", holds],
      ["Fees", dem.fees_total_amount ? esc((dem.fees_currency_code || "USD") + " " + fmt(dem.fees_total_amount)) : ""]
    ]);
    html += kv([
      ["Route", esc([sh.port_of_lading_name, sh.port_of_discharge_name, sh.destination_name].filter(Boolean).join(" → "))],
      ["Arrived POD", loc.pod_arrived_at ? esc(loc.pod_arrived_at_local || dateTime(loc.pod_arrived_at)) : ""],
      ["Discharged", loc.pod_discharged_at ? esc(loc.pod_discharged_at_local || dateTime(loc.pod_discharged_at)) : ""],
      ["References", esc((sh.ref_numbers || []).filter(Boolean).join(", "))]
    ]);
    var events = collapseRepeats(((c.events && c.events.timeline) || []).slice().reverse());
    if (events.length) {
      var now = Date.now();
      html += '<h2 style="font-size:12px;color:var(--fg2);text-transform:uppercase;letter-spacing:.04em;margin:4px 0 10px">Events (' + events.length + ")</h2><ul class=\"timeline\">";
      html += events.slice(0, 40).map(function (e) {
        var future = Date.parse(e.timestamp) > now;
        var where = e.location && (e.location.name || e.location.code);
        return '<li class="' + (future ? "future" : "") + (e.invalidated_at ? " void" : "") + '"><div>' + esc(humanize(e.event)) +
          (e.repeats > 1 ? ' <span class="muted small">&times;' + e.repeats + "</span>" : "") + "</div>" +
          '<div class="muted small">' + dateTime(e.timestamp) + (where ? " · " + esc(where) : "") + (e.voyage_number ? " · voy " + esc(e.voyage_number) : "") + "</div></li>";
      }).join("");
      html += "</ul>";
    }
    el("d-body").innerHTML = html || '<div class="empty">No details.</div>';
    el("d-open").hidden = !(sh.id && state.data && state.data.app_url);
  }
  // Carriers resend the same event many times; show each run once with a count.
  function collapseRepeats(events) {
    var out = [];
    events.forEach(function (e) {
      var prev = out[out.length - 1];
      var where = e.location && (e.location.name || e.location.code);
      var prevWhere = prev && prev.location && (prev.location.name || prev.location.code);
      if (prev && prev.event === e.event && prevWhere === where && !e.invalidated_at && !prev.invalidated_at) { prev.repeats += 1; return; }
      out.push(Object.assign({}, e, { repeats: 1 }));
    });
    return out;
  }
  function humanize(name) {
    if (!name) return "Event";
    var s = String(name).replace(/^container\./, "").replace(/^shipment\./, "").replace(/[._]/g, " ");
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ---------- wiring ----------
  el("refresh").addEventListener("click", function () { reload(state.args); });
  el("more").addEventListener("click", loadMore);
  el("search").addEventListener("input", function (e) { state.query = e.target.value; renderTable(); });
  el("drawer-bg").addEventListener("click", closeDrawer);
  el("d-close").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDrawer(); });
  el("d-ask").addEventListener("click", function () {
    if (!current) return;
    sendMessage("Tell me about container " + (current.number || current.id) + " (id " + current.id + ") from the dashboard: where is it, is anything blocking pickup, and what should I do next?");
  });
  el("d-open").addEventListener("click", function () {
    var sh = current && current.detail && current.detail.shipment;
    if (sh && sh.id) openLink(state.data.app_url.replace(/\/$/, "") + "/shipments/" + encodeURIComponent(sh.id));
  });
  el("ask-view").addEventListener("click", function () {
    var chips = Array.prototype.map.call(el("chips").querySelectorAll(".chip"), function (n) { return n.textContent.replace(/×$/, "").trim(); });
    sendMessage("Looking at my Terminal49 dashboard" + (chips.length ? " (" + chips.join("; ") + ")" : "") + ": what needs my attention first, and why?");
  });
  el("fullscreen").addEventListener("click", function () {
    var mode = host.context.displayMode === "fullscreen" ? "inline" : "fullscreen";
    request("ui/request-display-mode", { mode: mode }).then(function (r) {
      applyHostContext({ displayMode: (r && r.mode) || mode });
    }).catch(function () {});
  });

  if (typeof ResizeObserver !== "undefined") {
    var lastHeight = 0;
    new ResizeObserver(function () {
      var h = Math.ceil(document.documentElement.scrollHeight);
      if (h !== lastHeight) {
        lastHeight = h;
        notify("ui/notifications/size-changed", { height: h });
      }
    }).observe(document.body);
  }

  request("ui/initialize", {
    appInfo: { name: "terminal49-container-dashboard", version: "1.0.0" },
    appCapabilities: { availableDisplayModes: ["inline", "fullscreen"] },
    protocolVersion: PROTOCOL_VERSION
  }).then(function (result) {
    host.capabilities = (result && result.hostCapabilities) || {};
    applyHostContext((result && result.hostContext) || {});
    notify("ui/notifications/initialized", {});
  }, function () {
    notify("ui/notifications/initialized", {});
  });
  setBusy(true);
})();
</script>
</body>
</html>
`;
