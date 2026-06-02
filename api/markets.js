// Aggregates top markets from Polymarket (Gamma API) and Kalshi (events with nested markets).
// Polymarket has open CORS; Kalshi rejects browser Origin headers, so this proxy is required.
// Vercel caches the response (see vercel.json) — clients can poll without hammering upstream.

// Limit bumped 30 → 200 to give cross-product matchers (arb radar, divergence
// radar, buzz heat) a wider surface. Per-page consumers can still slice their
// own top-N from the response.
import { polyEventUrl } from "../lib/poly-link.js";
import { kalshiMarketUrl } from "../lib/kalshi-link.js";

const POLY_URL =
  "https://gamma-api.polymarket.com/markets?closed=false&active=true&limit=200&order=volume24hr&ascending=false";
const KALSHI_URL =
  "https://api.elections.kalshi.com/trade-api/v2/events?status=open&with_nested_markets=true&limit=200";
const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";
// High-volume recurring series the default /events listing under-surfaces.
// Crypto + macro dominate Kalshi volume (BTC daily price alone trades ~$1M/24h)
// but the unsorted feed buries them under novelty markets, so pull explicitly.
const KALSHI_SERIES = ["KXBTCD", "KXETHD", "KXBTC", "KXETH", "KXBTCMAXY", "KXETHMAXY", "KXFED", "KXCPIYOY"];

export default async function handler(req, res) {
  try {
    const [poly, kalshi] = await Promise.all([fetchPolymarket(), fetchKalshi()]);
    const markets = [...poly, ...kalshi].sort((a, b) => b.volume_24h - a.volume_24h);

    const stats = {
      total_volume_24h: markets.reduce((s, m) => s + m.volume_24h, 0),
      total_volume: markets.reduce((s, m) => s + m.total_volume, 0),
      total_markets: markets.length,
      hot_markets: markets.filter((m) => m.volume_24h >= 100_000).length,
      by_source: { polymarket: poly.length, kalshi: kalshi.length },
    };

    res.status(200).json({
      markets,
      stats,
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    res.status(502).json({ error: "upstream_failed", detail: String(err && err.message || err) });
  }
}

async function fetchPolymarket() {
  const r = await fetch(POLY_URL, {
    headers: { "User-Agent": "edge-aggregator/1.0" },
  });
  if (!r.ok) throw new Error(`polymarket ${r.status}`);
  const data = await r.json();

  return data
    .map((m) => {
      const prices = safeParseArray(m.outcomePrices);
      const outcomes = safeParseArray(m.outcomes);
      const yesIdx = outcomes.findIndex((o) => /yes/i.test(String(o)));
      const yes = parseFloat(prices[yesIdx >= 0 ? yesIdx : 0]);
      const no = parseFloat(prices[yesIdx >= 0 ? 1 - yesIdx : 1]);
      const v24 = num(m.volume24hr ?? m.volume24hrClob);
      const vTotal = num(m.volume ?? m.volumeNum);
      const clobIds = safeParseArray(m.clobTokenIds);
      return {
        id: `poly_${m.id}`,
        source: "polymarket",
        title: m.question,
        category: deriveCategory(m.question, m.slug),
        slug: m.slug,
        yes_token: clobIds[yesIdx >= 0 ? yesIdx : 0] || null,
        no_token: clobIds[yesIdx >= 0 ? 1 - yesIdx : 1] || null,
        yes_price: clampPrice(yes),
        no_price: clampPrice(Number.isFinite(no) ? no : 1 - yes),
        volume_24h: v24,
        total_volume: vTotal,
        liquidity: num(m.liquidityNum ?? m.liquidity),
        end_date: m.endDate || m.endDateIso || null,
        price_change_24h: num(m.oneDayPriceChange),
        price_change_1h: num(m.oneHourPriceChange),
        last_trade_price: num(m.lastTradePrice),
        link: polyEventUrl(m),
        image: m.image || m.icon || null,
      };
    })
    .filter((m) => m.title && Number.isFinite(m.yes_price) && m.volume_24h > 0);
}

async function fetchKalshi() {
  const headers = { "User-Agent": "Mozilla/5.0 (edge-aggregator)", Accept: "application/json" };
  const urls = [
    KALSHI_URL,
    ...KALSHI_SERIES.map((s) => `${KALSHI_BASE}/events?series_ticker=${s}&status=open&with_nested_markets=true`),
  ];
  // Fetch the general feed + each hot series in parallel; tolerate any single
  // failure (a retired series ticker shouldn't sink the whole response).
  const results = await Promise.allSettled(
    urls.map((u) => fetch(u, { headers }).then((r) => (r.ok ? r.json() : { events: [] }))),
  );
  if (results[0].status === "rejected") throw new Error("kalshi general feed failed");

  // Merge + dedupe by event_ticker (general feed and series overlap).
  const seen = new Set();
  const events = [];
  for (const res of results) {
    if (res.status !== "fulfilled") continue;
    for (const e of res.value.events || []) {
      if (e.event_ticker && !seen.has(e.event_ticker)) {
        seen.add(e.event_ticker);
        events.push(e);
      }
    }
  }

  const out = [];
  for (const e of events) {
    const ms = e.markets || [];
    if (!ms.length) continue;
    const v24 = ms.reduce((s, m) => s + num(m.volume_24h_fp), 0);
    if (v24 < 1) continue;
    const vTotal = ms.reduce((s, m) => s + num(m.volume_fp), 0);
    const top = ms.reduce((best, m) =>
      num(m.volume_24h_fp) > num(best.volume_24h_fp) ? m : best,
    );
    const yes = num(top.yes_ask_dollars);
    const no = num(top.no_ask_dollars);
    const last = num(top.last_price_dollars);
    const prev = num(top.previous_price_dollars);

    // Strike ladders + multi-outcome events are ambiguous from the event title
    // alone ("BTC price on May 30?"). Append the leading contract's strike or
    // candidate so the row is meaningful — and so matchers see the threshold.
    const sub = (top.yes_sub_title || "").trim();
    const title =
      sub && !/^(yes|no)$/i.test(sub) ? `${e.title} — ${sub}` : e.title || top.title || "";

    // skip Kalshi multi-game parlays — their titles are concatenated leg junk
    if (/kxmve|multigame|crosscategory|multimarket/i.test(`${e.event_ticker || ""} ${e.series_ticker || ""}`) || (title.match(/,\s*(yes|no)\b/gi) || []).length >= 2) continue;

    out.push({
      id: `kalshi_${e.event_ticker}`,
      source: "kalshi",
      title,
      category: e.category || "Other",
      slug: e.event_ticker,
      yes_price: clampPrice(yes),
      no_price: clampPrice(no || (yes ? 1 - yes : 0)),
      volume_24h: v24,
      total_volume: vTotal,
      liquidity: num(top.liquidity_dollars),
      end_date: top.close_time || e.expiration_time || null,
      price_change_24h: prev ? last - prev : 0,
      price_change_1h: 0,
      last_trade_price: last,
      link: kalshiMarketUrl(e.series_ticker, e.event_ticker),
      image: null,
    });
  }
  return out;
}

function safeParseArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v !== "string") return [];
  try {
    const p = JSON.parse(v);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}
function num(v) {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}
function clampPrice(p) {
  if (!Number.isFinite(p)) return 0;
  return Math.max(0, Math.min(1, p));
}

// Polymarket markets don't carry an explicit category; derive a coarse one from the question
// text so the UI can group them. Kalshi categories come from upstream directly.
function deriveCategory(question, slug) {
  const q = `${question || ""} ${slug || ""}`.toLowerCase();
  // Sports first — many sports market titles also mention countries (e.g. "Indian Premier League")
  // which would otherwise get misclassified as Geopolitics.
  if (/( fc | fc\b|epl|premier league|champions league|la liga|serie a|bundesliga|world cup|nfl|nba|mlb|nhl|mls|ncaa|super bowl|finals|playoff|lakers|celtics|warriors|chiefs|cowboys|yankees|west ham|liverpool|arsenal|chelsea|manchester|real madrid|barcelona|bayern|psg|juventus|inter milan|game [0-9]|atp|wta|roland garros|wimbledon|french open|us open|australian open|formula 1|f1\b|nascar|ufc|mma|boxing|ipl|indian premier league|cricket|lol\b|league of legends|dota|esports|valorant|csgo|counter-strike)/.test(q)) return "Sports";
  if (/(trump|biden|election|impeach|congress|senate|president|gop|democrat|republican|harris|vance|cabinet|attorney general|pope|prime minister|chancellor)/.test(q)) return "Politics";
  if (/(bitcoin|btc|ether|ethereum|crypto|sol\b|solana|doge|memecoin|stablecoin|dogecoin)/.test(q)) return "Crypto";
  if (/(iran|israel|ukraine|russia|china|nato|war\b|peace deal|hostage|gaza|hamas|hezbollah|north korea|taiwan|strait of hormuz|ceasefire|missile|sanctions|treaty)/.test(q)) return "Geopolitics";
  if (/(fed\b|interest rate|rate cut|recession|gdp|inflation|jobs report|powell|fomc|cpi|unemployment)/.test(q)) return "Macro";
  if (/(taylor swift|kelce|drake|grammy|oscar|kardashian|beyonce|netflix|movie|album|wedding|james bond|met gala|emmy|tony award|box office)/.test(q)) return "Culture";
  if (/(\bai\b|openai|chatgpt|claude|gpt-|gemini|grok|llm|anthropic)/.test(q)) return "AI";
  if (/(weather|hurricane|temperature|warming|climate|wildfire|earthquake|tornado)/.test(q)) return "Climate";
  return "Markets";
}
