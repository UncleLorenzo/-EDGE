// Your Feed — every bet from the traders you follow, newest first. Local-first:
// reads the follow graph from localStorage, batches their recent trades.
import { fmtUsd, fmtAgo, short, escapeHtml, escapeAttr } from "/lib/client/format.js";
import { followList } from "/lib/client/follow.js";

const $ = (s) => document.querySelector(s);
const body = $("#feedBody");
const sub = $("#feedSub");
const eventLink = (t) => t.event_slug ? `https://polymarket.com/event/${encodeURIComponent(t.event_slug)}` : (t.market_slug ? `https://polymarket.com/market/${encodeURIComponent(t.market_slug)}` : "#");

async function load() {
  const follows = followList();
  if (!follows.length) {
    sub.innerHTML = "You're not following anyone yet";
    body.innerHTML = emptyState();
    return;
  }
  sub.innerHTML = `Following <b>${follows.length}</b> trader${follows.length === 1 ? "" : "s"} · live`;
  try {
    const users = follows.map((f) => f.wallet).slice(0, 20);
    const d = await fetch(`/api/whales/feed?users=${encodeURIComponent(users.join(","))}`).then((r) => r.json());
    const trades = d.trades || [];
    if (!trades.length) {
      body.innerHTML = `<div class="feed-loading">No bets from your traders in the recent window. They move constantly — check back in a bit.</div>`;
      return;
    }
    sub.innerHTML = `Following <b>${follows.length}</b> · <b>${trades.length}</b> recent bets · live`;
    body.innerHTML = trades.map(row).join("");
  } catch {
    if (!body.querySelector(".fr")) body.innerHTML = `<div class="feed-loading">Couldn't load the feed. Retrying…</div>`;
  }
}

function row(t) {
  const who = t.name || short(t.wallet, 6);
  const av = t.image ? `<img src="${escapeAttr(t.image)}" alt="">` : escapeHtml(who[0].toUpperCase());
  const prof = `/u.html?w=${t.wallet}`;
  return `<div class="fr">
    <a class="fr-av" href="${prof}">${av}</a>
    <div class="fr-mid">
      <div class="fr-line1"><a class="fr-who" href="${prof}">${escapeHtml(who)}</a> <span class="fr-act ${t.side === "BUY" ? "buy" : "sell"}">${t.side} ${escapeHtml((t.outcome || "").slice(0, 14))}</span> · <span style="color:var(--muted);font-family:'JetBrains Mono',monospace;font-size:11px">${fmtAgo(t.timestamp)} ago</span></div>
      <a class="fr-mkt" href="${eventLink(t)}" target="_blank" rel="noopener">${escapeHtml(t.market_title || "")}</a>
    </div>
    <div class="fr-amt"><div class="v">${fmtUsd(t.usd)}</div><div class="t">${Math.round((t.price || 0) * 100)}¢</div></div>
  </div>`;
}

function emptyState() {
  return `<div class="feed-empty">
    <div class="ico">📡</div>
    <h3>Build your feed</h3>
    <p>Follow sharp traders and every bet they place shows up here, live. Start with the most profitable wallets on Polymarket.</p>
    <div class="cta">
      <a class="p" href="/whales.html">Browse Smart Money →</a>
      <a class="s" href="/hall-of-fame.html">Hall of Fame</a>
    </div>
  </div>`;
}

load();
window.addEventListener("edge-follow-change", load);
setInterval(() => { if (!document.hidden) load(); }, 15000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
