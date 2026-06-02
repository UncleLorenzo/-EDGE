// $EDGE Dashboard — command center frontend.
// Four panels, each refreshing independently from its own endpoint.
import { fmtUsd, fmtAgo, short, escapeHtml, escapeAttr } from "/lib/client/format.js";
import { liveList, liveLoop } from "/lib/client/live.js";
import { createPolyStream } from "/lib/client/polyws.js";
import { analyzeMomentum, sparkSvg } from "/lib/client/momentum.js";
import { convictionScore } from "/lib/client/conviction.js";

const $ = (sel, root = document) => root.querySelector(sel);

// Refresh intervals tuned to source freshness:
//   markets    — Polymarket/Kalshi pricing moves quickly; 25s
//   whales     — whale firehose flashes constantly; 20s
//   buzz       — chatter rolls in slower; 45s
//   news       — RSS feeds publish hourly-ish; 60s
const INTERVALS = {
  markets: 5_000, // prices tick fast — poll every 5s
  whales: 5_000,  // firehose flashes constantly
  buzz: 15_000,
  news: 45_000,
};

const STALE_AFTER = 90_000; // turn refresh dot amber after this many ms
const DEAD_AFTER = 180_000; // turn red after this

const lastFetchedAt = { markets: 0, whales: 0, buzz: 0, news: 0 };

// ── HOT MARKETS (cross-platform, filterable, movement-aware) ──────────
let allMarkets = [];
let marketFilter = "all"; // all | movers | poly | kalshi

function renderMarkets() {
  const body = $("#bodyMarkets");
  if (!body) return;
  let list = allMarkets.slice();
  if (marketFilter === "poly") list = list.filter((m) => m.source === "polymarket");
  else if (marketFilter === "kalshi") list = list.filter((m) => m.source === "kalshi");
  else if (marketFilter === "movers")
    list.sort((a, b) => Math.abs(b.price_change_24h || 0) - Math.abs(a.price_change_24h || 0));
  list = list.slice(0, marketFilter === "movers" ? 16 : 14);
  if (!list.length) { body.innerHTML = `<div class="empty">No markets in this view.</div>`; return; }
  liveList(body, list, { key: (m) => m.id, render: renderMarketRow });
}

// Filter chips — switch the market lens (delegated; chips are static markup)
document.addEventListener("click", (e) => {
  const chip = e.target.closest(".mkt-chip");
  if (!chip) return;
  marketFilter = chip.dataset.f || "all";
  document.querySelectorAll(".mkt-chip").forEach((c) => c.classList.toggle("active", c === chip));
  renderMarkets();
});

// ── Polymarket live price stream (sub-second WebSocket) ───────────────
// Patches market prices between 5s polls and flashes the changed row, so the
// odds tick in real time instead of every 5s. Polling stays the source of truth.
const tokenIndex = new Map(); // token id -> { market, side }
let _renderQueued = false;
function queueMarketRender() {
  if (_renderQueued) return;
  _renderQueued = true;
  setTimeout(() => { _renderQueued = false; renderMarkets(); }, 250);
}
const polyStream = createPolyStream((token, price) => {
  const hit = tokenIndex.get(token);
  if (!hit) return;
  const m = hit.market;
  const cur = hit.side === "yes" ? m.yes_price : m.no_price;
  if (Math.abs((Number(cur) || 0) - price) < 0.002) return; // ignore micro-noise
  if (hit.side === "yes") { m.yes_price = price; m.no_price = 1 - price; }
  else { m.no_price = price; m.yes_price = 1 - price; }
  queueMarketRender();
});
function refreshStream() {
  tokenIndex.clear();
  const tokens = [];
  for (const m of allMarkets.filter((x) => x.source === "polymarket").slice(0, 25)) {
    if (m.yes_token) { tokenIndex.set(String(m.yes_token), { market: m, side: "yes" }); tokens.push(String(m.yes_token)); }
    if (m.no_token) { tokenIndex.set(String(m.no_token), { market: m, side: "no" }); tokens.push(String(m.no_token)); }
  }
  polyStream.setTokens(tokens);
}

async function loadMarkets() {
  const dot = $("#dotMarkets");
  const meta = $("#metaMarkets");
  const body = $("#bodyMarkets");
  try {
    const r = await fetch("/api/markets");
    const data = await r.json();
    if (!r.ok) throw new Error(data?.detail || `HTTP ${r.status}`);

    lastFetchedAt.markets = Date.now();
    allMarkets = data.markets || [];
    renderMarkets();
    refreshStream();
    meta.textContent = `${allMarkets.length} · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
    updateGlobalStats(data);
  } catch (err) {
    meta.textContent = "error";
    body.innerHTML = `<div class="empty">${escapeHtml(err.message || "failed")}</div>`;
  }
}

function renderMarketRow(m) {
  const isPoly = m.source === "polymarket";
  // Route through our internal /market.html so we capture intent + serve the
  // affiliate-wrapped Trade CTA from a $EDGE-branded page rather than
  // sending users straight off-site to Polymarket / Kalshi.
  const url = m.slug ? `/market.html?slug=${encodeURIComponent(m.slug)}` : "#";
  const yes = (Number(m.yes_price) || 0) * 100;
  const no = (Number(m.no_price) || 0) * 100;
  return `
    <div class="row market-row" data-url="${escapeAttr(url)}">
      <div>
        <div class="market-title">${escapeHtml(m.title || "")}</div>
        <div class="market-meta">
          <span class="badge ${isPoly ? "poly" : "kalshi"}">${isPoly ? "POLY" : "KALSHI"}</span>
          <span>${escapeHtml(m.category || "")}</span>
          ${renderMove(m.price_change_24h)}
        </div>
      </div>
      <div class="market-odds">
        <div><span class="yes">${yes.toFixed(0)}¢</span><span class="v">yes</span></div>
        <div><span class="no">${no.toFixed(0)}¢</span><span class="v">no</span></div>
      </div>
      <div class="market-vol">${fmtUsd(m.volume_24h)}<span class="v">vol 24h</span></div>
    </div>
  `;
}

// 24h price movement chip — the alpha signal traders scan for.
function renderMove(ch) {
  const pp = Math.abs(Number(ch) || 0) * 100;
  if (pp < 0.5) return "";
  const up = (Number(ch) || 0) > 0;
  return `<span class="mv ${up ? "up" : "dn"}">${up ? "▲" : "▼"}${pp.toFixed(pp >= 10 ? 0 : 1)}</span>`;
}

// ── WHALE FIREHOSE ────────────────────────────────────────────────────
async function loadWhales() {
  const meta = $("#metaWhales");
  const body = $("#bodyWhales");
  // Try descending thresholds so the panel never goes dead during quiet
  // markets. Each tier is the threshold + the label we show in the meta.
  const tiers = [
    { min: 5000, label: "≥$5K" },
    { min: 1000, label: "≥$1K" },
    { min: 100, label: "≥$100" },
    { min: 0, label: "all" },
  ];
  try {
    let trades = [];
    let activeLabel = "";
    for (const t of tiers) {
      const r = await fetch(`/api/whales/firehose?min=${t.min}&limit=20`);
      const data = await r.json();
      if (!r.ok) throw new Error(data?.detail || `HTTP ${r.status}`);
      if ((data.trades || []).length) {
        trades = data.trades;
        activeLabel = t.label;
        break;
      }
    }
    lastFetchedAt.whales = Date.now();
    if (!trades.length) {
      body.innerHTML = `<div class="empty">No trades in current window.<br>Polymarket activity at zero — extremely rare.</div>`;
      meta.textContent = "0 trades";
      return;
    }
    liveList(body, trades, { key: (t) => `${t.wallet}|${t.market_title}|${t.side}|${t.usd}`, render: renderWhaleRow });
    meta.textContent = `${trades.length} · ${activeLabel} · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } catch (err) {
    meta.textContent = "error";
    body.innerHTML = `<div class="empty">${escapeHtml(err.message || "failed")}</div>`;
  }
}

function renderWhaleRow(t) {
  const sideCls = t.side === "BUY" ? "buy" : "sell";
  const initial = (t.name || t.wallet || "?")[0].toUpperCase();
  return `
    <div class="row whale-row" data-wallet="${escapeAttr(t.wallet)}">
      <div class="whale-avatar">${
        t.profile_image
          ? `<img src="${escapeAttr(t.profile_image)}" alt="">`
          : escapeHtml(initial)
      }</div>
      <div class="whale-who">
        <div class="name">${escapeHtml(t.name || short(t.wallet, 6))}</div>
        <div class="meta">
          <span class="side ${sideCls}">${t.side} ${escapeHtml(t.outcome || "")}</span>
          <span>·</span>
          <span>${escapeHtml((t.market_title || "").slice(0, 50))}</span>
        </div>
      </div>
      <div class="whale-amount">${fmtUsd(t.usd)}</div>
    </div>
  `;
}

// ── BUZZ HEAT INDEX ───────────────────────────────────────────────────
async function loadBuzz() {
  const meta = $("#metaBuzz");
  const body = $("#bodyBuzz");
  try {
    const r = await fetch("/api/buzz/markets?limit=12");
    const data = await r.json();
    if (!r.ok) throw new Error(data?.detail || `HTTP ${r.status}`);

    lastFetchedAt.buzz = Date.now();
    const markets = data.markets || [];
    if (!markets.length) {
      body.innerHTML = `<div class="empty">No active chatter detected.</div>`;
      meta.textContent = "0 markets";
      return;
    }
    liveList(body, markets, { key: (m) => m.market_url || m.title, render: renderBuzzRow });
    meta.textContent = `${markets.length} · ${data.counts.threads_matched}/${data.counts.threads_total} matched`;
    $("#globalBuzz").textContent = data.counts.threads_matched.toLocaleString();
    $("#globalBuzzSub").textContent = `of ${data.counts.threads_total} threads`;
  } catch (err) {
    meta.textContent = "error";
    body.innerHTML = `<div class="empty">${escapeHtml(err.message || "failed")}</div>`;
  }
}

function renderBuzzRow(m) {
  const url = m.market_url || "#";
  return `
    <div class="row buzz-row" data-url="${escapeAttr(url)}">
      <div>
        <div class="title">${escapeHtml(m.title || "")}</div>
        <div class="meta">${m.thread_count} threads · ${m.unique_sources.length} sources · ${m.total_upvotes} upvotes</div>
      </div>
      <div class="buzz-heat">${m.heat}<span class="lbl">heat</span></div>
    </div>
  `;
}

// ── BREAKING NEWS ─────────────────────────────────────────────────────
// Sources: news (RSS) + hn. Pulled from /api/buzz/feed filtered client-side.
async function loadNews() {
  const meta = $("#metaNews");
  const body = $("#bodyNews");
  try {
    const r = await fetch("/api/buzz/feed?limit=80&matched=0");
    const data = await r.json();
    if (!r.ok) throw new Error(data?.detail || `HTTP ${r.status}`);

    lastFetchedAt.news = Date.now();
    const news = (data.threads || [])
      .filter((t) => t.source === "news" || t.source === "hn")
      .slice(0, 18);
    if (!news.length) {
      body.innerHTML = `<div class="empty">No fresh news in window.</div>`;
      meta.textContent = "0";
      return;
    }
    liveList(body, news, { key: (t) => t.url || t.title, render: renderNewsRow });
    meta.textContent = `${news.length} · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } catch (err) {
    meta.textContent = "error";
    body.innerHTML = `<div class="empty">${escapeHtml(err.message || "failed")}</div>`;
  }
}

function renderNewsRow(t) {
  const outlet = t.source === "hn" ? "HN · FRONT PAGE" : (t.subsource || "NEWS").toUpperCase();
  const match = t.matches && t.matches[0];
  return `
    <div class="row news-row" data-url="${escapeAttr(t.url)}">
      <div class="outlet">${escapeHtml(outlet)}</div>
      <div class="headline">${escapeHtml(t.title || "")}</div>
      <div class="meta-foot">
        <span>${fmtAgo(t.created_at)} ago</span>
        ${t.score ? `<span>▲ ${t.score}</span>` : ""}
        ${
          match
            ? `<span class="matched-pill"><span class="market">${escapeHtml(match.title.slice(0, 40))}</span><span style="color:var(--lime)">${Math.round(match.score * 100)}%</span></span>`
            : ""
        }
      </div>
    </div>
  `;
}

// ── GLOBAL STATS (from markets endpoint) ──────────────────────────────
function updateGlobalStats(data) {
  if (!data || !data.stats) return;
  const s = data.stats;
  $("#globalVolume").textContent = fmtUsd(s.total_volume_24h);
  $("#globalMarkets").textContent = s.total_markets ?? "—";
  $("#globalMarketsSub").innerHTML = `<span class="pos">${s.by_source?.polymarket || 0}</span> poly · <span class="pos">${s.by_source?.kalshi || 0}</span> kalshi`;
}

// ── refresh state indicator ──────────────────────────────────────────
function updateRefreshDots() {
  const now = Date.now();
  for (const [name, lastAt] of Object.entries(lastFetchedAt)) {
    const dot = $(`#dot${name[0].toUpperCase() + name.slice(1)}`);
    if (!dot) continue;
    if (!lastAt) {
      dot.classList.add("dead");
      continue;
    }
    const age = now - lastAt;
    dot.classList.toggle("stale", age >= STALE_AFTER && age < DEAD_AFTER);
    dot.classList.toggle("dead", age >= DEAD_AFTER);
    if (age < STALE_AFTER) dot.classList.remove("stale", "dead");
  }
  const newest = Math.max(...Object.values(lastFetchedAt));
  $("#lastPulse").textContent = newest ? fmtAgo(Math.floor(newest / 1000)) : "—";
}

// ── click delegation (avoid attaching listeners on every refresh) ────
document.addEventListener("click", (e) => {
  const row = e.target.closest("[data-wallet]");
  if (row) {
    location.href = `/whales.html?wallet=${row.dataset.wallet}`;
    return;
  }
  const link = e.target.closest("[data-url]");
  if (link) {
    const url = link.dataset.url;
    if (!url || url === "#") return;
    // Internal links (start with /) — in-tab navigation feels native.
    // External (Polymarket / Kalshi / news articles) — new tab so the user
    // doesn't lose the dashboard.
    if (url.startsWith("/")) {
      location.href = url;
    } else {
      window.open(url, "_blank", "noopener");
    }
  }
});

// ── SMART MONEY DECK (leads the dashboard) ────────────────────────────
const smState = { alerts: new Map(), seen: new Set(), first: true };
const POP_MIN = 1000; // only toast bets ≥ $1K so the dashboard isn't spammed
const SMD_WIN = { all: "all-time", "30d": "30d", "7d": "7d", "1d": "24h" };
function smPnl(n) {
  const a = Math.abs(Number(n) || 0);
  const s = a >= 1e9 ? `$${(a / 1e9).toFixed(1)}B` : a >= 1e6 ? `$${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `$${(a / 1e3).toFixed(0)}K` : `$${Math.round(a)}`;
  return (n < 0 ? "−" : "+") + s;
}
const smKey = (t) => `${t.tx_hash || ""}-${t.timestamp}-${t.wallet}`;
function setSmd(id, v) { const el = $("#" + id); if (el) el.textContent = v; }

async function loadSmartMoney() {
  try {
    const r = await fetch("/api/whales/smart-money");
    const d = await r.json();
    if (!r.ok) throw new Error(d?.detail || `HTTP ${r.status}`);
    const s = d.stats || {};
    setSmd("smdTopName", s.top_name || "—");
    setSmd("smdTop", smPnl(s.top_pnl));
    setSmd("smdCombined", smPnl(s.top50_combined_pnl));
    setSmd("smdTracked", (s.tracked_wallets || 0).toLocaleString());
    setSmd("smdLive", (s.tape_matches || 0).toLocaleString());
    renderSmWallets((d.windows?.all || []).slice(0, 10));
    processSmAlerts(d.tape || []);
    renderSmTape();
    updateConviction(d.tape || []); // flagship signal rides the same fetch
    const meta = $("#smdTapeMeta");
    if (meta) meta.innerHTML = `<span class="refresh-dot"></span>${(d.tape || []).length} live · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
  } catch (err) {
    const meta = $("#smdTapeMeta"); if (meta) meta.textContent = "feed error";
  }
}

function processSmAlerts(tape) {
  const fresh = [];
  for (const t of tape) {
    const k = smKey(t);
    if (!smState.alerts.has(k)) smState.alerts.set(k, t);
    if (!smState.seen.has(k)) { smState.seen.add(k); fresh.push(t); }
  }
  if (smState.alerts.size > 60) {
    const sorted = [...smState.alerts.entries()].sort((a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0));
    for (let i = 0; i < sorted.length - 60; i++) smState.alerts.delete(sorted[i][0]);
  }
  if (smState.first) { smState.first = false; return; } // seed silently on first load
  fresh.filter((t) => (t.usd || 0) >= POP_MIN).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 3).forEach(fireToast);
}

function renderSmTape() {
  const body = $("#smdTape"); if (!body) return;
  const rows = [...smState.alerts.values()].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 30);
  if (!rows.length) {
    if (!body.querySelector(".smt-row")) body.innerHTML = `<div class="empty" style="padding:24px;text-align:center;color:var(--muted);font-family:'JetBrains Mono',monospace;font-size:12px">Watching the sharps…</div>`;
    return;
  }
  liveList(body, rows, { key: smKey, render: smTapeRow });
}
function smTapeRow(t) {
  const dir = t.side === "BUY" ? "buy" : "sell";
  const av = t.image ? `<img src="${escapeAttr(t.image)}" alt="">` : escapeHtml((t.name || t.wallet || "?")[0].toUpperCase());
  return `<a class="smt-row" data-wallet="${escapeAttr(t.wallet)}">
    <div class="smt-av">${av}</div>
    <div class="smt-who"><div class="n">${escapeHtml(t.name || short(t.wallet, 6))}</div><div class="c">#${t.cred_rank} ${SMD_WIN[t.cred_window] || ""} · ${smPnl(t.cred_pnl)}</div></div>
    <div class="smt-act ${dir}">${t.side} ${escapeHtml(t.outcome || "")}</div>
    <div class="smt-amt">${fmtUsd(t.usd)}</div>
  </a>`;
}

function renderSmWallets(wallets) {
  const body = $("#smdWallets"); if (!body || !wallets.length) return;
  liveList(body, wallets, { key: (w) => w.wallet, render: smWalletRow });
}
function smWalletRow(w) {
  const top = w.rank <= 3 ? ` t${w.rank}` : "";
  const av = w.image ? `<img src="${escapeAttr(w.image)}" alt="">` : escapeHtml((w.name || w.wallet || "?")[0].toUpperCase());
  return `<a class="smw-row${top}" data-wallet="${escapeAttr(w.wallet)}">
    <div class="smw-rank">${w.rank}</div>
    <div class="smw-av">${av}</div>
    <div class="smw-n">${escapeHtml(w.name || short(w.wallet, 8))}</div>
    <div class="smw-pnl">${smPnl(w.pnl_usd)}</div>
  </a>`;
}

// ── EAGLE EYE strip — off-Polymarket on-chain moves ───────────────────
async function loadEagleStrip() {
  try {
    const r = await fetch("/api/whales/eagle-eye?window=30d");
    const d = await r.json();
    if (!r.ok) throw new Error(d?.detail || `HTTP ${r.status}`);
    const track = $("#smdEagle"); if (!track) return;
    const events = (d.events || []).slice(0, 24);
    const meta = $("#smdEagleMeta");
    if (meta) meta.textContent = (d.etherscan ? `${events.length} moves · multichain` : "armed") + " →";
    if (!events.length) {
      track.innerHTML = `<div class="empty-strip">No off-Polymarket moves in window.${d.etherscan ? "" : " Add an Etherscan key for full coverage."}</div>`;
      return;
    }
    track.innerHTML = events.map(eeChip).join("");
  } catch (err) {
    const meta = $("#smdEagleMeta"); if (meta) meta.textContent = "scan unavailable";
  }
}
function eeChip(e) {
  const dir = e.direction === "in" ? "in" : "out";
  const amt = (e.amount || 0) >= 1000 ? fmtUsd(e.amount) : (e.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  return `<a class="ee-chip" data-wallet="${escapeAttr(e.wallet)}">
    <div class="top"><span class="chain c-${escapeAttr(e.chain || "polygon")}">${escapeHtml(e.chain_sym || "POL")}</span><span class="nm">${escapeHtml(e.name || short(e.wallet, 6))}</span></div>
    <div class="mv"><b class="${dir}">${dir.toUpperCase()}</b> ${amt} ${escapeHtml(e.token || "")}</div>
    <div class="vn">${escapeHtml(e.venue_label || e.venue || "transfer")}${e.counterparty ? " → " + short(e.counterparty, 5) : ""}</div>
  </a>`;
}

// ── CONVICTION strip — smart money × momentum (rides the smart-money fetch) ──
const convSpark = {}; let _convAt = 0;
async function updateConviction(tape) {
  const now = Date.now();
  if (!(now - _convAt < 9000 && Object.keys(convSpark).length)) {
    _convAt = now;
    const assets = [...new Set(tape.map((t) => t.asset).filter(Boolean))].slice(0, 16);
    if (assets.length) { try { const d = await fetch("/api/spark?pm=" + encodeURIComponent(assets.join(","))).then((r) => r.json()); Object.assign(convSpark, d.pm || {}); } catch {} }
  }
  renderConvStrip(tape);
}
function renderConvStrip(tape) {
  const track = $("#convTrack"); if (!track) return;
  const best = new Map();
  for (const t of tape) {
    const c = convictionScore(t, convSpark[t.asset] && convSpark[t.asset].series);
    if (!c) continue;
    const k = t.asset + "|" + t.wallet;
    if (!best.has(k) || c.score > best.get(k).c.score) best.set(k, { t, c });
  }
  const sigs = [...best.values()].sort((a, b) => b.c.score - a.c.score).slice(0, 8);
  const meta = $("#convStripMeta");
  if (!sigs.length) {
    track.innerHTML = `<div class="conv-scan-chip">🎯 Scanning for conviction — waiting on a tracked sharp to bet a market that's moving their way…</div>`;
    if (meta) meta.textContent = "Open terminal →";
    return;
  }
  if (meta) meta.textContent = `${sigs.length} live · terminal →`;
  track.innerHTML = sigs.map(convChip).join("");
}
function convChip({ t, c }) {
  const m = c.m, up = m.dir > 0, sp = convSpark[t.asset];
  const spark = sp ? sparkSvg(sp.series, m.delta, 110, 24) : "";
  return `<a class="conv-chip ${c.tier}" href="/conviction.html">
    <div class="cv-head"><div class="cv-who"><div class="n">${escapeHtml(t.name || short(t.wallet, 6))}</div><div class="c">#${t.cred_rank} · ${smPnl(t.cred_pnl)}</div></div><span class="cv-score">${c.score}</span></div>
    <div class="cv-mkt">${escapeHtml((t.market_title || "").slice(0, 50))}</div>
    <div class="cv-spark">${spark}<span class="cv-mom ${up ? "up" : "down"}">${m.emoji} ${m.delta > 0 ? "+" : ""}${m.delta}¢</span></div>
    <div class="cv-bet"><b class="${t.side === "BUY" ? "buy" : "sell"}">${t.side} ${escapeHtml((t.outcome || "").slice(0, 16))}</b> · ${fmtUsd(t.usd)}</div>
  </a>`;
}

// ── LIVE Movers strip — biggest momentum across venues ──
const liveSpark = {};
async function loadLiveMovers() {
  try {
    const d = await fetch("/api/live?hours=6").then((r) => r.json());
    const cards = (d.cards || []).slice(0, 30);
    const ids = cards.filter((c) => c.platform === "kalshi").map((c) => c.id).slice(0, 16);
    const pm = cards.filter((c) => c.platform === "polymarket" && c.yes_token).map((c) => c.yes_token).slice(0, 6);
    const qs = [ids.length ? `ids=${encodeURIComponent(ids.join(","))}` : "", pm.length ? `pm=${encodeURIComponent(pm.join(","))}` : ""].filter(Boolean).join("&");
    if (qs) { try { const s = await fetch("/api/spark?" + qs).then((r) => r.json()); Object.assign(liveSpark, s.spark || {}, s.pm || {}); } catch {} }
    renderLiveStrip(cards, d.server_now);
  } catch {}
}
function renderLiveStrip(cards, serverNow) {
  const track = $("#liveTrack"); if (!track || !cards.length) return;
  const offset = (serverNow || Math.floor(Date.now() / 1000)) - Math.floor(Date.now() / 1000);
  const scored = cards.map((c) => {
    const key = c.platform === "kalshi" ? c.id : c.yes_token;
    const sp = liveSpark[key];
    return { c, sp, m: analyzeMomentum(sp ? sp.series : []) };
  }).sort((a, b) => b.m.score - a.m.score).slice(0, 12);
  const meta = $("#liveStripMeta");
  if (meta) meta.textContent = `${cards.length} live · board →`;
  track.innerHTML = scored.map((x) => liveChip(x, offset)).join("");
}
function liveChip({ c, sp, m }, offset) {
  const left = c.close_ts - (Math.floor(Date.now() / 1000) + offset);
  const cd = left <= 0 ? "closing" : left >= 3600 ? `${Math.floor(left / 3600)}h ${Math.floor((left % 3600) / 60)}m` : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const spark = (sp && sp.series.length >= 2) ? sparkSvg(sp.series, m.delta, 120, 26) : "";
  const hot = m.state === "breakout" || m.state === "reversal";
  const yes = Math.round((c.yes_price || 0) * 100), no = Math.round((c.no_price || 0) * 100);
  const dirCls = m.dir > 0 ? "up" : m.dir < 0 ? "down" : "flat";
  return `<a class="live-chip${hot ? " hot" : ""}" href="${escapeAttr(c.link)}" target="_blank" rel="noopener">
    <div class="lv-head"><span class="lv-cat">${c.emoji || "🎲"} ${escapeHtml(c.category)}</span><span class="lv-cd">${cd}</span></div>
    <div class="lv-q">${escapeHtml((c.title || "").slice(0, 56))}</div>
    <div class="lv-spark">${spark}<span class="lv-mom ${dirCls}">${m.emoji} ${m.delta > 0 ? "+" : ""}${m.delta}¢</span></div>
    <div class="lv-odds"><span class="no">${no}¢ No</span><span class="yes">${yes}¢ Yes</span></div>
  </a>`;
}

// ── pop-up toasts (in-page; new sharp bet ≥ $1K) ──────────────────────
function ensureToastWrap() {
  let w = document.getElementById("toastWrap");
  if (!w) { w = document.createElement("div"); w.id = "toastWrap"; w.className = "toast-wrap"; document.body.appendChild(w); }
  return w;
}
function fireToast(t) {
  const wrap = ensureToastWrap();
  const av = t.image ? `<img src="${escapeAttr(t.image)}" alt="">` : escapeHtml((t.name || t.wallet || "?")[0].toUpperCase());
  const dir = t.side === "BUY" ? "buy" : "sell";
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<div class="toast-av">${av}</div>
    <div class="toast-body">
      <div class="toast-top"><span class="toast-name">${escapeHtml(t.name || short(t.wallet, 6))}</span><span class="toast-cred">#${t.cred_rank} ${SMD_WIN[t.cred_window] || ""}</span></div>
      <div class="toast-act"><b class="${dir}">${t.side} ${escapeHtml(t.outcome || "")}</b> · ${fmtUsd(t.usd)}</div>
      <div class="toast-mkt">${escapeHtml((t.market_title || "").slice(0, 60))}</div>
    </div>
    <button class="toast-x" type="button" aria-label="dismiss">×</button>`;
  const dismiss = () => { el.classList.add("out"); setTimeout(() => el.remove(), 320); };
  el.querySelector(".toast-x").addEventListener("click", (e) => { e.stopPropagation(); dismiss(); });
  el.addEventListener("click", () => { location.href = `/whales.html?wallet=${t.wallet}`; });
  wrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add("in"));
  setTimeout(dismiss, 9000);
  while (wrap.children.length > 5) wrap.firstElementChild.remove();
}

// ── boot + schedule ───────────────────────────────────────────────────
// Live loops — poll on cadence, pause while the tab is hidden, refresh on return.
liveLoop(loadSmartMoney, 4_000);
liveLoop(loadLiveMovers, 8_000);
liveLoop(loadEagleStrip, 30_000);
liveLoop(loadMarkets, INTERVALS.markets);
liveLoop(loadWhales, INTERVALS.whales);
liveLoop(loadBuzz, INTERVALS.buzz);
liveLoop(loadNews, INTERVALS.news);
setInterval(updateRefreshDots, 1_000);

// Whales count from the leaderboard (separate, lower-freq)
async function updateWhalesGlobal() {
  try {
    const r = await fetch("/api/whales/leaderboard?limit=5");
    const data = await r.json();
    if (data?.total_active_wallets) {
      $("#globalWhales").textContent = data.total_active_wallets.toLocaleString();
    }
  } catch {}
}
updateWhalesGlobal();
setInterval(updateWhalesGlobal, 120_000);
