// $EDGE social profile — any prediction-market trader, PFP-forward, with their
// track record + live bets, and a one-tap Follow that feeds /feed.html.
import { fmtUsd, fmtAgo, short, escapeHtml, escapeAttr } from "/lib/client/format.js";
import { isFollowing, toggleFollow } from "/lib/client/follow.js";

const $ = (s) => document.querySelector(s);
const root = $("#pfRoot");
const params = new URLSearchParams(location.search);
const wallet = (params.get("w") || params.get("wallet") || "").toLowerCase();
const state = { data: null, tab: "bets", cred: null };
const WL = { all: "all-time", "30d": "30d", "7d": "7d", "1d": "24h" };
let _credDone = false;

const pnlStr = (n) => (n >= 0 ? "+" : "−") + fmtUsd(Math.abs(n || 0));
const polyProfile = (w) => `https://polymarket.com/profile/${w}`;
const eventLink = (o) => o.event_slug ? `https://polymarket.com/event/${encodeURIComponent(o.event_slug)}` : (o.market_slug ? `https://polymarket.com/market/${encodeURIComponent(o.market_slug)}` : "#");

if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
  root.innerHTML = `<div class="pf-empty">No trader specified. <a href="/whales.html" style="color:var(--lime)">Browse the leaderboard →</a></div>`;
} else {
  load(); loadCred();
  setInterval(() => { if (!document.hidden) load(); }, 15000);
}

// Lifetime P&L + rank come from the leaderboard (the wallet endpoint only sees
// OPEN positions) — so a legend with everything closed still reads right.
async function loadCred() {
  if (_credDone) return; _credDone = true;
  try {
    const d = await fetch("/api/whales/smart-money").then((r) => r.json());
    const w = d.windows || {};
    for (const win of ["all", "30d", "7d", "1d"]) {
      const hit = (w[win] || []).find((x) => (x.wallet || "").toLowerCase() === wallet);
      if (hit) { state.cred = { pnl: hit.pnl_usd, rank: hit.rank, window: win, name: hit.name, image: hit.image }; break; }
    }
    if (state.data) render();
  } catch {}
}

async function load() {
  try {
    const r = await fetch(`/api/whales/wallet?user=${encodeURIComponent(wallet)}`);
    const d = await r.json();
    if (!r.ok) throw new Error(d?.detail || "load failed");
    state.data = d;
    render();
  } catch {
    if (!state.data) root.innerHTML = `<div class="pf-empty">Couldn't load this profile right now. <a href="javascript:location.reload()" style="color:var(--lime)">Retry</a></div>`;
  }
}

function render() {
  const d = state.data, id = d.identity || {}, s = d.summary || {}, cred = state.cred;
  const name = id.name || id.pseudonym || cred?.name || short(wallet, 6);
  const tot = (s.winning_positions || 0) + (s.losing_positions || 0);
  const wr = tot ? Math.round((s.winning_positions / tot) * 100) : null;
  const img = id.profile_image || cred?.image;
  const pfp = img ? `<img src="${escapeAttr(img)}" alt="">` : escapeHtml(name[0].toUpperCase());
  const allTimePnl = cred ? cred.pnl : (s.total_realized_pnl || 0);
  document.title = `${name} · $EDGE`;
  root.innerHTML = `
    <div class="pf-hero">
      <div class="pf-pic">${pfp}</div>
      <div class="pf-id">
        <div class="pf-name">${escapeHtml(name)}</div>
        <div class="pf-sub">
          ${cred ? `<span class="pf-rank">#${cred.rank} ${WL[cred.window] || ""}</span>` : ""}
          <span class="pf-wallet" id="pfCopy" title="Copy address">${short(wallet, 6)}</span>
          <span class="pf-poly">● tracked via Polymarket</span>
        </div>
        ${id.bio ? `<div class="pf-bio">${escapeHtml(id.bio)}</div>` : ""}
      </div>
      <div class="pf-actions">
        <button class="pf-follow" id="pfFollow"></button>
        <a class="pf-ext" href="/whales.html?wallet=${wallet}" title="On-chain moves">🦅</a>
        <a class="pf-ext" href="${polyProfile(wallet)}" target="_blank" rel="noopener">Polymarket ↗</a>
      </div>
    </div>
    <div class="pf-stats">
      <div class="pf-stat"><div class="l">${cred ? "All-time P&amp;L" : "Realized P&amp;L"}</div><div class="v ${allTimePnl >= 0 ? "pos" : "neg"}">${pnlStr(allTimePnl)}</div></div>
      <div class="pf-stat"><div class="l">Portfolio Value</div><div class="v alt">${s.total_value != null ? fmtUsd(s.total_value) : "—"}</div></div>
      <div class="pf-stat"><div class="l">Open Positions</div><div class="v">${s.open_positions || 0}</div></div>
      <div class="pf-stat"><div class="l">Win Rate</div><div class="v ${wr != null && wr >= 50 ? "pos" : ""}">${wr != null ? wr + "%" : "—"}</div></div>
    </div>
    <div class="pf-tabs" id="pfTabs">
      <button data-t="bets" class="${state.tab === "bets" ? "active" : ""}">Recent Bets</button>
      <button data-t="positions" class="${state.tab === "positions" ? "active" : ""}">Open Positions</button>
    </div>
    <div class="pf-body" id="pfBody"></div>`;
  wireFollow(id);
  $("#pfCopy").onclick = () => { try { navigator.clipboard.writeText(wallet); toast("Address copied"); } catch {} };
  document.querySelectorAll("#pfTabs button").forEach((b) => (b.onclick = () => { state.tab = b.dataset.t; render(); }));
  renderBody();
}

function renderBody() {
  const body = $("#pfBody"), d = state.data;
  if (state.tab === "bets") {
    const t = d.trades || [];
    body.innerHTML = t.length ? t.map(betRow).join("") : `<div class="pf-empty">No recent bets.</div>`;
  } else {
    const p = (d.positions || []).slice(0, 40);
    body.innerHTML = p.length ? p.map(posRow).join("") : `<div class="pf-empty">No open positions.</div>`;
  }
}
function betRow(t) {
  return `<a class="bet-row" href="${eventLink(t)}" target="_blank" rel="noopener">
    <span class="bet-side ${t.side === "BUY" ? "buy" : "sell"}">${t.side} ${escapeHtml((t.outcome || "").slice(0, 10))}</span>
    <div class="bet-mid"><div class="bet-mkt">${escapeHtml(t.market_title || "")}</div><div class="bet-meta">${fmtAgo(t.timestamp)} ago · ${Math.round((t.price || 0) * 100)}¢</div></div>
    <div class="bet-amt"><div class="v">${fmtUsd(t.usd)}</div><div class="t">bet</div></div>
  </a>`;
}
function posRow(p) {
  return `<a class="bet-row" href="${eventLink(p)}" target="_blank" rel="noopener">
    <span class="bet-side ${p.cash_pnl >= 0 ? "buy" : "sell"}">${escapeHtml((p.outcome || "").slice(0, 10))}</span>
    <div class="bet-mid"><div class="bet-mkt">${escapeHtml(p.market_title || "")}</div><div class="bet-meta">${fmtUsd(p.current_value)} value · entry ${Math.round((p.avg_price || 0) * 100)}¢</div></div>
    <div class="bet-amt"><div class="v pos-pnl ${p.cash_pnl >= 0 ? "pos" : "neg"}">${pnlStr(p.cash_pnl)}</div><div class="t">P&amp;L</div></div>
  </a>`;
}

function wireFollow(id) {
  const btn = $("#pfFollow");
  const sync = () => { const on = isFollowing(wallet); btn.classList.toggle("on", on); btn.textContent = on ? "Following" : "+ Follow"; };
  sync();
  btn.onclick = () => {
    const now = toggleFollow(wallet, { name: id.name || id.pseudonym, image: id.profile_image });
    sync();
    toast(now ? "Following — added to your feed" : "Unfollowed");
  };
}

let _tt;
function toast(msg) {
  const el = $("#pfToast"); el.textContent = msg; el.classList.add("in");
  clearTimeout(_tt); _tt = setTimeout(() => el.classList.remove("in"), 2200);
}
