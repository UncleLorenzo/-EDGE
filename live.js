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
// ── Momentum Engine ──────────────────────────────────────────────────
// Beyond "the move": read the SHAPE of the run — trend, acceleration, reversal
// — so every card gets a momentum STATE, not just a number.
function lsq(arr) { // least-squares slope (¢/step)
  const m = arr.length; if (m < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / m, mx = (m - 1) / 2;
  let num = 0, den = 0;
  for (let i = 0; i < m; i++) { num += (i - mx) * (arr[i] - mean); den += (i - mx) ** 2; }
  return den ? num / den : 0;
}
function analyzeMomentum(series) {
  const n = series.length;
  if (n < 2) return { score: 0, state: "quiet", emoji: "💤", label: "Quiet", delta: 0, dir: 0 };
  const c = series.map((v) => v * 100);
  const delta = Math.round(c[n - 1] - c[0]);
  const h = Math.max(2, Math.floor(n / 2));
  const early = lsq(c.slice(0, h)), recent = lsq(c.slice(-h)), full = lsq(c);
  const recentMove = Math.round(c[n - 1] - c[Math.max(0, n - 1 - Math.min(n - 1, 4))]);
  const accel = recent - early, range = Math.max(...c) - Math.min(...c);
  let runLen = 0; const dir0 = Math.sign(c[n - 1] - c[n - 2]);
  for (let i = n - 1; i > 0 && dir0 !== 0; i--) { if (Math.sign(c[i] - c[i - 1]) === dir0) runLen++; else break; }
  let state = "steady", emoji = "➡️", label = "Steady";
  if (Math.abs(delta) < 2 && range < 3) { state = "quiet"; emoji = "💤"; label = "Quiet"; }
  else if ((early > 1.2 && recent < -1.2) || (early < -1.2 && recent > 1.2)) { state = "reversal"; emoji = "🔄"; label = recent > 0 ? "Reversing up" : "Reversing down"; }
  else if (Math.abs(recentMove) >= 6 && Math.abs(accel) >= 1) { state = "breakout"; emoji = recentMove > 0 ? "🚀" : "🔻"; label = recentMove > 0 ? "Breakout" : "Breakdown"; }
  else if (Math.abs(delta) >= 5 || (Math.abs(full) >= 0.5 && runLen >= 2)) { const u = (delta || full) > 0; state = "run"; emoji = u ? "📈" : "📉"; label = u ? "Running up" : "Running down"; }
  const score = Math.abs(recentMove) + Math.abs(accel) * 1.8 + runLen * 1.2 + Math.abs(delta) * 0.3;
  return { score, state, emoji, label, delta, recentMove, dir: Math.sign(recentMove || delta) };
}
function momFor(c) { const s = seriesFor(sparkKey(c), c.yes_price); return { s, m: analyzeMomentum(s ? s.series : []) }; }
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
function momBadge(m) {
  if (!m || m.state === "quiet") return `<span class="lc-mom flat">${m ? (m.delta > 0 ? "+" : "") + m.delta + "¢" : "—"}</span>`;
  if (m.state === "steady") return `<span class="lc-mom flat">➡️ ${m.delta > 0 ? "+" : ""}${m.delta}¢</span>`;
  const cls = (m.state === "breakout" || m.state === "reversal") ? "shift" : (m.dir > 0 ? "up" : "down");
  return `<span class="lc-mom ${cls}" title="${m.label}">${m.emoji} ${m.delta > 0 ? "+" : ""}${m.delta}¢</span>`;
}

// ── render ────────────────────────────────────────────────────────────
function visibleCards() {
  return state.cards.filter((c) => state.kind === "all" || c.kind === state.kind);
}
function lcCard(c, m, s, hot, featured) {
  const yes = Math.round((c.yes_price || 0) * 100), no = Math.round((c.no_price || 0) * 100);
  const big = featured && m && (m.state === "breakout" || m.state === "reversal" || Math.abs(m.delta) >= 5);
  const cat = featured
    ? `<span class="lc-cat feat"><span class="emoji">${big ? "🔥" : "🔴"}</span> <b>${big ? "Top mover" : "Most live"}</b> <span class="lc-ven">${c.emoji} ${esc(c.category)} · ${c.platform === "kalshi" ? "KALSHI" : "POLY"}</span></span>`
    : `<span class="lc-cat"><span class="emoji">${c.emoji || "🎲"}</span> <b>${esc(c.category)}</b> <span class="lc-ven">· ${c.platform === "kalshi" ? "KALSHI" : "POLY"}</span></span>`;
  const spark = (s && s.series.length >= 2) ? sparkSvg(s.series, s.delta) : "";
  const stateTag = (m && (m.state === "breakout" || m.state === "reversal" || m.state === "run"))
    ? `<span class="lc-state ${m.state}">${m.emoji} ${m.label}</span>` : "";
  return `<a class="live-card${featured ? " featured" : ""}${hot ? " hot" : ""}" href="${escAttr(c.link)}" target="_blank" rel="noopener" data-close="${c.close_ts}">
    <div class="lc-head">${cat}<span class="lc-cd">--:--</span></div>
    <div class="lc-q">${esc(c.title)}</div>
    <div class="lc-spark">${spark}${momBadge(m)}</div>
    <div class="lc-odds">
      <div class="lc-odd no"><span class="p">${no}¢</span><span class="l">No</span></div>
      <div class="lc-odd yes"><span class="p">${yes}¢</span><span class="l">Yes</span></div>
    </div>
    <div class="lc-foot"><span>${stateTag || (c.volume_24h ? fmtUsd(c.volume_24h) + " vol" : "live")}</span><span class="lc-trade">Trade ↗</span></div>
  </a>`;
}
function render() {
  const list = visibleCards().map((c) => { const { s, m } = momFor(c); return { c, s, m }; })
    .sort((a, b) => b.m.score - a.m.score || (b.c.volume_24h || 0) - (a.c.volume_24h || 0));
  if (!list.length) {
    grid.innerHTML = `<div class="live-empty">No live ${state.kind === "all" ? "" : state.kind + " "}markets in this window. Widen to 24H or switch filters.</div>`;
    $("#lsHot").textContent = "0"; renderShifts([]); return;
  }
  let hotN = 0;
  grid.innerHTML = list.map((x, i) => {
    const hot = x.m.state === "breakout" || x.m.state === "reversal";
    if (hot) hotN++;
    return lcCard(x.c, x.m, x.s, hot, i === 0 && list.length >= 6); // lead with the strongest momentum
  }).join("");
  $("#lsHot").textContent = hotN;
  renderShifts(list);
  paintCountdowns();
  checkMomentum(list);
}
function renderShifts(list) {
  const host = $("#momShifts"); if (!host) return;
  const shifts = list.filter((x) => x.m.state === "breakout" || x.m.state === "reversal").slice(0, 6);
  if (!shifts.length) { host.innerHTML = ""; host.classList.remove("show"); return; }
  host.classList.add("show");
  host.innerHTML = `<span class="ms-label">⚡ Momentum shifts</span>` + shifts.map(({ c, m }) =>
    `<a class="ms-pill ${m.state}" href="${escAttr(c.link)}" target="_blank" rel="noopener" title="${escAttr(c.title)}">${m.emoji} <b>${esc(c.category)}</b> <span class="d">${m.delta > 0 ? "+" : ""}${m.delta}¢</span> · ${m.label}</a>`
  ).join("");
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
function checkMomentum(list) {
  if (state.firstLoad) return;
  const now = Date.now();
  for (const { c, m } of list) {
    if (m.state !== "breakout" && m.state !== "reversal") continue;
    if (now - (state.alerted[c.id] || 0) < HOT_COOLDOWN) continue;
    state.alerted[c.id] = now;
    momToast(c, m);
  }
}
function momToast(c, m) {
  const wrap = $("#liveToasts"); if (!wrap) return;
  const up = m.delta > 0, pct = Math.round((c.yes_price || 0) * 100);
  const el = document.createElement("a");
  el.className = "lt"; el.href = c.link || "#"; el.target = "_blank"; el.rel = "noopener";
  el.innerHTML = `<span class="tag">${m.emoji}</span><span class="txt"><b>${m.label.toUpperCase()}</b> · ${esc(c.title)} · ${pct}¢ <span class="${up ? "up" : "down"}">${up ? "▲ +" : "▼ "}${m.delta}¢</span></span><span class="go">Trade ↗</span>`;
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
