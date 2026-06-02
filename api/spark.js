// YUP! Live Pulse — real price trajectories + odds movement for closing-soon cards.
// For each card we pull Kalshi 1-minute candlesticks and fold them into a clean
// implied-YES series, so every card can render where the odds have actually been
// heading (sparkline) and how far they've moved (▲▼ ¢). Batched, capped, short
// timeouts, fully graceful — a card with no history just renders no sparkline.
//
// GET /api/spark?ids=k_TICKER1,k_TICKER2,...   (caps at 16 ids)

const KBASE = "https://api.elections.kalshi.com/trade-api/v2";
const KH = { "User-Agent": "Mozilla/5.0 (edge-yup)", Accept: "application/json" };
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

async function fetchT(url, ms = 5000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { headers: KH, signal: ac.signal }); }
  catch { return null; }
  finally { clearTimeout(t); }
}

// One Kalshi market → cleaned implied-YES price series over the last ~30 min.
async function kalshiSpark(ticker, now) {
  const series = ticker.split("-")[0];
  if (!series) return null;
  const start = now - 1800; // last 30 minutes of 1-minute candles
  const url = `${KBASE}/series/${encodeURIComponent(series)}/markets/${encodeURIComponent(ticker)}/candlesticks?start_ts=${start}&end_ts=${now}&period_interval=1`;
  const r = await fetchT(url);
  if (!r || !r.ok) return null;
  let d; try { d = await r.json(); } catch { return null; }
  const cs = d.candlesticks || [];
  const pts = [];
  for (const c of cs) {
    const p = c.price || {};
    const bid = num(c.yes_bid?.close_dollars), ask = num(c.yes_ask?.close_dollars);
    // mid-market when we have a two-sided quote (smoothest read of "the odds"),
    // else the ask (what the card shows), else the last traded / mean price.
    let v = (bid > 0 && ask > 0) ? (bid + ask) / 2
      : (ask || num(p.close_dollars) || num(p.mean_dollars) || num(p.previous_dollars));
    if (v > 0 && v < 1) pts.push(Math.round(v * 1000) / 1000);
  }
  if (pts.length < 2) return null;
  const trimmed = pts.slice(-30);
  const last = trimmed[trimmed.length - 1], first = trimmed[0];
  return {
    series: trimmed,
    last,
    first,
    delta: Math.round((last - first) * 100),       // movement over the window, in ¢
    hi: Math.max(...trimmed),
    lo: Math.min(...trimmed),
    n: trimmed.length,
  };
}

// One Polymarket outcome token → its implied-probability series over ~24h.
// Used for the Smart Money sharp tape (price action next to the wallet).
async function polySpark(asset) {
  const url = `https://clob.polymarket.com/prices-history?market=${encodeURIComponent(asset)}&interval=1d&fidelity=30`;
  const r = await fetchT(url);
  if (!r || !r.ok) return null;
  let d; try { d = await r.json(); } catch { return null; }
  const pts = (d.history || []).map((x) => num(x.p)).filter((v) => v > 0 && v < 1);
  if (pts.length < 2) return null;
  const trimmed = pts.slice(-40);
  const last = trimmed[trimmed.length - 1], first = trimmed[0];
  return { series: trimmed, last, first, delta: Math.round((last - first) * 100), n: trimmed.length };
}

export default async function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  const ids = (url.searchParams.get("ids") || "")
    .split(",").map((s) => s.trim()).filter(Boolean).slice(0, 16);
  const pmIds = (url.searchParams.get("pm") || "")
    .split(",").map((s) => s.trim()).filter(Boolean).slice(0, 16);
  const now = Math.floor(Date.now() / 1000);
  const spark = {}, pm = {};

  await Promise.all([
    ...ids.filter((id) => id.startsWith("k_")).map(async (id) => {
      try { const s = await kalshiSpark(id.slice(2), now); if (s) spark[id] = s; } catch {}
    }),
    ...pmIds.map(async (a) => {
      try { const s = await polySpark(a); if (s) pm[a] = s; } catch {}
    }),
  ]);

  res.setHeader("Cache-Control", "public, s-maxage=6, stale-while-revalidate=30");
  res.status(200).json({ spark, pm, server_now: now, count: Object.keys(spark).length + Object.keys(pm).length });
}
