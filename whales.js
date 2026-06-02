// $EDGE Whales frontend. URL-state driven:
//   /whales.html          → firehose + leaderboard
//   /whales.html?wallet=… → wallet detail
import { fmtUsd, fmtUsdExact, fmtPct, fmtAgo, short, escapeHtml, escapeAttr } from "/lib/client/format.js";
import { liveList, liveLoop } from "/lib/client/live.js";

const $ = (sel, root = document) => root.querySelector(sel);
const main = $("#main");

const polymarketMarketUrl = (slug) => (slug ? `https://polymarket.com/market/${slug}` : "#");
const PREFS_KEY = "edge_sharp_prefs"; // hoisted: loadSharpPrefs() runs during state init

// ── state ─────────────────────────────────────────────────────────────
const state = {
  tab: "smart",
  threshold: 5000,
  seenTradeKeys: new Set(),
  refreshTimer: null,
  stopSmart: null,
  smart: {
    data: null,
    window: "all",
    alerts: new Map(),
    seen: new Set(),
    firstLoad: true,
    feedWindow: "live",
    kvTrades: null,
    kvPersistent: false,
    prefs: loadSharpPrefs(),
    spark: {},        // asset(clobTokenId) -> {series,delta,last} price-action history
  },
};

// ── ROUTING ───────────────────────────────────────────────────────────
function route() {
  const params = new URLSearchParams(location.search);
  const wallet = params.get("wallet");
  clearTimers();
  state.seenTradeKeys = new Set();

  if (wallet && /^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    renderWalletShell(wallet);
    loadWallet(wallet);
  } else {
    const t = params.get("tab");
    state.tab = t === "live" || t === "eagle" ? t : "smart";
    renderListShell();
    activateTab(state.tab);
  }
}

function clearTimers() {
  if (state.refreshTimer) { clearInterval(state.refreshTimer); state.refreshTimer = null; }
  if (state.stopSmart) { state.stopSmart(); state.stopSmart = null; }
}

// ── LIST PAGE (tabbed: Smart Money / Live Action) ─────────────────────
function renderListShell() {
  main.innerHTML = `
    <section class="hero" id="whaleHero"></section>
    <div class="whale-tabs">
      <button class="whale-tab" data-tab="smart"><span class="tico">🏆</span> Smart Money</button>
      <button class="whale-tab" data-tab="eagle"><span class="tico">🦅</span> Eagle Eye <span class="tnew">NEW</span></button>
      <button class="whale-tab" data-tab="live"><span class="tico">⚡</span> Live Action</button>
    </div>
    <div id="tabHost"></div>
  `;
  document.querySelectorAll(".whale-tab").forEach((b) => {
    b.addEventListener("click", () => {
      if (b.dataset.tab === state.tab) return;
      history.replaceState({}, "", b.dataset.tab === "smart" ? location.pathname : `?tab=${b.dataset.tab}`);
      activateTab(b.dataset.tab);
    });
  });
}

function activateTab(tab) {
  clearTimers();
  state.tab = tab;
  state.seenTradeKeys = new Set();
  document.querySelectorAll(".whale-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  if (tab === "live") renderLiveTab();
  else if (tab === "eagle") renderEagleTab();
  else renderSmartTab();
}

// ── EAGLE EYE TAB — off-Polymarket on-chain moves ─────────────────────
function renderEagleTab() {
  state.eagle = { window: "7d" };
  $("#whaleHero").innerHTML = `
    <h1>EAGLE <span class="accent">EYE</span></h1>
    <p class="tagline">
      Every move these wallets make <strong>off Polymarket</strong> — deposits, cash-outs, swaps, transfers to other
      wallets — tracked <strong>across chains, by the second</strong>. Nothing gets by the EDGE.
    </p>
  `;
  $("#tabHost").innerHTML = `
    <section class="panel">
      <div class="ee-statusbar armed" id="eeStatus">arming…</div>
      <div class="section-head">
        <h2>Off-Poly <span class="accent">Moves</span></h2>
        <div class="threshold-toggle" id="eeWindow">
          <button data-w="6h">6H</button>
          <button data-w="12h">12H</button>
          <button data-w="24h">24H</button>
          <button data-w="7d" class="active">7D</button>
          <button data-w="30d">30D</button>
          <button data-w="60d">60D</button>
        </div>
        <div class="meta" id="eeMeta">loading…</div>
      </div>
      <div class="ee-board" id="eeBoard">
        <div class="skel-row"></div><div class="skel-row"></div><div class="skel-row"></div>
      </div>
      <div class="sm-note">
        EAGLE EYE watches the tracked profitable wallets <b>everywhere on-chain</b>, not just Polymarket. Each
        counterparty is a lead — the first thread of wallet-to-wallet lineage. Full multichain history + a real-time
        feed unlock with an on-chain data key (see the bar above).
      </div>
    </section>
  `;
  document.querySelectorAll("#eeWindow button").forEach((b) =>
    b.addEventListener("click", () => {
      state.eagle.window = b.dataset.w;
      document.querySelectorAll("#eeWindow button").forEach((x) => x.classList.toggle("active", x === b));
      loadEagle();
    }));
  state.stopSmart = liveLoop(loadEagle, 12_000);
}

async function loadEagle() {
  try {
    const r = await fetch(`/api/whales/eagle-eye?window=${state.eagle.window}`);
    const d = await r.json();
    if (!r.ok) throw new Error(d?.detail || `HTTP ${r.status}`);
    renderEagleStatus(d);
    const meta = $("#eeMeta");
    if (meta) meta.innerHTML = `<span class="live-pulse"><span class="dot"></span></span> ${d.count} move${d.count === 1 ? "" : "s"} · ${d.persistent ? "persistent" : "live scan"}`;
    const board = $("#eeBoard"); if (!board) return;
    if (!d.events.length) {
      board.innerHTML = `<div class="empty"><strong>Global feed is armed.</strong><br>${escapeHtml(d.note || "Connect the on-chain data keys to populate the live cross-chain feed.")}</div>`;
      return;
    }
    liveList(board, d.events, { key: (e) => `${e.hash}-${e.direction}-${e.counterparty}`, render: eagleRow, max: 60 });
  } catch (err) {
    const s = $("#eeStatus"); if (s) s.textContent = "feed error: " + err.message;
  }
}

function renderEagleStatus(d) {
  const el = $("#eeStatus"); if (!el) return;
  if (d.etherscan && d.persistent) {
    el.className = "ee-statusbar full";
    el.innerHTML = `<b>● FULL POWER</b> — multichain on-chain tracking live, persistent real-time feed active. Nothing gets by.`;
    return;
  }
  const need = [];
  if (!d.etherscan) need.push("a free <b>Etherscan API key</b> (one key = all chains)");
  if (!d.persistent) need.push("<b>Vercel KV</b> (persistent real-time feed)");
  el.className = "ee-statusbar armed";
  el.innerHTML = `<b>⚡ ARMED</b> — running the key-free Polygon fallback (USDC.e deposits / cash-outs, ~5h). Connect ${need.join(" + ")} to track every move across every chain in real time.`;
}

function eagleRow(e) {
  const dir = e.direction === "in" ? "in" : "out";
  const amt = (e.amount || 0) >= 1000 ? fmtUsd(e.amount) : (e.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const cp = e.counterparty ? `→ <span class="ee-cp">${short(e.counterparty, 5)}</span>` : "";
  const venue = e.venue_label || e.venue || "transfer";
  const when = e.timestamp ? `${fmtAgo(e.timestamp)} ago` : e.block ? `blk ${e.block}` : "recent";
  return `<a class="ee-row" href="?wallet=${escapeAttr(e.wallet)}">
    <span class="ee-chain c-${escapeAttr(e.chain || "polygon")}">${escapeHtml(e.chain_sym || "POL")}</span>
    <div class="ee-who"><div class="n">${escapeHtml(e.name || short(e.wallet, 6))}</div><div class="w">${short(e.wallet, 8)}</div></div>
    <div class="ee-act"><b class="${dir}">${dir.toUpperCase()}</b> ${amt} ${escapeHtml(e.token || "")}</div>
    <div class="ee-venue">${escapeHtml(venue)} ${cp}</div>
    <div class="ee-time">${when}</div>
  </a>`;
}

// money formatting for P&L (always signed): +$22.1M / -$340K
function pnlUsd(n) {
  const a = Math.abs(Number(n) || 0);
  const s =
    a >= 1e9 ? `$${(a / 1e9).toFixed(1)}B`
    : a >= 1e6 ? `$${(a / 1e6).toFixed(1)}M`
    : a >= 1e3 ? `$${(a / 1e3).toFixed(0)}K`
    : `$${Math.round(a)}`;
  return (n < 0 ? "−" : "+") + s;
}
const WIN_LABEL = { "1d": "last 24h", "7d": "last 7 days", "30d": "last 30 days", all: "all-time" };
const WIN_SHORT = { "1d": "24h", "7d": "7d", "30d": "30d", all: "all-time" };

// ── SMART MONEY TAB ───────────────────────────────────────────────────
function renderSmartTab() {
  $("#whaleHero").innerHTML = `
    <h1>SMART <span class="accent">MONEY</span></h1>
    <p class="tagline">
      The <strong>most profitable wallets</strong> on Polymarket — ranked by real, settled profit —
      and every bet they place, <strong>the second they place it</strong>.
    </p>
    <div class="stat-strip">
      <div class="stat-cell pnl"><div class="lbl">#1 · <span id="smTopName">—</span></div><div class="val" id="smTop">—</div></div>
      <div class="stat-cell pnl"><div class="lbl">Top 50 Combined P&L</div><div class="val" id="smCombined">—</div></div>
      <div class="stat-cell alt"><div class="lbl">Profitable Wallets Tracked</div><div class="val" id="smTracked">—</div></div>
      <div class="stat-cell alt"><div class="lbl"><span class="live-pulse"><span class="dot"></span>Live Now</span></div><div class="val" id="smLive">—</div></div>
    </div>
  `;
  $("#tabHost").innerHTML = `
    <section class="panel">
      <div class="section-head">
        <h2>Most <span class="accent">Profitable</span> Wallets</h2>
        <div class="threshold-toggle" id="smWindowToggle">
          <button data-w="1d">24H</button>
          <button data-w="7d">7D</button>
          <button data-w="30d">30D</button>
          <button data-w="all" class="active">All-Time</button>
        </div>
        <div class="meta" id="smBoardMeta">loading…</div>
      </div>
      <div class="sm-board" id="smBoard">
        <div class="skel-row"></div><div class="skel-row"></div><div class="skel-row"></div>
      </div>
      <a class="hof-cta" href="/hall-of-fame.html">
        <span class="hof-cta-tag">🏛️ Hall of Fame</span>
        <span class="hof-cta-txt">The permanent all-time record — every profitable wallet, ranked &amp; remembered forever</span>
        <span class="hof-cta-arr">→</span>
      </a>
      <div class="kalshi-note">
        <b>Why Polymarket only?</b> It settles on-chain, so every wallet's profit is public and verifiable —
        that's how we can rank who is actually winning. Kalshi keeps trader identities and P&L private, so an
        honest leaderboard isn't possible there. We'd rather show real, provable names than fake a list.
      </div>
    </section>

    <section class="panel">
      <div class="section-head">
        <h2>Sharp <span class="accent">Alerts</span></h2>
        <div class="meta" id="smTapeMeta">loading…</div>
      </div>
      <div class="sm-alertbar">
        <div class="sm-ctls">
          <button class="sm-ctl" id="ctlBell" type="button"><span class="tgl"></span>Pop-ups</button>
          <button class="sm-ctl" id="ctlDesktop" type="button"><span class="tgl"></span>Desktop</button>
          <button class="sm-ctl" id="ctlSound" type="button"><span class="tgl"></span>Sound</button>
        </div>
        <div class="sm-thresh">
          <span class="sm-ctl-lbl">Pop when ≥</span>
          <div class="threshold-toggle" id="smPopToggle">
            <button data-min="0">Any</button>
            <button data-min="1000">$1K</button>
            <button data-min="10000">$10K</button>
            <button data-min="50000">$50K</button>
          </div>
        </div>
      </div>
      <div class="sm-windowbar">
        <span class="sm-ctl-lbl">Window</span>
        <div class="threshold-toggle" id="smFeedWindow">
          <button data-w="live" class="active">● Live</button>
          <button data-w="1m">1M</button>
          <button data-w="5m">5M</button>
          <button data-w="15m">15M</button>
          <button data-w="30m">30M</button>
          <button data-w="1h">1H</button>
          <button data-w="6h">6H</button>
          <button data-w="24h">24H</button>
          <button data-w="7d">7D</button>
          <button data-w="30d">30D</button>
        </div>
      </div>
      <div class="sm-tape" id="smTape">
        <div class="skel-row"></div><div class="skel-row"></div><div class="skel-row"></div>
      </div>
      <div class="sm-note">
        Every trade by a tracked profitable wallet, newest first — with a <b>pop-up the instant it lands</b>.
        Switch the window to replay the last 6h → 60d (full history fills in once the persistent store is connected).
      </div>
    </section>
  `;
  document.querySelectorAll("#smWindowToggle button").forEach((b) => {
    b.addEventListener("click", () => {
      state.smart.window = b.dataset.w;
      document.querySelectorAll("#smWindowToggle button").forEach((x) => x.classList.toggle("active", x === b));
      renderSmartBoard();
    });
  });
  // fresh live-alert session for this tab activation
  state.smart.alerts = new Map();
  state.smart.seen = new Set();
  state.smart.firstLoad = true;
  state.smart.feedWindow = "live";
  state.smart.kvTrades = null;
  ensureToastWrap();
  wireAlertControls();
  state.stopSmart = liveLoop(loadSmart, 4_000);
}

async function loadSmart() {
  try {
    const r = await fetch("/api/whales/smart-money");
    const data = await r.json();
    if (!r.ok) throw new Error(data?.detail || `HTTP ${r.status}`);
    state.smart.data = data;
    renderSmartStats(data.stats);
    renderSmartBoard();
    processAlerts(data.tape || []);
    renderAlertsFeed();
    paintSmSparks(); scheduleSmSparks();
  } catch (err) {
    const meta = $("#smBoardMeta"); if (meta) meta.textContent = "feed error";
    const b = $("#smBoard");
    if (b && !b.querySelector(".sm-row")) b.innerHTML = `<div class="empty"><strong>Smart-money feed offline.</strong><br>${escapeHtml(err.message)}</div>`;
  }
}

function renderSmartStats(s) {
  if (!s) return;
  const set = (id, v) => { const el = $("#" + id); if (el) el.textContent = v; };
  set("smTopName", s.top_name || "—");
  set("smTop", pnlUsd(s.top_pnl));
  set("smCombined", pnlUsd(s.top50_combined_pnl));
  set("smTracked", (s.tracked_wallets || 0).toLocaleString());
  set("smLive", (s.tape_matches || 0).toLocaleString());
}

function renderSmartBoard() {
  const data = state.smart.data; if (!data) return;
  const win = state.smart.window;
  const rows = data.windows?.[win] || [];
  const meta = $("#smBoardMeta");
  if (meta) meta.textContent = `top ${rows.length} by profit · ${WIN_LABEL[win]}`;
  const board = $("#smBoard"); if (!board) return;
  if (!rows.length) { board.innerHTML = `<div class="empty">No ranked wallets for this window yet.</div>`; return; }
  liveList(board, rows, { key: (w) => w.wallet, render: smRow });
}

function smRow(w) {
  const top = w.rank <= 3 ? ` top${w.rank}` : "";
  const av = w.image
    ? `<img src="${escapeAttr(w.image)}" alt="" loading="lazy">`
    : escapeHtml((w.name || w.wallet || "?")[0].toUpperCase());
  return `<a class="sm-row${top}" href="?wallet=${escapeAttr(w.wallet)}">
    <div class="sm-rank">${w.rank}</div>
    <div class="sm-av">${av}</div>
    <div class="sm-id"><div class="n">${escapeHtml(w.name || short(w.wallet, 8))}</div><div class="w">${short(w.wallet, 8)}</div></div>
    <div class="sm-pnl"><div class="v">${pnlUsd(w.pnl_usd)}</div><div class="l">profit</div></div>
  </a>`;
}

// ── Sharp-alert engine ────────────────────────────────────────────────
const WINDOW_MS = { "1m": 6e4, "5m": 3e5, "15m": 9e5, "30m": 18e5, "1h": 36e5, "6h": 216e5, "12h": 432e5, "24h": 864e5, "7d": 6048e5, "30d": 2592e6, "60d": 5184e6 };

function loadSharpPrefs() {
  const dflt = { enabled: true, sound: false, desktop: false, popMin: 1000 };
  try { return { ...dflt, ...(JSON.parse(localStorage.getItem(PREFS_KEY)) || {}) }; }
  catch { return dflt; }
}
function saveSharpPrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(state.smart.prefs)); } catch {}
}
const tradeKey = (t) => `${t.tx_hash || ""}-${t.timestamp}-${t.wallet}`;

// On each poll: fold new sharp trades into the session log, and fire pop-ups
// for any fresh trade at/above the chosen threshold. First load seeds silently.
function processAlerts(tape) {
  const sm = state.smart;
  const fresh = [];
  for (const t of tape) {
    const k = tradeKey(t);
    if (!sm.alerts.has(k)) sm.alerts.set(k, t);
    if (!sm.seen.has(k)) { sm.seen.add(k); fresh.push(t); }
  }
  if (sm.alerts.size > 500) {
    const sorted = [...sm.alerts.entries()].sort((a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0));
    for (let i = 0; i < sorted.length - 500; i++) sm.alerts.delete(sorted[i][0]);
  }
  if (sm.firstLoad) { sm.firstLoad = false; return; }
  if (!sm.prefs.enabled) return;
  const pops = fresh
    .filter((t) => (t.usd || 0) >= sm.prefs.popMin)
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  if (!pops.length) return;
  if (sm.prefs.sound) ping();
  pops.slice(0, 3).forEach((t) => { fireToast(t); fireDesktop(t); });
  if (pops.length > 3) fireToastMore(pops.length - 3);
}

function renderAlertsFeed() {
  const sm = state.smart;
  const w = sm.feedWindow;
  let rows;
  if (w === "live") {
    rows = [...sm.alerts.values()];
  } else {
    const cutoff = Date.now() - (WINDOW_MS[w] || 864e5);
    const map = new Map();
    for (const t of sm.kvTrades || []) map.set(tradeKey(t), t);
    for (const t of sm.alerts.values()) map.set(tradeKey(t), t);
    rows = [...map.values()].filter((t) => (Number(t.timestamp) || 0) * 1000 >= cutoff);
  }
  rows.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  const meta = $("#smTapeMeta");
  if (meta) {
    const src = w === "live" ? "live session" : sm.kvPersistent ? "stored history" : "session only";
    meta.innerHTML = `<span class="live-pulse"><span class="dot"></span></span> ${rows.length} sharp bet${rows.length === 1 ? "" : "s"} · ${src}`;
  }
  const tape = $("#smTape"); if (!tape) return;
  if (!rows.length) {
    const extra = w !== "live" && !sm.kvPersistent
      ? "<br><span style='opacity:.7'>Connect Vercel KV to replay the full window.</span>" : "";
    tape.innerHTML = `<div class="empty">No sharp bets in this window yet. They move constantly — sit tight.${extra}</div>`;
    return;
  }
  liveList(tape, rows.slice(0, 60), { key: tradeKey, render: smTapeRow });
}

function selectFeedWindow(w) {
  state.smart.feedWindow = w;
  document.querySelectorAll("#smFeedWindow button").forEach((x) => x.classList.toggle("active", x.dataset.w === w));
  if (w === "live") { state.smart.kvTrades = null; renderAlertsFeed(); return; }
  const meta = $("#smTapeMeta"); if (meta) meta.textContent = "loading window…";
  fetch(`/api/whales/sharp-feed?window=${w}`)
    .then((r) => r.json())
    .then((d) => { state.smart.kvTrades = d.trades || []; state.smart.kvPersistent = !!d.persistent; renderAlertsFeed(); })
    .catch(() => { state.smart.kvTrades = []; state.smart.kvPersistent = false; renderAlertsFeed(); });
}

function wireAlertControls() {
  const sm = state.smart;
  $("#ctlBell")?.addEventListener("click", () => { sm.prefs.enabled = !sm.prefs.enabled; saveSharpPrefs(); syncControlUI(); });
  $("#ctlSound")?.addEventListener("click", () => { sm.prefs.sound = !sm.prefs.sound; saveSharpPrefs(); syncControlUI(); if (sm.prefs.sound) ping(); });
  $("#ctlDesktop")?.addEventListener("click", async () => {
    if (!("Notification" in window)) { alert("This browser doesn't support desktop notifications."); return; }
    if (!sm.prefs.desktop) {
      const perm = await Notification.requestPermission();
      sm.prefs.desktop = perm === "granted";
      if (perm !== "granted") alert("Allow notifications for this site to get desktop pop-ups.");
    } else {
      sm.prefs.desktop = false;
    }
    saveSharpPrefs(); syncControlUI();
  });
  document.querySelectorAll("#smPopToggle button").forEach((b) =>
    b.addEventListener("click", () => { sm.prefs.popMin = Number(b.dataset.min); saveSharpPrefs(); syncControlUI(); }));
  document.querySelectorAll("#smFeedWindow button").forEach((b) =>
    b.addEventListener("click", () => selectFeedWindow(b.dataset.w)));
  syncControlUI();
}

function syncControlUI() {
  const p = state.smart.prefs;
  $("#ctlBell")?.classList.toggle("on", p.enabled);
  $("#ctlDesktop")?.classList.toggle("on", p.desktop);
  $("#ctlSound")?.classList.toggle("on", p.sound);
  document.querySelectorAll("#smPopToggle button").forEach((b) => b.classList.toggle("active", Number(b.dataset.min) === p.popMin));
}

// ── pop-up toasts + desktop notifications + sound ─────────────────────
function ensureToastWrap() {
  let w = document.getElementById("toastWrap");
  if (!w) { w = document.createElement("div"); w.id = "toastWrap"; w.className = "toast-wrap"; document.body.appendChild(w); }
  return w;
}
function toastEl(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function fireToast(t) {
  const wrap = ensureToastWrap();
  const av = t.image ? `<img src="${escapeAttr(t.image)}" alt="">` : escapeHtml((t.name || t.wallet || "?")[0].toUpperCase());
  const dir = t.side === "BUY" ? "buy" : "sell";
  const el = toastEl(`
    <div class="toast">
      <div class="toast-av">${av}</div>
      <div class="toast-body">
        <div class="toast-top"><span class="toast-name">${escapeHtml(t.name || short(t.wallet, 6))}</span><span class="toast-cred">#${t.cred_rank} ${WIN_SHORT[t.cred_window] || ""}</span></div>
        <div class="toast-act"><b class="${dir}">${t.side} ${escapeHtml(t.outcome || "")}</b> · ${fmtUsd(t.usd)}</div>
        <div class="toast-mkt">${escapeHtml((t.market_title || "").slice(0, 64))}</div>
      </div>
      <button class="toast-x" type="button" aria-label="dismiss">×</button>
    </div>`);
  const dismiss = () => { el.classList.remove("in"); el.classList.add("out"); setTimeout(() => el.remove(), 320); };
  el.querySelector(".toast-x").addEventListener("click", (e) => { e.stopPropagation(); dismiss(); });
  el.addEventListener("click", () => { location.href = `/whales.html?wallet=${t.wallet}`; });
  wrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add("in"));
  setTimeout(dismiss, 9000);
  while (wrap.children.length > 5) wrap.firstElementChild.remove();
}
function fireToastMore(n) {
  const wrap = ensureToastWrap();
  const el = toastEl(`<div class="toast toast-more">+${n} more sharp bet${n === 1 ? "" : "s"} just landed</div>`);
  el.addEventListener("click", () => el.remove());
  wrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add("in"));
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 320); }, 6000);
}
function fireDesktop(t) {
  const sm = state.smart;
  if (!sm.prefs.desktop || !("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const n = new Notification(`🐋 ${t.name || short(t.wallet, 6)} · #${t.cred_rank} ${WIN_SHORT[t.cred_window] || ""}`, {
      body: `${t.side} ${t.outcome || ""} · ${fmtUsd(t.usd)}\n${(t.market_title || "").slice(0, 80)}`,
      icon: t.image || "/favicon.svg",
      tag: tradeKey(t),
      silent: true,
    });
    n.onclick = () => { window.focus(); location.href = `/whales.html?wallet=${t.wallet}`; };
  } catch {}
}
let _audioCtx = null;
function ping() {
  try {
    _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (_audioCtx.state === "suspended") _audioCtx.resume();
    const o = _audioCtx.createOscillator(), g = _audioCtx.createGain();
    o.type = "sine"; o.frequency.value = 880;
    o.connect(g); g.connect(_audioCtx.destination);
    g.gain.setValueAtTime(0.0001, _audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.09, _audioCtx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, _audioCtx.currentTime + 0.22);
    o.start(); o.stop(_audioCtx.currentTime + 0.22);
  } catch {}
}

function smTapeRow(t) {
  const dir = t.side === "BUY" ? "buy" : "sell";
  const av = t.image
    ? `<img src="${escapeAttr(t.image)}" alt="" loading="lazy">`
    : escapeHtml((t.name || t.wallet || "?")[0].toUpperCase());
  const cred = `<span class="rk">#${t.cred_rank} ${WIN_SHORT[t.cred_window] || ""}</span> · <span class="pnl">${pnlUsd(t.cred_pnl)}</span>`;
  return `<a class="sm-tape-row" href="?wallet=${escapeAttr(t.wallet)}">
    <div class="sm-tw">
      <div class="sm-tav">${av}</div>
      <div class="sm-tid"><div class="n">${escapeHtml(t.name || short(t.wallet, 6))}</div><div class="sm-cred">${cred}</div></div>
    </div>
    <div class="sm-tmkt">
      <div class="sm-tmkt-q" title="${escapeAttr(t.market_title || "")}">${escapeHtml((t.market_title || "").slice(0, 72))}</div>
      <div class="sm-tspark" data-pm="${escapeAttr(t.asset || "")}"></div>
    </div>
    <div class="sm-tact ${dir}">${t.side} ${escapeHtml(t.outcome || "")}</div>
    <div class="sm-tamt"><div class="v">${fmtUsd(t.usd)}</div><div class="t">${fmtAgo(t.timestamp)} ago · ${(t.price * 100).toFixed(0)}¢</div></div>
  </a>`;
}

// ── price-action sparklines on the sharp tape (Polymarket prices-history) ──
function smSparkPath(series, w, h, pad) {
  const min = Math.min(...series), max = Math.max(...series), range = (max - min) || 0.02, n = series.length;
  const X = (i) => pad + (n === 1 ? 0 : (i / (n - 1)) * (w - 2 * pad));
  const Y = (v) => h - pad - ((v - min) / range) * (h - 2 * pad);
  let d = "";
  series.forEach((v, i) => { d += (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1) + " "; });
  return { d, lastX: X(n - 1), lastY: Y(series[n - 1]) };
}
function smMv(delta) {
  if (!delta) return `<span class="sm-mv flat">● flat</span>`;
  const up = delta > 0;
  return `<span class="sm-mv ${up ? "up" : "down"}">${up ? "▲ +" : "▼ "}${delta}¢ · 24h</span>`;
}
function smSparkSvg(series, delta) {
  const w = 120, h = 22, pad = 2;
  const col = delta > 0 ? "var(--green)" : delta < 0 ? "var(--red)" : "var(--muted)";
  const { d, lastX, lastY } = smSparkPath(series, w, h, pad);
  return `<svg class="sm-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="${col}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="1.8" fill="${col}"/></svg>`;
}
function paintSmSparks() {
  const sp = state.smart.spark || {};
  document.querySelectorAll(".sm-tspark[data-pm]").forEach((el) => {
    const a = el.getAttribute("data-pm"), s = a && sp[a];
    el.innerHTML = (s && s.series.length >= 2) ? smSparkSvg(s.series, s.delta) + smMv(s.delta) : "";
  });
}
let _smSparkAt = 0, _smSparkSig = "";
function scheduleSmSparks() {
  const assets = [...new Set([...document.querySelectorAll(".sm-tspark[data-pm]")].map((e) => e.getAttribute("data-pm")).filter(Boolean))].slice(0, 16);
  if (!assets.length) return;
  const sig = assets.join(","), now = Date.now();
  if (sig === _smSparkSig && now - _smSparkAt < 15000) return; // nothing new + still fresh
  _smSparkSig = sig; _smSparkAt = now;
  loadSmSparks(assets);
}
async function loadSmSparks(assets) {
  try {
    const r = await fetch("/api/spark?pm=" + encodeURIComponent(assets.join(",")));
    const d = await r.json();
    state.smart.spark = Object.assign(state.smart.spark || {}, d.pm || {});
    paintSmSparks();
  } catch {}
}

// ── LIVE ACTION TAB (firehose + active-whale leaderboard) ─────────────
function renderLiveTab() {
  $("#whaleHero").innerHTML = `
    <h1>WHALE <span class="accent">RADAR</span></h1>
    <p class="tagline">
      Every <strong>>$${(state.threshold).toLocaleString()}</strong> Polymarket trade. Live.
      Plus a leaderboard of <strong>active whales</strong> right now. Click any wallet to drill into their book.
    </p>
    <div class="stat-strip" id="statStrip">
      <div class="stat-cell"><div class="lbl">Active Wallets</div><div class="val" id="statActive">—</div></div>
      <div class="stat-cell alt"><div class="lbl">Whale Volume / window</div><div class="val" id="statVol">—</div></div>
      <div class="stat-cell"><div class="lbl">Biggest Trade</div><div class="val" id="statBiggest">—</div></div>
      <div class="stat-cell alt"><div class="lbl">Refreshes</div><div class="val" id="statRefresh">30s</div></div>
    </div>
  `;
  $("#tabHost").innerHTML = `
    <section class="panel">
      <div class="section-head">
        <h2>Live <span class="accent">Firehose</span></h2>
        <div class="threshold-toggle" id="thresholdToggle">
          <button data-min="1000">$1K+</button>
          <button data-min="5000" class="active">$5K+</button>
          <button data-min="10000">$10K+</button>
          <button data-min="25000">$25K+</button>
        </div>
        <div class="meta" id="fhMeta">loading…</div>
      </div>
      <div class="firehose-list" id="fhList">
        <div class="skel-row"></div><div class="skel-row"></div><div class="skel-row"></div>
      </div>
    </section>

    <section class="panel">
      <div class="section-head">
        <h2>Active <span class="accent">Whales</span></h2>
        <div class="meta" id="lbMeta">loading…</div>
      </div>
      <div class="lb-table" id="lbTable">
        <div class="h">#</div>
        <div class="h"></div>
        <div class="h">Trader</div>
        <div class="h" style="justify-content:flex-end">Volume</div>
        <div class="h hide-mobile" style="justify-content:flex-end">Portfolio</div>
        <div class="h hide-mobile" style="justify-content:flex-end">Trades</div>
      </div>
    </section>
  `;
  document.querySelectorAll("#thresholdToggle button").forEach((b) => {
    b.classList.toggle("active", Number(b.dataset.min) === state.threshold);
    b.addEventListener("click", () => {
      state.threshold = Number(b.dataset.min);
      document.querySelectorAll("#thresholdToggle button").forEach((x) => x.classList.toggle("active", x === b));
      $("#fhList").innerHTML = `<div class="skel-row"></div><div class="skel-row"></div>`;
      state.seenTradeKeys = new Set();
      loadFirehose();
    });
  });
  loadFirehose();
  loadLeaderboard();
  state.refreshTimer = setInterval(() => { loadFirehose(); loadLeaderboard(); }, 30_000);
}

async function loadFirehose() {
  try {
    const r = await fetch(`/api/whales/firehose?min=${state.threshold}&limit=40`);
    const data = await r.json();
    if (!r.ok) throw new Error(data?.detail || `HTTP ${r.status}`);
    renderFirehose(data);
  } catch (err) {
    $("#fhMeta").textContent = "feed error";
    $("#fhList").innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
  }
}

function renderFirehose(data) {
  const list = $("#fhList");
  const trades = data.trades || [];
  $("#fhMeta").textContent = `${trades.length} trades · ≥${fmtUsd(data.threshold_usd)} · ${new Date(data.fetched_at).toLocaleTimeString()}`;

  if (!trades.length) {
    list.innerHTML = `
      <div class="empty">
        No whale trades ≥${fmtUsd(data.threshold_usd)} in the last ${data.window_size} matched trades.
        <br>Try a <strong>lower threshold</strong> or wait — quiet markets clear in minutes.
      </div>`;
    return;
  }

  // Highlight new entries on refresh
  const html = trades
    .map((t) => {
      const key = `${t.tx_hash || ""}-${t.timestamp}-${t.wallet}`;
      const isNew = state.seenTradeKeys.size > 0 && !state.seenTradeKeys.has(key);
      return `
        <div class="fh-row${isNew ? " new" : ""}" data-wallet="${escapeAttr(t.wallet)}">
          <div class="fh-avatar">
            ${t.profile_image ? `<img src="${escapeAttr(t.profile_image)}" alt="">` : escapeHtml((t.name || t.wallet)[0].toUpperCase())}
          </div>
          <div class="fh-who">
            <div class="name">${escapeHtml(t.name || short(t.wallet, 6))}</div>
            <div class="wallet">${short(t.wallet, 6)}</div>
          </div>
          <div class="fh-action ${t.side === "BUY" ? "buy" : "sell"}">${t.side} ${escapeHtml(t.outcome || "")}</div>
          <div class="fh-market" title="${escapeAttr(t.market_title || "")}">${escapeHtml((t.market_title || "").slice(0, 80))}</div>
          <div>
            <div class="fh-amount">${fmtUsd(t.usd)}</div>
            <div class="fh-time" style="text-align:right">${fmtAgo(t.timestamp)} ago · ${(t.price * 100).toFixed(1)}¢</div>
          </div>
        </div>
      `;
    })
    .join("");
  list.innerHTML = html;
  trades.forEach((t) => state.seenTradeKeys.add(`${t.tx_hash || ""}-${t.timestamp}-${t.wallet}`));

  list.querySelectorAll(".fh-row").forEach((row) => {
    row.addEventListener("click", () => {
      location.search = `?wallet=${row.dataset.wallet}`;
    });
  });
}

async function loadLeaderboard() {
  try {
    const r = await fetch(`/api/whales/leaderboard?limit=20`);
    const data = await r.json();
    if (!r.ok) throw new Error(data?.detail || `HTTP ${r.status}`);
    renderLeaderboard(data);
  } catch (err) {
    $("#lbMeta").textContent = "feed error";
  }
}

function renderLeaderboard(data) {
  const whales = data.whales || [];
  $("#lbMeta").textContent = `top ${whales.length} of ${data.total_active_wallets} active · last ${data.window_size} trades`;

  // Stats from leaderboard
  const totalVol = whales.reduce((s, w) => s + w.total_usd, 0);
  const biggest = whales.reduce((max, w) => Math.max(max, w.biggest_usd || 0), 0);
  $("#statActive").textContent = (data.total_active_wallets || 0).toLocaleString();
  $("#statVol").textContent = fmtUsd(totalVol);
  $("#statBiggest").textContent = fmtUsd(biggest);

  const table = $("#lbTable");
  // Keep header, replace rows
  const headerCells = 6;
  while (table.children.length > headerCells) table.removeChild(table.lastChild);

  if (!whales.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.style.gridColumn = "1 / -1";
    empty.textContent = "No active whales right now.";
    table.appendChild(empty);
    return;
  }

  whales.forEach((w, i) => {
    const row = document.createElement("div");
    row.className = "lb-row";
    row.innerHTML = `
      <div class="lb-rank">#${i + 1}</div>
      <div class="lb-avatar">
        ${w.profile_image ? `<img src="${escapeAttr(w.profile_image)}" alt="">` : escapeHtml((w.name || w.wallet)[0].toUpperCase())}
      </div>
      <div class="lb-name">
        <div class="name">${escapeHtml(w.name || short(w.wallet, 8))}</div>
        <div class="wallet">${short(w.wallet, 8)} · last: ${escapeHtml((w.last_market || "").slice(0, 40))}</div>
      </div>
      <div class="lb-num bright">${fmtUsd(w.total_usd)}</div>
      <div class="lb-num hide-mobile">${w.portfolio_usd == null ? "—" : fmtUsd(w.portfolio_usd)}</div>
      <div class="lb-num hide-mobile">${w.trade_count} · ${w.unique_markets}m</div>
    `;
    row.addEventListener("click", () => {
      location.search = `?wallet=${w.wallet}`;
    });
    table.appendChild(row);
  });
}

// ── WALLET DETAIL ─────────────────────────────────────────────────────
function renderWalletShell(wallet) {
  main.innerHTML = `
    <section class="panel">
      <a href="/whales.html" class="back-link">← All Whales</a>
      <div id="walletBody">
        <div class="skel-row" style="height:120px;margin-bottom:16px"></div>
        <div class="skel-row" style="height:80px"></div>
      </div>
    </section>
  `;
}

async function loadWallet(wallet) {
  try {
    const r = await fetch(`/api/whales/wallet?user=${encodeURIComponent(wallet)}`);
    const data = await r.json();
    if (!r.ok) throw new Error(data?.detail || `HTTP ${r.status}`);
    renderWallet(data);
  } catch (err) {
    $("#walletBody").innerHTML = `<div class="empty">Failed to load wallet: ${escapeHtml(err.message)}</div>`;
  }
}

// EAGLE EYE for a single wallet — its recent off-Polymarket on-chain moves.
async function loadWalletEagle(wallet) {
  const board = $("#eeWalletBoard");
  const meta = $("#eeWalletMeta");
  try {
    const r = await fetch(`/api/whales/eagle-eye?wallet=${encodeURIComponent(wallet)}`);
    const d = await r.json();
    if (!board) return;
    if (!r.ok) throw new Error(d?.detail || `HTTP ${r.status}`);
    if (meta) meta.textContent = `${d.count} move${d.count === 1 ? "" : "s"} · ${d.etherscan ? "multichain" : "Polygon USDC.e scan"}`;
    if (!d.events.length) {
      board.innerHTML = `<div class="empty">No off-Polymarket moves detected${d.etherscan ? "" : " in the key-free Polygon scan"}.</div>`;
      return;
    }
    board.innerHTML = d.events.map(eagleRow).join("");
  } catch (err) {
    if (meta) meta.textContent = "scan unavailable";
    if (board) board.innerHTML = `<div class="empty">On-chain scan unavailable right now.</div>`;
  }
}

// Update <title>, og:image, og:title etc so every share of a specific wallet
// URL renders the branded whale OG card with this wallet's stats baked in.
function updateMetaForWallet(data, { name }) {
  const { wallet, summary } = data;
  const value = fmtUsd(summary.total_value);
  const positions = summary.open_positions ?? 0;
  const pnl = summary.total_unrealized_pnl ?? 0;
  const pnlStr = pnl > 0 ? `+${fmtUsd(pnl)}` : pnl < 0 ? fmtUsd(pnl) : "$0";
  const title = `${name} · $EDGE Whale`;
  document.title = title;
  const ogUrl =
    `${location.origin}/api/og?surface=whale` +
    `&name=${encodeURIComponent(name)}` +
    `&value=${encodeURIComponent(value)}` +
    `&positions=${positions}` +
    `&pnl=${encodeURIComponent(pnlStr)}` +
    `&pnlnum=${Math.round(pnl)}`;
  document.getElementById("ogTitle")?.setAttribute("content", title);
  document.getElementById("ogImage")?.setAttribute("content", ogUrl);
  document.getElementById("twImage")?.setAttribute("content", ogUrl);
  document.getElementById("ogDesc")?.setAttribute(
    "content",
    `${value} portfolio · ${positions} open positions · ${pnlStr} unrealized · live on Polymarket`
  );
}

function renderWallet(data) {
  const { wallet, identity, summary, positions, trades, errors } = data;
  const name = identity?.name || short(wallet, 8);
  const pseudo = identity?.pseudonym;
  const pic = identity?.profile_image;
  const bio = identity?.bio;

  const upnlCls = summary.total_unrealized_pnl > 0 ? "pos" : summary.total_unrealized_pnl < 0 ? "neg" : "";
  const rpnlCls = summary.total_realized_pnl > 0 ? "pos" : summary.total_realized_pnl < 0 ? "neg" : "";
  const winRate =
    summary.open_positions > 0
      ? Math.round((summary.winning_positions / summary.open_positions) * 100)
      : null;

  // Update page metadata so every share of this wallet URL gets the branded
  // whale OG card with this specific wallet's stats baked in.
  updateMetaForWallet(data, { name, winRate });

  $("#walletBody").innerHTML = `
    ${errors ? `<div class="empty" style="border-color:var(--red);color:var(--red);margin-bottom:16px">Partial data — failed sources: ${escapeHtml(Object.keys(errors).join(", "))}</div>` : ""}
    <div class="wallet-head">
      <div class="wallet-avatar">
        ${pic ? `<img src="${escapeAttr(pic)}" alt="">` : escapeHtml(name[0].toUpperCase())}
      </div>
      <div class="wallet-meta">
        <div class="name">${escapeHtml(name)}</div>
        ${pseudo ? `<div class="pseudonym">aka ${escapeHtml(pseudo)}</div>` : ""}
        <div class="addr">
          <code>${escapeHtml(wallet)}</code>
          <button class="btn-copy" data-copy="${escapeAttr(wallet)}">Copy</button>
          <a href="https://polymarket.com/profile/${escapeAttr(wallet)}" target="_blank" rel="noopener" style="color:var(--lime);text-decoration:none;font-size:11px">View on Polymarket ↗</a>
        </div>
        ${bio ? `<div class="bio">${escapeHtml(bio)}</div>` : ""}
      </div>
    </div>

    <div class="summary-grid">
      <div class="summary-cell"><div class="lbl">Portfolio Value</div><div class="val">${fmtUsdExact(summary.total_value)}</div></div>
      <div class="summary-cell"><div class="lbl">Open Positions</div><div class="val">${summary.open_positions}</div></div>
      <div class="summary-cell"><div class="lbl">Unrealized P&L</div><div class="val ${upnlCls}">${fmtUsdExact(summary.total_unrealized_pnl)}</div></div>
      <div class="summary-cell"><div class="lbl">Realized P&L</div><div class="val ${rpnlCls}">${fmtUsdExact(summary.total_realized_pnl)}</div></div>
      <div class="summary-cell"><div class="lbl">Win Rate (open)</div><div class="val">${winRate == null ? "—" : winRate + "%"}</div></div>
      <div class="summary-cell"><div class="lbl">W / L</div><div class="val"><span class="pos">${summary.winning_positions}</span> / <span class="neg">${summary.losing_positions}</span></div></div>
    </div>

    <div class="section-head">
      <h2>Positions <span class="accent">${positions.length}</span></h2>
      <div class="meta">sorted by current value</div>
    </div>
    ${positions.length ? `
      <div class="pos-table">
        <div class="h">Market</div>
        <div class="h" style="justify-content:flex-end">Size</div>
        <div class="h" style="justify-content:flex-end">Avg → Cur</div>
        <div class="h" style="justify-content:flex-end">Value</div>
        <div class="h" style="justify-content:flex-end">P&L</div>
        ${positions
          .slice(0, 25)
          .map((p) => {
            const pnlCls = p.cash_pnl > 0 ? "pos" : p.cash_pnl < 0 ? "neg" : "";
            const outcomeCls = p.outcome_index === 0 ? "pos" : "neg";
            return `
              <div class="title">
                <div>
                  <span class="market">${escapeHtml((p.market_title || "").slice(0, 80))}</span>
                  <span class="outcome">
                    <span class="outcome-pill ${outcomeCls}">${escapeHtml(p.outcome || "")}</span>
                    ${p.market_slug ? `· <a href="${polymarketMarketUrl(p.market_slug)}" target="_blank" rel="noopener" style="color:var(--muted);text-decoration:none;border-bottom:1px dashed var(--border)">market ↗</a>` : ""}
                  </span>
                </div>
              </div>
              <div class="num">${p.size.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
              <div class="num">${(p.avg_price * 100).toFixed(1)}¢ → ${(p.cur_price * 100).toFixed(1)}¢</div>
              <div class="num">${fmtUsd(p.current_value)}</div>
              <div class="num ${pnlCls}">${fmtUsd(p.cash_pnl)} (${fmtPct(p.percent_pnl)})</div>
            `;
          })
          .join("")}
      </div>
    ` : `<div class="empty">No open positions.</div>`}

    <div class="section-head" style="margin-top:32px">
      <h2>Recent <span class="accent">Trades</span></h2>
      <div class="meta">last ${trades.length}</div>
    </div>
    ${trades.length ? `
      <div class="trade-list">
        <div class="h">Side</div>
        <div class="h">Market</div>
        <div class="h" style="justify-content:flex-end">Price</div>
        <div class="h" style="justify-content:flex-end">Value</div>
        <div class="h" style="justify-content:flex-end">When</div>
        ${trades.map((t) => `
          <div class="${t.side === "BUY" ? "pos" : "neg"}" style="font-weight:600">${t.side} ${escapeHtml(t.outcome || "")}</div>
          <div>${escapeHtml((t.market_title || "").slice(0, 70))}</div>
          <div class="num">${(t.price * 100).toFixed(1)}¢</div>
          <div class="num">${fmtUsd(t.usd)}</div>
          <div class="num">${fmtAgo(t.timestamp)} ago</div>
        `).join("")}
      </div>
    ` : `<div class="empty">No recent trades.</div>`}

    <div class="section-head" style="margin-top:32px">
      <h2>🦅 Eagle <span class="accent">Eye</span> · Off-Polymarket</h2>
      <div class="meta" id="eeWalletMeta">scanning chain…</div>
    </div>
    <div class="ee-board" id="eeWalletBoard">
      <div class="skel-row"></div><div class="skel-row"></div>
    </div>
  `;

  loadWalletEagle(wallet);

  document.querySelectorAll(".btn-copy").forEach((b) => {
    b.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(b.dataset.copy);
        const orig = b.textContent;
        b.textContent = "Copied ✓";
        setTimeout(() => (b.textContent = orig), 1200);
      } catch {}
    });
  });
}

// ── boot ──────────────────────────────────────────────────────────────
route();
window.addEventListener("popstate", route);
