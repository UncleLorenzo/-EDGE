// EDGE LIVE — the in-play momentum board. Pulls every live/fast market across
// venues (api/live), overlays real-time price momentum (api/spark), and ranks
// the board by who's moving hardest right now. Our aggregator answer to
// SpeedLabs' "Momentum Markets": we surface the movers, the second they move.
import { fmtUsd } from "/lib/client/format.js";

const $ = (s) => document.querySelector(s);
const grid = $("#liveGrid");

const HOT = 8;                 // ¢ recent move to be 🔥 MOVING
const HOT_COOLDOWN = 180000;
const state = {
  cards: [], offset: 0, kind: "all", hours: 6,
  spark: {},   // key -> {series,last,first,delta}   (k_TICKER for kalshi, clobTokenId for poly)
  tick: {},    // key -> [yes_price,...] live fallback
  alerted: {}, firstLoad: true,
};

const esc = (s) => { const d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; };
const escAttr = (s) => esc(s).replace(/"/g, "&quot;");
const nowTs = () => Math.floor(Date.now() / 1000) + state.offset;
const sparkKey = (c) => (c.platform === "kalshi" ? c.id : c.yes_token || c.id);

// ── data ──────────────────────────────────────────────────────────────
async function load() {
  try {
    const r = await fetch(`/api/live?hours=${state.hours}`);
    const d = await r.json();
    if (!r.ok) throw new Error(d?.detail || "load failed");
    state.offset = (d.server_now || Math.floor(Date.now() / 1000)) - Math.floor(Date.now() / 1000);
    const fresh = d.cards || [];
    if (!fresh.length && state.cards.length) return; // ignore a transient empty response — keep the board
    // live re-price existing + add new
    const byId = new Map(state.cards.map((c) => [c.id, c]));
    for (const c of fresh) {
      const ex = byId.get(c.id);
      if (ex) { ex.yes_price = c.yes_price; ex.no_price = c.no_price; ex.volume_24h = c.volume_24h; }
      else { state.cards.push(c); byId.set(c.id, c); }
    }
    const freshIds = new Set(fresh.map((c) => c.id)); // authoritative live set (bounded), but only when non-empty
    state.cards = state.cards.filter((c) => freshIds.has(c.id) && c.close_ts - nowTs() > 1);
    for (const c of state.cards) { const a = state.tick[sparkKey(c)] || (state.tick[sparkKey(c)] = []); if (Number.isFinite(c.yes_price)) a.push(c.yes_price); if (a.length > 40) a.splice(0, a.length - 40); }
    $("#lsCount").textContent = state.cards.length;
    $("#lsAgo").textContent = "live";
    render();
    loadSpark();
    state.firstLoad = false;
  } catch {
    if (!state.cards.length) grid.innerHTML = `<div class="live-empty">Live board offline for a sec — retrying…</div>`;
  }
}

async function loadSpark() {
  const vis = visibleCards();
  const ids = vis.filter((c) => c.platform === "kalshi").map((c) => c.id).slice(0, 16);
  const pm = vis.filter((c) => c.platform === "polymarket" && c.yes_token).map((c) => c.yes_token).slice(0, 8);
  if (!ids.length && !pm.length) return;
  try {
    const qs = [ids.length ? `ids=${encodeURIComponent(ids.join(","))}` : "", pm.length ? `pm=${encodeURIComponent(pm.join(","))}` : ""].filter(Boolean).join("&");
    const d = await fetch(`/api/spark?${qs}`).then((r) => r.json());
    Object.assign(state.spark, d.spark || {}, d.pm || {});
    render(); // re-rank by fresh momentum
  } catch {}
}

// ── momentum / sparkline ──────────────────────────────────────────────
function seriesFor(key, live) {
  const sp = state.spark[key];
  if (sp && sp.series.length >= 2) {
    let series = sp.series.slice(), delta = sp.delta;
    if (live != null && Math.abs(live - sp.last) >= 0.005) { series = series.concat([live]); delta = Math.round((live - sp.first) * 100); }
    return { series, delta };
  }
  const t = state.tick[key] || [];
  if (t.length >= 2) return { series: t.slice(-30), delta: Math.round((t[t.length - 1] - t[0]) * 100) };
  return live != null ? { series: [live], delta: 0 } : null;
}
// the move shown by the sparkline — drives ranking, the 🔥 trigger, and the badge,
// so the line, the number, and the flame always agree.
function recentMove(key, live) {
  const s = seriesFor(key, live);
  return s && s.series.length >= 2 ? s.delta : 0;
}
function sparkPath(series, w, h, pad) {
  const min = Math.min(...series), max = Math.max(...series), range = (max - min) || 0.02, n = series.length;
  const X = (i) => pad + (n === 1 ? 0 : (i / (n - 1)) * (w - 2 * pad));
  const Y = (v) => h - pad - ((v - min) / range) * (h - 2 * pad);
  let d = ""; series.forEach((v, i) => { d += (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1) + " "; });
  return { d, lastX: X(n - 1), lastY: Y(series[n - 1]) };
}
function sparkSvg(series, delta) {
  const w = 150, h = 30, pad = 3;
  const col = delta > 0 ? "var(--green)" : delta < 0 ? "var(--magenta)" : "var(--muted)";
  const { d, lastX, lastY } = sparkPath(series, w, h, pad);
  const gid = "lg" + Math.floor(Math.random() * 1e6);
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".2"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs><path d="${d} L ${lastX.toFixed(1)} ${h} L ${pad} ${h} Z" fill="url(#${gid})"/><path d="${d}" fill="none" stroke="${col}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="2.2" fill="${col}"/></svg>`;
}
function mvBadge(delta, hot) {
  if (hot) return `<span class="lc-mv hot">🔥 ${delta > 0 ? "+" : ""}${delta}¢</span>`;
  if (!delta) return `<span class="lc-mv flat">● flat</span>`;
  const up = delta > 0;
  return `<span class="lc-mv ${up ? "up" : "down"}">${up ? "▲ +" : "▼ "}${delta}¢</span>`;
}

// ── render ────────────────────────────────────────────────────────────
function visibleCards() {
  return state.cards.filter((c) => state.kind === "all" || c.kind === state.kind);
}
function ranked() {
  return visibleCards()
    .map((c) => ({ c, mom: recentMove(sparkKey(c), c.yes_price) }))
    .sort((a, b) => Math.abs(b.mom) - Math.abs(a.mom) || (b.c.volume_24h || 0) - (a.c.volume_24h || 0));
}
function lcCard(c) {
  const yes = Math.round((c.yes_price || 0) * 100), no = Math.round((c.no_price || 0) * 100);
  return `<a class="live-card" href="${escAttr(c.link)}" target="_blank" rel="noopener" data-key="${escAttr(sparkKey(c))}" data-close="${c.close_ts}">
    <div class="lc-head">
      <span class="lc-cat"><span class="emoji">${c.emoji || "🎲"}</span> <b>${esc(c.category)}</b> <span class="lc-ven">· ${c.platform === "kalshi" ? "KALSHI" : "POLY"}</span></span>
      <span class="lc-cd">--:--</span>
    </div>
    <div class="lc-q">${esc(c.title)}</div>
    <div class="lc-spark" data-spark="${escAttr(sparkKey(c))}"></div>
    <div class="lc-odds">
      <div class="lc-odd no"><span class="p">${no}¢</span><span class="l">No</span></div>
      <div class="lc-odd yes"><span class="p">${yes}¢</span><span class="l">Yes</span></div>
    </div>
    <div class="lc-foot"><span>${c.volume_24h ? fmtUsd(c.volume_24h) + " vol" : "live"}</span><span class="lc-trade">Trade ↗</span></div>
  </a>`;
}
function render() {
  const rows = ranked();
  if (!rows.length) {
    grid.innerHTML = `<div class="live-empty">No live ${state.kind === "all" ? "" : state.kind + " "}markets in this window. Widen to 24H or switch filters.</div>`;
    return;
  }
  grid.innerHTML = rows.map((r) => lcCard(r.c)).join("");
  paintSparks(); paintCountdowns();
}
function paintSparks() {
  let hotN = 0;
  document.querySelectorAll("[data-spark]").forEach((el) => {
    const key = el.getAttribute("data-spark");
    const card = state.cards.find((c) => sparkKey(c) === key);
    const live = card ? card.yes_price : null;
    const s = seriesFor(key, live);
    const mom = recentMove(key, live);
    const hot = Math.abs(mom) >= HOT;
    if (hot) hotN++;
    el.innerHTML = (s && s.series.length >= 2) ? sparkSvg(s.series, s.delta) + mvBadge(s.delta, hot) : "";
    const cardEl = el.closest(".live-card");
    if (cardEl) cardEl.classList.toggle("hot", hot);
  });
  $("#lsHot").textContent = hotN;
  checkMomentum();
}
function paintCountdowns() {
  const t = nowTs();
  document.querySelectorAll(".live-card").forEach((el) => {
    const left = Number(el.dataset.close) - t, cd = el.querySelector(".lc-cd");
    if (!cd) return;
    if (left <= 0) { cd.textContent = "CLOSED"; cd.className = "lc-cd urgent"; return; }
    cd.textContent = left >= 3600 ? `${Math.floor(left / 3600)}h ${Math.floor((left % 3600) / 60)}m` : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
    cd.className = "lc-cd" + (left <= 60 ? " urgent" : left <= 300 ? " warn" : "");
  });
}

// ── MOVING NOW alerts ─────────────────────────────────────────────────
function checkMomentum() {
  if (state.firstLoad) return;
  const now = Date.now();
  for (const c of visibleCards()) {
    const mom = recentMove(sparkKey(c), c.yes_price);
    if (Math.abs(mom) < HOT) continue;
    if (now - (state.alerted[c.id] || 0) < HOT_COOLDOWN) continue;
    state.alerted[c.id] = now;
    momToast(c, mom);
  }
}
function momToast(c, mom) {
  const wrap = $("#liveToasts"); if (!wrap) return;
  const up = mom > 0, pct = Math.round((c.yes_price || 0) * 100);
  const el = document.createElement("a");
  el.className = "lt"; el.href = c.link || "#"; el.target = "_blank"; el.rel = "noopener";
  el.innerHTML = `<span class="tag">🔥</span><span class="txt"><b>MOVING</b> · ${esc(c.title)} · ${pct}¢ <span class="${up ? "up" : "down"}">${up ? "▲ +" : "▼ "}${mom}¢</span></span><span class="go">Trade ↗</span>`;
  wrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add("in"));
  setTimeout(() => { el.classList.remove("in"); setTimeout(() => el.remove(), 300); }, 5000);
  while (wrap.children.length > 3) wrap.firstElementChild.remove();
}

// ── controls + boot ───────────────────────────────────────────────────
document.querySelectorAll("#kindSeg button").forEach((b) => (b.onclick = () => {
  state.kind = b.dataset.k;
  document.querySelectorAll("#kindSeg button").forEach((x) => x.classList.toggle("active", x === b));
  render();
}));
document.querySelectorAll("#winSeg button").forEach((b) => (b.onclick = () => {
  state.hours = Number(b.dataset.h);
  document.querySelectorAll("#winSeg button").forEach((x) => x.classList.toggle("active", x === b));
  state.cards = []; grid.innerHTML = `<div class="live-loading">Loading the live board…</div>`;
  load();
}));

load();
setInterval(paintCountdowns, 1000);
setInterval(() => { if (!document.hidden) load(); }, 8000);
setInterval(() => { if (!document.hidden) loadSpark(); }, 12000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
