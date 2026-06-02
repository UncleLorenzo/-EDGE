import { fetchTrades, tradeUsd } from "../../lib/whales/polymarket-data.js";

// Following feed — merge recent trades across the wallets a user follows, newest
// first. GET /api/whales/feed?users=0x..,0x..  (caps at 20 wallets)
export default async function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  const users = (url.searchParams.get("users") || "")
    .split(",").map((s) => s.trim().toLowerCase())
    .filter((u) => /^0x[a-f0-9]{40}$/.test(u)).slice(0, 20);
  if (!users.length) { res.status(200).json({ trades: [], wallets: 0 }); return; }

  const results = await Promise.allSettled(users.map((u) => fetchTrades({ user: u, limit: 12 })));
  const trades = [];
  results.forEach((r, i) => {
    if (r.status !== "fulfilled" || !Array.isArray(r.value)) return;
    for (const t of r.value) {
      trades.push({
        wallet: users[i],
        name: t.name || null,
        image: t.profileImageOptimized || t.profileImage || null,
        side: t.side,
        outcome: t.outcome,
        size: Number(t.size) || 0,
        price: Number(t.price) || 0,
        usd: tradeUsd(t),
        timestamp: t.timestamp,
        market_title: t.title,
        market_slug: t.slug,
        event_slug: t.eventSlug,
        icon: t.icon,
      });
    }
  });
  trades.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  res.setHeader("Cache-Control", "public, s-maxage=8, stale-while-revalidate=30");
  res.status(200).json({ trades: trades.slice(0, 60), wallets: users.length });
}
