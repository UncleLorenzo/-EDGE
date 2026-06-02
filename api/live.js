import { kalshiMarketUrl } from "../lib/kalshi-link.js";
import { polyEventUrl } from "../lib/poly-link.js";

// EDGE LIVE — the in-play momentum feed. Aggregates the markets that are LIVE
// right now (games in progress + fast-resolving crypto/econ) across venues, so
// the client can rank them by real-time momentum. Our answer to SpeedLabs'
// "Momentum Markets": we don't create markets, we surface every live one that
// already exists and tell you which way it's running.

const KBASE = "https://api.elections.kalshi.com/trade-api/v2";
const KH = { "User-Agent": "Mozilla/5.0 (edge-live)", Accept: "application/json" };
const POLY = "https://gamma-api.polymarket.com/markets?closed=false&active=true&order=volume24hr&ascending=false&limit=400";

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const clamp = (p) => Math.max(0, Math.min(1, num(p)));
function arr(v) { if (Array.isArray(v)) return v; try { const x = JSON.parse(v); return Array.isArray(x) ? x : []; } catch { return []; } }
function isoUnix(s) { if (!s) return null; const t = Date.parse(s); return Number.isFinite(t) ? Math.floor(t / 1000) : null; }
// Kalshi multi-game parlays concatenate every leg into one title — skip the junk.
function isParlay(text, ticker) {
  if (/kxmve|multigame|crosscategory|multimarket/i.test(ticker || "")) return true;
  return ((text || "").match(/,\s*(yes|no)\b/gi) || []).length >= 2;
}

// kind drives the filter tabs (Sports / Crypto / All) + the card face.
function classify(text) {
  const s = (text || "").toLowerCase();
  // ticker/league-based sports detection first — the title is often just a team
  // name ("Royals win"), so the Kalshi series prefix is the reliable signal.
  if (/kxmlb/.test(s)) return { kind: "sport", cat: "MLB", emoji: "⚾" };
  if (/kxnba|kxwnba/.test(s)) return { kind: "sport", cat: "NBA", emoji: "🏀" };
  if (/kxnhl/.test(s)) return { kind: "sport", cat: "NHL", emoji: "🏒" };
  if (/kxnflgame|kxnflweek|kxsuperbowl/.test(s)) return { kind: "sport", cat: "NFL", emoji: "🏈" };
  if (/kxufc|kxmma|kxbox/.test(s)) return { kind: "sport", cat: "Fight", emoji: "🥊" };
  if (/kxsoccer|kxepl|kxucl|kxlaliga|kxmls|kxserie|kxbundes|kxuefa/.test(s)) return { kind: "sport", cat: "Soccer", emoji: "⚽" };
  if (/kxmvesports|kxmvemultigame|kxmvecross/.test(s)) return { kind: "sport", cat: "Sports", emoji: "🏆" };
  if (/\bnba\b|basketball|: \d+\+|brunson|doncic|finals/.test(s)) return { kind: "sport", cat: "NBA", emoji: "🏀" };
  if (/\bnfl\b|\btouchdown\b|quarterback/.test(s)) return { kind: "sport", cat: "NFL", emoji: "🏈" };
  if (/\bmlb\b|baseball|\bruns?\b|innings?|\brbi\b|home run/.test(s)) return { kind: "sport", cat: "MLB", emoji: "⚾" };
  if (/\bnhl\b|hockey|stanley cup|\bgoals?\b|\bpuck\b/.test(s)) return { kind: "sport", cat: "NHL", emoji: "🏒" };
  if (/\bwnba\b/.test(s)) return { kind: "sport", cat: "WNBA", emoji: "🏀" };
  if (/\bufc\b|\bmma\b|boxing|fight/.test(s)) return { kind: "sport", cat: "Fight", emoji: "🥊" };
  if (/soccer|\bfc\b|premier league|la liga|world cup/.test(s)) return { kind: "sport", cat: "Soccer", emoji: "⚽" };
  if (/ vs\.? | @ |wins by|\bbeats\b|spread|over\/under|\bo\/u\b|moneyline|runs scored|to win\b/.test(s)) return { kind: "sport", cat: "Sports", emoji: "🏆" };
  if (/\bbtc\b|bitcoin/.test(s)) return { kind: "crypto", cat: "Bitcoin", emoji: "₿" };
  if (/\beth\b|ethereum/.test(s)) return { kind: "crypto", cat: "Ethereum", emoji: "Ξ" };
  if (/\bsol\b|solana/.test(s)) return { kind: "crypto", cat: "Solana", emoji: "◎" };
  if (/\bxrp\b|ripple/.test(s)) return { kind: "crypto", cat: "XRP", emoji: "✕" };
  if (/doge|\bhype\b|\bbnb\b|crypto|\bprice\b/.test(s)) return { kind: "crypto", cat: "Crypto", emoji: "🪙" };
  if (/\bfed\b|\bcpi\b|\bgdp\b|gas price|inflation|jobs|rate\b/.test(s)) return { kind: "econ", cat: "Econ", emoji: "📈" };
  if (/temp|weather|rain|degrees|snow/.test(s)) return { kind: "other", cat: "Weather", emoji: "🌡️" };
  return { kind: "other", cat: "Markets", emoji: "🎲" };
}

// liveness: a default rank before the client overlays real momentum. Floats
// in-progress games, imminent closes, and fast crypto to the top.
function liveScore(c, now) {
  const tl = c.close_ts - now;
  let s = Math.min(c.volume_24h, 3000) + c.open_interest * 0.3; // cap raw vol so daily whales don't bury live games
  if (tl <= 10800) s += 6000;                              // closing within 3h → likely in-play
  if (tl <= 3600) s += 3000;                               // within 1h → very live
  if (c.kind === "sport") s += 5000;                       // sports is the headline
  if (c.kind === "crypto") s += 2500;                      // crypto always moves
  if (c.kind === "crypto" && tl <= 1800) s += 4000;        // sub-30m crypto = pure momentum
  if (c.kind === "other") s -= 2000;                       // generic daily markets sink
  return s;
}

async function fetchKalshi(now, windowSec) {
  const url = `${KBASE}/markets?status=open&min_close_ts=${now}&max_close_ts=${now + windowSec}&limit=1000`;
  let data;
  try { const r = await fetch(url, { headers: KH }); data = r.ok ? await r.json() : { markets: [] }; }
  catch { data = { markets: [] }; }
  const out = [];
  for (const m of data.markets || []) {
    const closeTs = isoUnix(m.close_time);
    if (!closeTs || closeTs <= now) continue;
    const yes = num(m.yes_ask_dollars) || num(m.last_price_dollars);
    if (!yes || yes < 0.02 || yes > 0.98) continue;
    const vol = num(m.volume_24h_fp), oi = num(m.open_interest_fp);
    const c = classify(`${m.title} ${m.event_ticker}`);
    // drop dead generic markets; keep sport games + crypto even if 0-vol (they fill in live)
    if (vol <= 0 && oi <= 0 && c.kind !== "sport" && c.kind !== "crypto") continue;
    const sub = (m.yes_sub_title || "").trim();
    const title = sub && !/^(yes|no)$/i.test(sub) ? `${m.title} — ${sub}` : m.title || "";
    if (isParlay(`${m.title} ${sub}`, m.event_ticker)) continue; // no concatenated parlay junk-titles
    const series = (m.event_ticker || "").split("-")[0];
    out.push({
      id: `k_${m.ticker}`, platform: "kalshi", title, kind: c.kind, category: c.cat, emoji: c.emoji,
      yes_price: clamp(yes), no_price: clamp(num(m.no_ask_dollars) || 1 - yes),
      volume_24h: vol, open_interest: oi, close_ts: closeTs, open_ts: isoUnix(m.open_time),
      link: kalshiMarketUrl(series, m.event_ticker), yes_token: null,
    });
  }
  return out;
}

async function fetchPoly(now, windowSec) {
  let data;
  try { const r = await fetch(POLY, { headers: { "User-Agent": "edge-live/1.0" } }); data = r.ok ? await r.json() : []; }
  catch { data = []; }
  const out = [];
  for (const m of Array.isArray(data) ? data : []) {
    const closeTs = isoUnix(m.endDate || m.endDateIso);
    if (!closeTs || closeTs <= now || closeTs > now + windowSec) continue;
    const prices = arr(m.outcomePrices), outcomes = arr(m.outcomes);
    const yi = outcomes.findIndex((o) => /yes/i.test(String(o)));
    const yes = parseFloat(prices[yi >= 0 ? yi : 0]);
    if (!Number.isFinite(yes) || yes < 0.02 || yes > 0.98) continue;
    const c = classify(m.question);
    out.push({
      id: `p_${m.id}`, platform: "polymarket", title: m.question || "", kind: c.kind, category: c.cat, emoji: c.emoji,
      yes_price: clamp(yes), no_price: clamp(1 - yes),
      volume_24h: num(m.volume24hr ?? m.volume24hrClob), open_interest: 0,
      close_ts: closeTs, open_ts: isoUnix(m.startDate || m.createdAt),
      link: polyEventUrl(m), yes_token: arr(m.clobTokenIds)[yi >= 0 ? yi : 0] || null,
    });
  }
  return out;
}

export default async function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  const hours = Math.min(24, Math.max(1, Number(url.searchParams.get("hours")) || 6));
  const windowSec = hours * 3600;
  const now = Math.floor(Date.now() / 1000);

  try {
    const [k, p] = await Promise.all([fetchKalshi(now, windowSec), fetchPoly(now, windowSec)]);
    const all = [...k, ...p];
    all.sort((a, b) => liveScore(b, now) - liveScore(a, now));
    const cards = all.slice(0, 70);

    const counts = cards.reduce((o, c) => { o[c.kind] = (o[c.kind] || 0) + 1; return o; }, {});
    res.setHeader("Cache-Control", "public, s-maxage=4, stale-while-revalidate=20");
    res.status(200).json({
      cards, server_now: now, window_hours: hours, count: cards.length,
      by_kind: counts, by_platform: { kalshi: k.length, polymarket: p.length },
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    res.status(502).json({ error: "live_failed", detail: String(err?.message || err) });
  }
}
