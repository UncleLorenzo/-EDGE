// YUP! — Tinder for closing-soon prediction markets.
// Swipe right = YUP (bet YES), left = NAH (bet NO), down/skip = pass.
// Live countdowns, auto-evolving deck (new markets in, closed ones out),
// a "slip" of your calls (localStorage), and a trade-out CTA per call.
import { fmtUsd } from "/lib/client/format.js";

const $ = (s) => document.querySelector(s);
const deck = $("#deck");
const deckEmpty = $("#deckEmpty");

const state = {
  cards: [],          // card data, sorted by close_ts asc
  offset: 0,          // server_now − localNow (seconds), to sync countdowns
  mins: 30,
  seen: new Set(),    // ids already swiped/skipped/closed
  slip: loadSlip(),
  dragging: false,
  topId: "",
};

const nowTs = () => Math.floor(Date.now() / 1000) + state.offset;
const esc = (s) => { const d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; };
const escAttr = (s) => esc(s).replace(/"/g, "&quot;");
function loadSlip() { try { return JSON.parse(localStorage.getItem("yup_slip") || "[]"); } catch { return []; } }
function saveSlip() { try { localStorage.setItem("yup_slip", JSON.stringify(state.slip.slice(0, 100))); } catch {} }

// ── data ──────────────────────────────────────────────────────────────
async function load() {
  try {
    const r = await fetch(`/api/closing?mins=${state.mins}`);
    const d = await r.json();
    if (!r.ok) throw new Error(d?.detail || "load failed");
    state.offset = (d.server_now || Math.floor(Date.now() / 1000)) - Math.floor(Date.now() / 1000);
    mergeCards(d.cards || []);
    $("#yupCount").innerHTML = `<span class="d"></span>${state.cards.length} closing soon`;
  } catch {
    $("#yupCount").innerHTML = `<span class="d" style="background:var(--red);box-shadow:0 0 10px var(--red)"></span>feed error`;
  }
}

function mergeCards(fresh) {
  const have = new Set(state.cards.map((c) => c.id));
  for (const c of fresh) {
    if (state.seen.has(c.id) || have.has(c.id)) continue;
    if (c.close_ts - nowTs() <= 1) continue;
    state.cards.push(c);
  }
  state.cards = state.cards.filter((c) => c.close_ts - nowTs() > 1 && !state.seen.has(c.id));
  state.cards.sort((a, b) => a.close_ts - b.close_ts);
  maybeRender();
}

// re-render only when the TOP card identity changes (avoids flashing on refresh)
function maybeRender() {
  if (state.dragging) return;
  const top = state.cards[0]?.id || "";
  if (top !== state.topId) { state.topId = top; renderDeck(); }
}

// ── deck render ───────────────────────────────────────────────────────
function renderDeck() {
  [...deck.querySelectorAll(".card:not(.gone)")].forEach((el) => el.remove());
  const top3 = state.cards.slice(0, 3);
  if (!top3.length) { deckEmpty.hidden = false; return; }
  deckEmpty.hidden = true;
  // append back→front so cards[0] ends up the top (last) sibling
  top3.slice().reverse().forEach((c, ri) => {
    const idx = top3.length - 1 - ri; // 0 = top
    const el = cardEl(c);
    if (idx === 1) el.classList.add("s1");
    else if (idx >= 2) el.classList.add("s2");
    deck.appendChild(el);
  });
  const top = deck.querySelector(".card:not(.gone):last-child");
  if (top) attachDrag(top, state.cards[0]);
  paintCountdowns();
}

function cardEl(c) {
  const el = document.createElement("div");
  el.className = "card";
  el.dataset.id = c.id;
  el.dataset.close = c.close_ts;
  const yes = Math.round((c.yes_price || 0) * 100);
  const no = Math.round((c.no_price || 0) * 100);
  el.innerHTML = `
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

// ── live countdowns (every 1s) ────────────────────────────────────────
function paintCountdowns() {
  const t = nowTs();
  let topClosed = false;
  deck.querySelectorAll(".card:not(.gone)").forEach((el) => {
    const left = Number(el.dataset.close) - t;
    const num = el.querySelector(".cd-num");
    const isTop = !el.classList.contains("s1") && !el.classList.contains("s2");
    if (left <= 0) {
      num.textContent = "CLOSED";
      el.classList.remove("urgent"); el.classList.add("warn");
      if (isTop) topClosed = true;
      return;
    }
    const mm = Math.floor(left / 60), ss = left % 60;
    num.textContent = `${mm}:${String(ss).padStart(2, "0")}`;
    el.classList.toggle("urgent", left <= 60);
    el.classList.toggle("warn", left > 60 && left <= 300);
  });
  if (topClosed && state.cards[0]) {
    state.seen.add(state.cards[0].id);
    state.cards.shift();
    state.topId = "__closed__";
    maybeRender();
  }
}

// ── swipe drag ────────────────────────────────────────────────────────
function attachDrag(el, card) {
  let sx = 0, sy = 0, dx = 0, dy = 0, active = false;
  const yesS = el.querySelector(".stamp.yes");
  const noS = el.querySelector(".stamp.no");
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
    else {
      el.style.transform = "";
      yesS.style.opacity = 0; noS.style.opacity = 0;
      maybeRender();
    }
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
}

// ── commit (yes / no / skip) ──────────────────────────────────────────
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
  state.cards = state.cards.filter((c) => c.id !== card.id);
  if (side !== "skip") recordCall(card, side);
  state.topId = "__advance__";
  setTimeout(maybeRender, 60);
}

function recordCall(card, side) {
  state.slip.unshift({
    title: card.title, side,
    price: side === "yes" ? card.yes_price : card.no_price,
    link: card.link, ts: Date.now(),
  });
  state.slip = state.slip.slice(0, 100);
  saveSlip();
  renderSlip();
  toast(card, side);
}

// ── trade-out toast ───────────────────────────────────────────────────
function toast(card, side) {
  const wrap = $("#yupToasts");
  const pct = Math.round((side === "yes" ? card.yes_price : card.no_price) * 100);
  const el = document.createElement("a");
  el.className = "yt";
  el.href = card.link || "#"; el.target = "_blank"; el.rel = "noopener";
  el.innerHTML = `<span class="tag ${side}">${side === "yes" ? "YUP!" : "NO"}</span><span class="txt">${esc(card.title)} · ${pct}¢</span><span class="go">Trade ↗</span>`;
  wrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add("in"));
  setTimeout(() => { el.classList.remove("in"); setTimeout(() => el.remove(), 300); }, 3600);
  while (wrap.children.length > 3) wrap.firstElementChild.remove();
}

// ── slip ──────────────────────────────────────────────────────────────
function renderSlip() {
  $("#slipCount").textContent = state.slip.length;
  const list = $("#slipList");
  if (!state.slip.length) {
    list.innerHTML = `<div class="slip-empty">No calls yet. Swipe a card — right to YUP (YES), left for NO.</div>`;
    return;
  }
  list.innerHTML = state.slip.slice(0, 40).map((s) => `
    <div class="slip-row">
      <span class="slip-side ${s.side}">${s.side === "yes" ? "YES" : "NO"}</span>
      <div class="slip-q">${esc(s.title)} <span class="sub">@ ${Math.round((s.price || 0) * 100)}¢</span></div>
      <a class="slip-trade" href="${escAttr(s.link)}" target="_blank" rel="noopener">Trade ↗</a>
    </div>`).join("");
}

// ── controls ──────────────────────────────────────────────────────────
const topCard = () => state.cards[0];
const topEl = () => deck.querySelector(".card:not(.gone):last-child");
$("#btnYup").onclick = () => { const c = topCard(); if (c) commit("yes", c, topEl()); };
$("#btnNah").onclick = () => { const c = topCard(); if (c) commit("no", c, topEl()); };
$("#btnSkip").onclick = () => { const c = topCard(); if (c) commit("skip", c, topEl()); };
document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") { const c = topCard(); if (c) commit("yes", c, topEl()); }
  else if (e.key === "ArrowLeft") { const c = topCard(); if (c) commit("no", c, topEl()); }
  else if (e.key === "ArrowDown" || e.key === " ") { e.preventDefault(); const c = topCard(); if (c) commit("skip", c, topEl()); }
});

$("#slipToggle").onclick = () => $("#slipPanel").classList.add("open");
$("#slipClose").onclick = () => $("#slipPanel").classList.remove("open");
document.querySelectorAll("#yupWindow button").forEach((b) => {
  b.onclick = () => {
    state.mins = Number(b.dataset.m);
    document.querySelectorAll("#yupWindow button").forEach((x) => x.classList.toggle("active", x === b));
    state.cards = []; state.topId = ""; renderDeck();
    load();
  };
});

// ── boot ──────────────────────────────────────────────────────────────
renderSlip();
load();
setInterval(paintCountdowns, 1000);
setInterval(() => { if (!document.hidden && !state.dragging) load(); }, 12000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
