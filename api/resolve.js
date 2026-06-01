// Resolve YUP! slip picks → did they win? Kalshi posts a `result` ("yes"/"no")
// once a market settles, so we batch-fetch the user's pending picks and report
// each one's outcome. Powers the win/loss streak game.
const KBASE = "https://api.elections.kalshi.com/trade-api/v2";
const KH = { "User-Agent": "Mozilla/5.0 (edge-yup)", Accept: "application/json" };

export default async function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  const ids = (url.searchParams.get("ids") || "")
    .split(",").map((s) => s.trim()).filter(Boolean).slice(0, 120);
  const tickers = ids.filter((id) => id.startsWith("k_")).map((id) => id.slice(2));

  const results = {};
  try {
    if (tickers.length) {
      const chunks = [];
      for (let i = 0; i < tickers.length; i += 40) chunks.push(tickers.slice(i, i + 40));
      const markets = [];
      await Promise.all(
        chunks.map(async (ch) => {
          try {
            const r = await fetch(`${KBASE}/markets?tickers=${ch.join(",")}&limit=200`, { headers: KH });
            if (r.ok) { const d = await r.json(); markets.push(...(d.markets || [])); }
          } catch {}
        })
      );
      for (const m of markets) {
        const result = m.result === "yes" || m.result === "no" ? m.result : null;
        const settled = (m.status === "settled" || m.status === "finalized") && !!result;
        results[`k_${m.ticker}`] = { settled, result };
      }
    }
    res.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=60");
    res.status(200).json({ results, fetched_at: new Date().toISOString() });
  } catch (err) {
    res.status(502).json({ error: "resolve_failed", detail: String(err?.message || err) });
  }
}
