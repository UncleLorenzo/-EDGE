import { fetchTrades, tradeUsd } from "../../lib/whales/polymarket-data.js";
import { persistSharp } from "../../lib/whales/sharp.js";

// SMART MONEY — the most profitable wallets on Polymarket, and their trades in
// real time. Two data layers, one request:
//
//   1. LEADERBOARDS — Polymarket's own realized-PnL ranking (lb-api /profit),
//      pulled for 4 windows (24h / 7d / 30d / all-time) so the client can
//      toggle instantly without refetching. This is the "most profitable
//      traders of all time" list, by actual settled profit in USD.
//
//   2. LIVE TAPE — we union the four leaderboards into a set of proven-profitable
//      wallets (~130), then cross-reference the global trade firehose against it.
//      Every trade placed by a tracked sharp surfaces here, annotated with their
//      standing ("#4 all-time, +$9.2M"). Polymarket clears ~500 trades every ~20s,
//      so this tape moves by the second.
//
// Polymarket-only by necessity: it's on-chain, so wallets + PnL are public.
// Kalshi exposes no per-trader/PnL data, so it cannot be mirrored here.
const LB = "https://lb-api.polymarket.com";
const H = { headers: { "User-Agent": "edge-aggregator/1.0", Accept: "application/json" } };
const WINDOWS = ["1d", "7d", "30d", "all"];

async function profit(window, limit = 50) {
  try {
    const r = await fetch(`${LB}/profit?window=${window}&limit=${limit}`, H);
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

const lc = (s) => (s || "").toLowerCase();
const nameOf = (x) => x.name || x.pseudonym || null;
const imgOf = (x) => x.profileImageOptimized || x.profileImage || null;

function mapWindow(arr) {
  return arr.map((x, i) => ({
    rank: i + 1,
    wallet: lc(x.proxyWallet),
    name: nameOf(x),
    pseudonym: x.pseudonym || null,
    image: imgOf(x),
    pnl_usd: Number(x.amount) || 0,
  }));
}

export default async function handler(req, res) {
  try {
    const [w1, w7, w30, wall, rawTrades] = await Promise.all([
      profit("1d"),
      profit("7d"),
      profit("30d"),
      profit("all"),
      fetchTrades({ limit: 500 }),
    ]);

    const windows = {
      "1d": mapWindow(w1),
      "7d": mapWindow(w7),
      "30d": mapWindow(w30),
      all: mapWindow(wall),
    };

    // Credential map: the most prestigious standing per wallet (all-time beats
    // 30d beats 7d beats 24h). Used to annotate live-tape rows.
    const cred = new Map();
    for (const win of ["all", "30d", "7d", "1d"]) {
      for (const w of windows[win]) {
        if (w.wallet && !cred.has(w.wallet)) {
          cred.set(w.wallet, { rank: w.rank, pnl: w.pnl_usd, window: win, name: w.name, image: w.image });
        }
      }
    }

    // Live tape: firehose trades placed by tracked sharps, newest first.
    const trades = Array.isArray(rawTrades) ? rawTrades : [];
    const tape = [];
    for (const t of trades) {
      const w = lc(t.proxyWallet);
      const c = cred.get(w);
      if (!c) continue;
      tape.push({
        wallet: w,
        name: t.name || c.name || null,
        pseudonym: t.pseudonym || null,
        image: t.profileImageOptimized || t.profileImage || c.image || null,
        side: t.side,
        outcome: t.outcome,
        size: Number(t.size) || 0,
        price: Number(t.price) || 0,
        usd: tradeUsd(t),
        timestamp: t.timestamp,
        market_title: t.title,
        market_slug: t.slug,
        event_slug: t.eventSlug,
        asset: t.asset, // clobTokenId of the traded outcome → live price-action sparkline
        icon: t.icon,
        tx_hash: t.transactionHash,
        cred_rank: c.rank,
        cred_pnl: c.pnl,
        cred_window: c.window,
      });
    }
    tape.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    // Log these sharp trades to the persistent feed so the Sharp Alerts panel
    // can replay arbitrary time windows (6h…60d). Best-effort, no-op without KV.
    await persistSharp(tape);

    // Headline stats off the all-time board.
    const allTime = windows.all;
    const stats = {
      top_name: allTime[0]?.name || null,
      top_pnl: allTime[0]?.pnl_usd || 0,
      top50_combined_pnl: allTime.reduce((s, w) => s + w.pnl_usd, 0),
      tracked_wallets: cred.size,
      tape_matches: tape.length,
    };

    res.setHeader("Cache-Control", "public, s-maxage=8, stale-while-revalidate=40");
    res.status(200).json({
      windows,
      tape: tape.slice(0, 80),
      stats,
      firehose_window: trades.length,
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    res.status(502).json({ error: "smart_money_failed", detail: String(err?.message || err) });
  }
}
