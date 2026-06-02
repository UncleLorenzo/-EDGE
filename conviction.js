// CONVICTION — smart money × momentum. The flagship signal: a tracked profitable
// wallet bets a market that's ALSO moving their way. We pull the sharp tape
// (Polymarket on-chain trades by proven-profitable wallets), overlay the shared
// Momentum Engine on each market's price action, and score where they agree.
import { fmtUsd, fmtAgo, short, escapeHtml, escapeAttr } from "/lib/client/format.js";
import { analyzeMomentum, sparkSvg } from "/lib/client/momentum.js";

const $ = (s) => document.querySelector(s);
const feed = $("#convFeed");
const WIN_SHORT = { "1d": "24h", "7d": "7d", "30d": "30d", all: "all-time" };
const ALERT_MIN = 70, COOLDOWN = 180000;
const state = { tape: [], spark: {}, sharps: 0, alerted: {}, firstLoad: true };

const pnlUsd = (n) => (n >= 0 ? "+" : "−") + fmtUsd(Math.abs(n || 0));
function polyLink(t) {
  if (t.event_slug) return `https://polymarket.com/event/${encodeURIComponent(t.event_slug)}`;
  if (t.market_slug) return `https://polymarket.com/market/${encodeURIComponent(t.market_slug)}`;
  return t.wallet ? `https://polymarket.com/profile/${t.wallet}` : "#";
}

// ── data ──
async function load() {
  try {
    const d = await fetch("/api/whales/smart-money").then((r) => r.json());
    state.tape = d.tape || [];
    state.sharps = d.stats?.tracked_wallets || 0;
    await loadSpark();
    render();
    state.firstLoad = false;
  } catch {
    if (!state.tape.length) feed.innerHTML = scan("Signal feed offline — retrying…");
  }
}
async function loadSpark() {
  const assets = [...new Set(state.tape.map((t) => t.asset).filter(Boolean))].slice(0, 16);
  if (!assets.length) return;
  try {
    const d = await fetch("/api/spark?pm=" + encodeURIComponent(assets.join(","))).then((r) => r.json());
    Object.assign(state.spark, d.pm || {});
  } catch {}
}

// ── conviction scoring ──
function convictionOf(t) {
  const sp = state.spark[t.asset];
  if (!sp || sp.series.length < 2) return null;
  const m = analyzeMomentum(sp.series);
  const buy = t.side === "BUY";
  const aligned = (buy && m.dir > 0) || (!buy && m.dir < 0); // market moving the way they bet
  if (!aligned) return null;
  if (m.state === "quiet" || m.state === "steady") return null; // needs real momentum
  const ageMin = (Date.now() / 1000 - (t.timestamp || 0)) / 60;
  if (ageMin > 120) return null;
  const rankF = t.cred_rank ? ((51 - Math.min(50, t.cred_rank)) / 50) * 35 : 12;
  const sizeF = Math.min(25, Math.log10((t.usd || 0) + 10) * 6);
  const momF = Math.min(36, m.score * 1.4 + (m.state === "breakout" ? 8 : m.state === "reversal" ? 5 : 0));
  const freshF = Math.max(0, 10 * (1 - ageMin / 120));
  const score = Math.round(Math.min(100, rankF + sizeF + momF + freshF));
  return { m, sp, score, ageMin };
}
function signals() {
  const best = new Map(); // strongest per market+wallet
  for (const t of state.tape) {
    const c = convictionOf(t);
    if (!c) continue;
    const k = t.asset + "|" + t.wallet;
    if (!best.has(k) || c.score > best.get(k).c.score) best.set(k, { t, c });
  }
  return [...best.values()].sort((a, b) => b.c.score - a.c.score);
}

// ── render ──
function render() {
  const sigs = signals();
  $("#convCount").textContent = sigs.length;
  $("#convTop").textContent = sigs.length ? sigs[0].c.score : "—";
  $("#convSharps").textContent = state.sharps ? state.sharps.toLocaleString() : "—";
  if (!sigs.length) { feed.innerHTML = scan(); return; }
  feed.innerHTML = sigs.map(convCard).join("");
  checkAlerts(sigs);
}
function scan(msg) {
  return `<div class="conv-scan"><div class="scan-pulse"></div><div class="scan-txt">${msg || "Scanning the tape…"}</div><div class="scan-sub">A signal fires when a tracked sharp bets a market that's <b>moving their way</b>. It's a signal, not noise — it lights up when a real one lands.</div></div>`;
}
function convCard({ t, c }) {
  const m = c.m, up = m.dir > 0;
  const tier = c.score >= 80 ? "elite" : c.score >= 60 ? "strong" : "live";
  const av = t.image ? `<img src="${escapeAttr(t.image)}" alt="" loading="lazy">` : escapeHtml((t.name || t.wallet || "?")[0].toUpperCase());
  const spark = c.sp ? sparkSvg(c.sp.series, m.delta, 300, 46) : "";
  return `<a class="conv-card ${tier}" href="${escapeAttr(polyLink(t))}" target="_blank" rel="noopener">
    <div class="cc-head">
      <div class="cc-who">
        <div class="cc-av">${av}</div>
        <div class="cc-id"><div class="cc-name">${escapeHtml(t.name || short(t.wallet, 6))}</div><div class="cc-cred">#${t.cred_rank} ${WIN_SHORT[t.cred_window] || ""} · <span class="pnl">${pnlUsd(t.cred_pnl)}</span></div></div>
      </div>
      <div class="cc-gauge"><div class="cc-score">${c.score}</div><div class="cc-tier">${tier.toUpperCase()}</div></div>
    </div>
    <div class="cc-meter"><div class="cc-meter-fill" style="width:${c.score}%"></div></div>
    <div class="cc-mkt">${escapeHtml((t.market_title || "").slice(0, 96))}</div>
    <div class="cc-spark">${spark}<span class="cc-mom ${up ? "up" : "down"}">${m.emoji} ${m.delta > 0 ? "+" : ""}${m.delta}¢</span></div>
    <div class="cc-bet"><span class="cc-side ${t.side === "BUY" ? "buy" : "sell"}">${t.side} ${escapeHtml(t.outcome || "")}</span> @ ${(t.price * 100).toFixed(0)}¢ · <b>${fmtUsd(t.usd)}</b></div>
    <div class="cc-verdict"><span>🟢 Smart money + <b>${m.label}</b> · ${fmtAgo(t.timestamp)} ago</span><span class="cc-trade">Trade ↗</span></div>
  </a>`;
}

// ── alerts ──
function checkAlerts(sigs) {
  if (state.firstLoad) return;
  const now = Date.now();
  for (const { t, c } of sigs) {
    if (c.score < ALERT_MIN) continue;
    if (now - (state.alerted[t.asset + t.wallet] || 0) < COOLDOWN) continue;
    state.alerted[t.asset + t.wallet] = now;
    toast(t, c);
  }
}
function toast(t, c) {
  const wrap = $("#convToasts"); if (!wrap) return;
  const el = document.createElement("a");
  el.className = "ct"; el.href = polyLink(t); el.target = "_blank"; el.rel = "noopener";
  el.innerHTML = `<span class="tag">${c.score}</span><span class="txt"><b>CONVICTION</b> · ${escapeHtml(t.name || short(t.wallet, 6))} ${t.side} ${escapeHtml(t.outcome || "")} · ${escapeHtml((t.market_title || "").slice(0, 48))}</span><span class="go">Trade ↗</span>`;
  wrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add("in"));
  setTimeout(() => { el.classList.remove("in"); setTimeout(() => el.remove(), 300); }, 6000);
  while (wrap.children.length > 3) wrap.firstElementChild.remove();
}

// ── boot ──
load();
setInterval(() => { if (!document.hidden) load(); }, 6000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
