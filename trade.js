// Track A — the US one-click surface. Renders the live sharp signal (EDGE's existing
// feed — the moat) and turns each sharp trade into a one-click deep-link into the
// user's OWN Polymarket US account, tagged with our referral code. EDGE never holds
// funds or signs. See copytrade/07-VENUE-AND-COMPLIANCE.md.
import { fmtUsd, fmtAgo, escapeHtml, escapeAttr } from "/lib/client/format.js";
import { polyUsUrl } from "/lib/poly-link.js";

// ── Referral seam ──────────────────────────────────────────────────────────
// EDGE's Polymarket US Referral / Introducing-Broker code. Drop it in here (and in
// the backend US_REFERRAL_CODE) once obtained — every Trade button then earns the
// revenue-share. Until then the deep-links still work; they just aren't attributed.
const US_REFERRAL_CODE = "";

const FEED_URL = "/api/whales/sharp-feed?window=24h&limit=40";
const REFRESH_MS = 15000;

const cardsEl = document.getElementById("cards");
const countEl = document.getElementById("count");

function normSide(s) {
  return String(s || "").toUpperCase().startsWith("S") ? "SELL" : "BUY";
}
function cents(price) {
  const p = Number(price);
  return Number.isFinite(p) && p > 0 ? `${Math.round(p * 100)}¢` : "—";
}

function cardHtml(t) {
  const side = normSide(t.side);
  const outcome = escapeHtml(t.outcome || "YES");
  const name = escapeHtml(t.name || (t.wallet ? `${t.wallet.slice(0, 6)}…` : "Sharp"));
  const rank = Number(t.cred_rank) > 0 ? `#${Number(t.cred_rank)}` : "SHARP";
  const pnl = Number(t.cred_pnl) > 0 ? `+${fmtUsd(t.cred_pnl)}` : "";
  const market = escapeHtml(t.market_title || "Market");
  const size = fmtUsd(t.usd || 0);
  const url = polyUsUrl({ eventSlug: t.event_slug, marketSlug: t.market_slug }, US_REFERRAL_CODE);
  const ago = t.timestamp ? fmtAgo(t.timestamp) : "";

  return `
  <article class="card">
    <div class="who">
      <span class="rank mono">${escapeHtml(rank)}</span>
      <span class="name">${name}</span>
      ${pnl ? `<span class="pnl">${escapeHtml(pnl)}</span>` : ""}
    </div>
    <div class="market">${market}</div>
    <div class="bet">
      <span class="tag ${side.toLowerCase()}">${side} ${outcome}</span>
      <span class="meta"><b>${escapeHtml(size)}</b> @ ${escapeHtml(cents(t.price))}</span>
    </div>
    <a class="cta" href="${escapeAttr(url)}" target="_blank" rel="noopener"
       data-evt="trade_click">Trade on Polymarket US →</a>
    <div class="foot"><span class="ago">${escapeHtml(ago)}</span></div>
  </article>`;
}

function renderLoading() {
  cardsEl.innerHTML = Array.from({ length: 6 }, () => `<div class="skeleton"></div>`).join("");
}
function renderEmpty(msg) {
  cardsEl.innerHTML = `<div class="state" style="grid-column:1/-1">${escapeHtml(msg)}</div>`;
  countEl.textContent = "";
}
function render(trades) {
  if (!trades.length) {
    renderEmpty("Markets quiet — the signal will populate the moment a tracked sharp places a bet.");
    return;
  }
  cardsEl.innerHTML = trades.map(cardHtml).join("");
  countEl.textContent = `${trades.length} live`;
}

async function load() {
  try {
    const res = await fetch(FEED_URL, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`feed ${res.status}`);
    const data = await res.json();
    const trades = Array.isArray(data.trades) ? data.trades : [];
    render(trades);
  } catch {
    if (!cardsEl.children.length || cardsEl.querySelector(".skeleton")) {
      renderEmpty("Signal feed is catching its breath — refreshing shortly.");
    }
  }
}

renderLoading();
load();
setInterval(load, REFRESH_MS);

// Expose for the verification harness to inject a sample trade if the live feed is dry.
window.__renderTrades = render;
