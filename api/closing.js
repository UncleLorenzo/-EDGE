import { kalshiMarketUrl } from "../lib/kalshi-link.js";
import { polyEventUrl } from "../lib/poly-link.js";

// YUP! — the "closing out now" feed. Markets that settle within the next ~window
// minutes, soonest first. Built for instant gratification: bets that resolve in
// minutes. Kalshi is the engine (hourly + "up in next 15 min" crypto markets
// close constantly); Polymarket adds whatever short-dated markets it has live.

const KBASE = "https://api.elections.kalshi.com/trade-api/v2";
const KH = { "User-Agent": "Mozilla/5.0 (edge-yup)", Accept: "application/json" };
const POLY = "https://gamma-api.polymarket.com/markets?closed=false&active=true&order=endDate&ascending=true&limit=500";

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const clamp = (p) => Math.max(0, Math.min(1, num(p)));
function arr(v) { if (Array.isArray(v)) return v; try { const x = JSON.parse(v); return Array.isArray(x) ? x : []; } catch { return []; } }
function isoUnix(s) { if (!s) return null; const t = Date.parse(s); return Number.isFinite(t) ? Math.floor(t / 1000) : null; }
// Kalshi multi-game parlays dump every leg into one title ("yes A,yes B,no C,…")
// — unreadable garbage in a swipe card. Skip them; we only want clean single bets.
function isParlay(text, ticker) {
  if (/kxmve|multigame|crosscategory|multimarket/i.test(ticker || "")) return true;
  return ((text || "").match(/,\s*(yes|no)\b/gi) || []).length >= 2;
}

// Coarse category + emoji for the card face.
function catFor(text) {
  const s = (text || "").toLowerCase();
  if (/\bbtc\b|bitcoin/.test(s)) return { cat: "Bitcoin", emoji: "₿" };
  if (/\beth\b|ethereum/.test(s)) return { cat: "Ethereum", emoji: "Ξ" };
  if (/\bsol\b|solana/.test(s)) return { cat: "Solana", emoji: "◎" };
  if (/\bxrp\b|ripple/.test(s)) return { cat: "XRP", emoji: "✕" };
  if (/doge|hype|crypto|\bprice\b/.test(s)) return { cat: "Crypto", emoji: "🪙" };
  if (/\bnba\b|\bnfl\b|\bmlb\b|\bnhl\b|soccer|\bgame\b| vs\.? |win\b|match/.test(s)) return { cat: "Sports", emoji: "🏆" };
  if (/\bfed\b|\bcpi\b|\bgdp\b|jobs|inflation|rate\b/.test(s)) return { cat: "Econ", emoji: "📈" };
  if (/temp|weather|rain|degrees|snow/.test(s)) return { cat: "Weather", emoji: "🌡️" };
  if (/trump|biden|election|senate|president|congress/.test(s)) return { cat: "Politics", emoji: "🏛️" };
  return { cat: "Markets", emoji: "🎲" };
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
    if (!yes || yes < 0.02 || yes > 0.98) continue; // tradeable, near-the-money
    if (num(m.volume_24h_fp) <= 0 && num(m.open_interest_fp) <= 0 && num(m.liquidity_dollars) <= 0) continue;
    const sub = (m.yes_sub_title || "").trim();
    const title = sub && !/^(yes|no)$/i.test(sub) ? `${m.title} — ${sub}` : m.title || "";
    if (isParlay(`${m.title} ${sub}`, m.event_ticker)) continue; // no concatenated parlay junk-titles
    const c = catFor(`${m.title} ${m.event_ticker}`);
    const series = (m.event_ticker || "").split("-")[0];
    out.push({
      id: `k_${m.ticker}`,
      platform: "kalshi",
      title,
      category: c.cat,
      emoji: c.emoji,
      yes_price: clamp(yes),
      no_price: clamp(num(m.no_ask_dollars) || 1 - yes),
      volume_24h: num(m.volume_24h_fp),
      close_ts: closeTs,
      open_ts: isoUnix(m.open_time),
      link: kalshiMarketUrl(series, m.event_ticker),
      yes_token: null,
    });
  }
  return out;
}

async function fetchPoly(now, windowSec) {
  let data;
  try { const r = await fetch(POLY, { headers: { "User-Agent": "edge-yup/1.0" } }); data = r.ok ? await r.json() : []; }
  catch { data = []; }
  const out = [];
  for (const m of Array.isArray(data) ? data : []) {
    const closeTs = isoUnix(m.endDate || m.endDateIso);
    if (!closeTs || closeTs <= now || closeTs > now + windowSec) continue;
    const prices = arr(m.outcomePrices);
    const outcomes = arr(m.outcomes);
    const yi = outcomes.findIndex((o) => /yes/i.test(String(o)));
    const yes = parseFloat(prices[yi >= 0 ? yi : 0]);
    if (!Number.isFinite(yes) || yes < 0.02 || yes > 0.98) continue;
    const c = catFor(m.question);
    out.push({
      id: `p_${m.id}`,
      platform: "polymarket",
      title: m.question || "",
      category: c.cat,
      emoji: c.emoji,
      yes_price: clamp(yes),
      no_price: clamp(1 - yes),
      volume_24h: num(m.volume24hr ?? m.volume24hrClob),
      close_ts: closeTs,
      open_ts: isoUnix(m.startDate || m.startDateIso || m.createdAt),
      link: polyEventUrl(m),
      yes_token: arr(m.clobTokenIds)[yi >= 0 ? yi : 0] || null,
    });
  }
  return out;
}

export default async function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  const mins = Math.min(120, Math.max(2, Number(url.searchParams.get("mins")) || 30));
  const windowSec = mins * 60;
  const now = Math.floor(Date.now() / 1000);

  try {
    const [k, p] = await Promise.all([fetchKalshi(now, windowSec), fetchPoly(now, windowSec)]);
    const cards = [...k, ...p].sort((a, b) => a.close_ts - b.close_ts).slice(0, 80);

    res.setHeader("Cache-Control", "public, s-maxage=3, stale-while-revalidate=20");
    res.status(200).json({
      cards,
      server_now: now,
      window_mins: mins,
      count: cards.length,
      by_platform: { kalshi: k.length, polymarket: p.length },
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    res.status(502).json({ error: "closing_failed", detail: String(err?.message || err) });
  }
}
