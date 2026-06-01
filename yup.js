// YUP! — Tinder + List for closing-soon prediction markets, with a win/loss
// streak game. Swipe right = YUP (YES), left = NAH (NO), down = skip. Calls land
// in your slip; when the market settles (Kalshi posts a result), we grade it →
// record, win-rate, current streak, best streak.
import { fmtUsd } from "/lib/client/format.js";

const $ = (s) => document.querySelector(s);
const deck = $("#deck");
const deckEmpty = $("#deckEmpty");
const listView = $("#listView");

const state = {
  all: [],            // master list of live closing-soon cards (sorted, open)
  offset: 0,          // server_now − localNow
  mins: 30,
  view: "swipe",
  seen: new Set(),    // swiped away in the Tinder deck
  called: new Map(),  // id -> side (for list marking)
  slip: loadSlip(),
  dragging: false,
  topId: "",
  listSig: "",
  best: Number(localStorage.getItem("yup_best") || 0) || 0,
};
state.slip.forEach((s) => { if (s.id) state.called.set(s.id, s.side); });

const nowTs = () => Math.floor(Date.now() / 1000) + state.offset;
const esc = (s) => { const d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; };
const escAttr = (s) => esc(s).replace(/"/g, "&quot;");
function loadSlip() { try { return JSON.parse(localStorage.getItem("yup_slip") || "[]"); } catch { return []; } }
function saveSlip() { try { localStorage.setItem("yup_slip", JSON.stringify(state.slip.slice(0, 150))); } catch {} }
function deckCards() { return state.all.filter((c) => !state.seen.has(c.id) && c.close_ts - nowTs() > 1); }

// ── data ──────────────────────────────────────────────────────────────
async function load() {
  try {
    const r = await fetch(`/api/closing?mins=${state.mins}`);
    const d = await r.json();
    if (!r.ok) throw new Error(d?.detail || "load failed");
    state.offset = (d.server_now || Math.floor(Date.now() / 1000)) - Math.floor(Date.now() / 1000);
    mergeCards(d.cards || []);
  } catch {
    const el = $("#yupCountN"); if (el) el.textContent = "—";
  }
}
function mergeCards(fresh) {
  const have = new Set(state.all.map((c) => c.id));
  for (const c of fresh) {
    if (have.has(c.id) || c.close_ts - nowTs() <= 1) continue;
    state.all.push(c);
  }
  state.all = state.all.filter((c) => c.close_ts - nowTs() > 1);
  state.all.sort((a, b) => a.close_ts - b.close_ts);
  renderView();
}

// ── view dispatch ─────────────────────────────────────────────────────
function setView(v) {
  state.view = v;
  document.body.classList.toggle("list-mode", v === "list");
  document.querySelectorAll("#viewToggle button").forEach((b) => b.classList.toggle("active", b.dataset.v === v));
  state.topId = ""; state.listSig = "";
  renderView();
}
function renderView() {
  if (state.view === "list") renderList();
  else maybeRenderSwipe();
  const el = $("#yupCountN"); if (el) el.textContent = deckCards().length;
}

// ── swipe deck ────────────────────────────────────────────────────────
function maybeRenderSwipe() {
  if (state.dragging) return;
  const top = deckCards()[0]?.id || "";
  if (top !== state.topId) { state.topId = top; renderSwipe(); }
}
function renderSwipe() {
  [...deck.querySelectorAll(".card:not(.gone)")].forEach((el) => el.remove());
  const top3 = deckCards().slice(0, 3);
  if (!top3.length) { deckEmpty.hidden = false; return; }
  deckEmpty.hidden = true;
  top3.slice().reverse().forEach((c, ri) => {
    const idx = top3.length - 1 - ri;
    const el = cardEl(c);
    if (idx === 1) el.classList.add("s1");
    else if (idx >= 2) el.classList.add("s2");
    deck.appendChild(el);
  });
  const top = deck.querySelector(".card:not(.gone):last-child");
  if (top) attachDrag(top, deckCards()[0]);
  paintCountdowns();
}
function cardEl(c) {
  const el = document.createElement("div");
  el.className = "card";
  el.dataset.id = c.id; el.dataset.close = c.close_ts; el.dataset.open = c.open_ts || (c.close_ts - 900);
  const yes = Math.round((c.yes_price || 0) * 100), no = Math.round((c.no_price || 0) * 100);
  el.innerHTML = `
    <div class="card-drain"><div class="drain-fill"></div></div>
    <div class="card-glow"></div>
    <div class="stamp yes">YUP!</div>
    <div class="stamp no">NO</div>
    <div class="card-head">
      <span class="card-cat"><span class="emoji">${c.emoji || "🎲"}</span> <b>${esc(c.category)}</b> · ${c.platform === "kalshi" ? "KALSHI" : "POLY"}</span>
      <span class="card-vol">${c.volume_24h ? fmtUsd(c.volume_24h) + " vol" : "fresh"}</span>
    </div>
    <div class="card-countdown"><span class="cd-num">--:--</span><span class="cd-lbl">until close</span></div>
    <div class="card-q">${esc(c.title)}</div>
    <div class="card-odds">
      <div class="odd no"><span class="p">${no}¢</span><span class="l">No</span></div>
      <div class="odd yes"><span class="p">${yes}¢</span><span class="l">Yes</span></div>
    </div>`;
  return el;
}

// ── list view ─────────────────────────────────────────────────────────
function renderList() {
  const sig = state.all.map((c) => c.id).join("|");
  if (sig === state.listSig && listView.querySelector(".lrow")) { paintCountdowns(); return; }
  state.listSig = sig;
  if (!state.all.length) {
    listView.innerHTML = `<div class="deck-empty"><div class="big">🎲</div><strong>No bets closing in this window.</strong>Widen to 60M, or hang tight a minute.</div>`;
    return;
  }
  listView.innerHTML = state.all.map(listRow).join("");
  paintCountdowns();
}
function listRow(c) {
  const yes = Math.round((c.yes_price || 0) * 100), no = Math.round((c.no_price || 0) * 100);
  const called = state.called.get(c.id);
  return `<div class="lrow${called ? " called" : ""}" data-id="${escAttr(c.id)}" data-close="${c.close_ts}" data-open="${c.open_ts || (c.close_ts - 900)}">
    <div class="l-drain"></div>
    <div class="l-cd"><div class="n">--:--</div><div class="l">left</div></div>
    <div class="l-mid">
      <div class="l-cat">${c.emoji || "🎲"} ${esc(c.category)} · ${c.platform === "kalshi" ? "KALSHI" : "POLY"}</div>
      <div class="l-q">${esc(c.title)}</div>
    </div>
    <div class="l-action">
      <div class="l-odds">
        <button class="l-bet no" data-side="no"><span class="p">${no}¢</span><span class="s">No</span></button>
        <button class="l-bet yes" data-side="yes"><span class="p">${yes}¢</span><span class="s">Yes</span></button>
      </div>
      <div class="l-called ${called || ""}">${called ? (called === "yes" ? "✓ YUP" : "✓ NO") : ""}</div>
    </div>
  </div>`;
}
listView.addEventListener("click", (e) => {
  const btn = e.target.closest(".l-bet");
  if (!btn) return;
  const row = btn.closest(".lrow");
  const id = row?.dataset.id;
  if (!id || state.called.has(id)) return;
  const card = state.all.find((c) => c.id === id);
  if (!card) return;
  const side = btn.dataset.side;
  state.called.set(id, side);
  recordCall(card, side);
  row.classList.add("called");
  const lc = row.querySelector(".l-called");
  if (lc) { lc.className = `l-called ${side}`; lc.textContent = side === "yes" ? "✓ YUP" : "✓ NO"; }
});

// ── live countdowns (1s) ──────────────────────────────────────────────
function paintCountdowns() {
  const t = nowTs();
  deck.querySelectorAll(".card:not(.gone)").forEach((el) => paintCd(el, el.querySelector(".cd-num"), t));
  listView.querySelectorAll(".lrow").forEach((el) => paintCd(el, el.querySelector(".l-cd .n"), t));
  const before = state.all.length;
  state.all = state.all.filter((c) => c.close_ts - t > 0);
  if (state.all.length !== before) { state.topId = "__closed__"; state.listSig = ""; renderView(); }
}
function paintCd(el, num, t) {
  const close = Number(el.dataset.close);
  const open = Number(el.dataset.open) || close - 900;
  const left = close - t;
  // draining time-bar — shows this market's life remaining, urgency-colored
  const fill = el.querySelector(".drain-fill") || el.querySelector(".l-drain");
  if (fill) {
    const dur = Math.max(60, close - open);
    fill.style.width = Math.max(0, Math.min(100, (left / dur) * 100)).toFixed(1) + "%";
    const col = left <= 60 ? "var(--red)" : left <= 300 ? "var(--amber)" : "var(--lime)";
    fill.style.background = col;
    fill.style.boxShadow = `0 0 12px ${col}`;
  }
  if (left <= 0) { if (num) num.textContent = "CLOSED"; el.classList.remove("urgent"); el.classList.add("warn"); return; }
  const mm = Math.floor(left / 60), ss = left % 60;
  if (num) num.textContent = `${mm}:${String(ss).padStart(2, "0")}`;
  el.classList.toggle("urgent", left <= 60);
  el.classList.toggle("warn", left > 60 && left <= 300);
}

// ── swipe drag ────────────────────────────────────────────────────────
function attachDrag(el, card) {
  let sx = 0, sy = 0, dx = 0, dy = 0, active = false;
  const yesS = el.querySelector(".stamp.yes"), noS = el.querySelector(".stamp.no");
  el.addEventListener("pointerdown", (e) => {
    active = true; state.dragging = true; sx = e.clientX; sy = e.clientY; dx = dy = 0;
    el.style.transition = "none";
    try { el.setPointerCapture(e.pointerId); } catch {}
  });
  el.addEventListener("pointermove", (e) => {
    if (!active) return;
    dx = e.clientX - sx; dy = e.clientY - sy;
    el.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx * 0.05}deg)`;
    const r = Math.min(1, Math.abs(dx) / 110);
    yesS.style.opacity = dx > 0 ? r : 0;
    noS.style.opacity = dx < 0 ? r : 0;
  });
  const end = () => {
    if (!active) return;
    active = false; state.dragging = false;
    el.style.transition = "transform .3s cubic-bezier(.2,.7,.3,1)";
    if (dx > 100) commit("yes", card, el);
    else if (dx < -100) commit("no", card, el);
    else { el.style.transform = ""; yesS.style.opacity = 0; noS.style.opacity = 0; maybeRenderSwipe(); }
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
}

function commit(side, card, el) {
  if (!card) return;
  const dir = side === "no" ? -1 : 1;
  if (el) {
    el.classList.add("gone");
    el.style.transition = "transform .32s cubic-bezier(.2,.7,.3,1), opacity .32s";
    el.style.transform = `translate(${dir * (window.innerWidth || 500)}px, -40px) rotate(${dir * 22}deg)`;
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 340);
  }
  state.seen.add(card.id);
  if (side !== "skip") { state.called.set(card.id, side); recordCall(card, side); }
  state.topId = "__advance__";
  setTimeout(maybeRenderSwipe, 60);
}

// ── slip + streak game ────────────────────────────────────────────────
function recordCall(card, side) {
  state.slip.unshift({
    id: card.id, title: card.title, side,
    price: side === "yes" ? card.yes_price : card.no_price,
    link: card.link, ts: Date.now(), result: null,
  });
  state.slip = state.slip.slice(0, 150);
  saveSlip(); computeStats(); renderSlip(); toast(card, side);
  resolveSlip();
}

function toast(card, side) {
  const wrap = $("#yupToasts");
  const pct = Math.round((side === "yes" ? card.yes_price : card.no_price) * 100);
  const el = document.createElement("a");
  el.className = "yt"; el.href = card.link || "#"; el.target = "_blank"; el.rel = "noopener";
  el.innerHTML = `<span class="tag ${side}">${side === "yes" ? "YUP!" : "NO"}</span><span class="txt">${esc(card.title)} · ${pct}¢</span><span class="go">Trade ↗</span>`;
  wrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add("in"));
  setTimeout(() => { el.classList.remove("in"); setTimeout(() => el.remove(), 300); }, 3600);
  while (wrap.children.length > 3) wrap.firstElementChild.remove();
}

async function resolveSlip() {
  const ids = [...new Set(state.slip.filter((s) => !s.result && s.id).map((s) => s.id))];
  if (!ids.length) { computeStats(); return; }
  try {
    const r = await fetch(`/api/resolve?ids=${encodeURIComponent(ids.join(","))}`);
    const d = await r.json();
    const map = d.results || {};
    let updated = false;
    for (const s of state.slip) {
      if (s.result || !s.id) continue;
      const res = map[s.id];
      if (res && res.settled && res.result) { s.result = s.side === res.result ? "won" : "lost"; updated = true; }
    }
    if (updated) saveSlip();
  } catch {}
  computeStats(); renderSlip();
}

function computeStats() {
  const settled = state.slip.filter((s) => s.result === "won" || s.result === "lost");
  const wins = settled.filter((s) => s.result === "won").length;
  const losses = settled.length - wins;
  const rate = settled.length ? Math.round((wins / settled.length) * 100) : null;
  const chrono = settled.slice().sort((a, b) => a.ts - b.ts);
  let streak = 0;
  for (let i = chrono.length - 1; i >= 0; i--) { if (chrono[i].result === "won") streak++; else break; }
  if (streak > state.best) { state.best = streak; try { localStorage.setItem("yup_best", String(state.best)); } catch {} }
  $("#ssRecord") && ($("#ssRecord").textContent = `${wins}–${losses}`);
  $("#ssStreak") && ($("#ssStreak").textContent = `🔥 ${streak}`);
  $("#ssRate") && ($("#ssRate").textContent = rate == null ? "—" : `${rate}%`);
  const ss = $("#slipStats");
  if (ss) ss.innerHTML =
    `<span class="rec">record <b>${wins}–${losses}</b></span>` +
    `<span class="rate">win rate <b>${rate == null ? "—" : rate + "%"}</b></span>` +
    `<span class="strk">🔥 <b>${streak}</b> · best <b>${state.best}</b></span>`;
}

function renderSlip() {
  $("#slipCount").textContent = state.slip.length;
  const list = $("#slipList");
  if (!state.slip.length) { list.innerHTML = `<div class="slip-empty">No calls yet. Swipe a card — right to YUP (YES), left for NO.</div>`; return; }
  list.innerHTML = state.slip.slice(0, 50).map((s) => {
    const tail = s.result === "won" ? `<span class="slip-status won">✓ WON</span>`
      : s.result === "lost" ? `<span class="slip-status lost">✗ LOST</span>`
      : `<a class="slip-trade" href="${escAttr(s.link)}" target="_blank" rel="noopener">Trade ↗</a>`;
    return `<div class="slip-row ${s.result || "pending"}">
      <span class="slip-side ${s.side}">${s.side === "yes" ? "YES" : "NO"}</span>
      <div class="slip-q">${esc(s.title)} <span class="sub">@ ${Math.round((s.price || 0) * 100)}¢</span></div>
      ${tail}
    </div>`;
  }).join("");
}

// ── controls ──────────────────────────────────────────────────────────
const topCard = () => deckCards()[0];
const topEl = () => deck.querySelector(".card:not(.gone):last-child");
$("#btnYup").onclick = () => { const c = topCard(); if (c) commit("yes", c, topEl()); };
$("#btnNah").onclick = () => { const c = topCard(); if (c) commit("no", c, topEl()); };
$("#btnSkip").onclick = () => { const c = topCard(); if (c) commit("skip", c, topEl()); };
document.addEventListener("keydown", (e) => {
  if (state.view !== "swipe") return;
  if (e.key === "ArrowRight") { const c = topCard(); if (c) commit("yes", c, topEl()); }
  else if (e.key === "ArrowLeft") { const c = topCard(); if (c) commit("no", c, topEl()); }
  else if (e.key === "ArrowDown" || e.key === " ") { e.preventDefault(); const c = topCard(); if (c) commit("skip", c, topEl()); }
});
document.querySelectorAll("#viewToggle button").forEach((b) => (b.onclick = () => setView(b.dataset.v)));
document.querySelectorAll("#yupWindow button").forEach((b) => (b.onclick = () => {
  state.mins = Number(b.dataset.m);
  document.querySelectorAll("#yupWindow button").forEach((x) => x.classList.toggle("active", x === b));
  state.all = []; state.topId = ""; state.listSig = ""; renderView();
  load();
}));
$("#slipToggle").onclick = () => $("#slipPanel").classList.add("open");
$("#slipClose").onclick = () => $("#slipPanel").classList.remove("open");

// ── boot ──────────────────────────────────────────────────────────────
renderSlip(); computeStats(); load(); resolveSlip();
setInterval(paintCountdowns, 1000);
setInterval(() => { if (!document.hidden && !state.dragging) load(); }, 12000);
setInterval(() => { if (!document.hidden) resolveSlip(); }, 30000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) { load(); resolveSlip(); } });
