import { xEnabled, postTweet } from "../../lib/x/client.js";
import { composeWhale, composeMarket, composeBuzz } from "../../lib/x/compose.js";
import { composeWithAI, aiEnabled } from "../../lib/x/agent.js";
import { kvEnabled, kvCmd } from "../../lib/store/kv.js";

// EDGE → X auto-poster. On a cron, it surfaces the single most noteworthy live
// signal (a big whale bet, else a hot market), dedupes it, rate-limits, and
// posts to @gopolyedge. No X keys yet → DRY-RUN: hit ?force=1 to preview the
// exact tweet it would post. Add X_API_KEY/SECRET + X_ACCESS_TOKEN/SECRET to go
// live (free dev app at developer.x.com).
const BASE = process.env.SITE_URL || "https://www.thepolyedge.com";
const MIN_INTERVAL = 18 * 60 * 1000; // ≥18 min between posts — active, not spammy
const WHALE_MIN = 5000;              // only post bets this size or bigger

async function fetchJSON(url, ms = 7000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(url, { signal: ac.signal }); return r.ok ? await r.json() : null; }
  catch { return null; } finally { clearTimeout(t); }
}
async function gather() {
  const cands = [];
  // parallel + timeouts so one slow/flaky source never starves the others
  const [sm, lv, bz] = await Promise.all([
    fetchJSON(`${BASE}/api/whales/smart-money`),
    fetchJSON(`${BASE}/api/live?hours=6`),
    fetchJSON(`${BASE}/api/buzz/markets?limit=8`),
  ]);
  // 🐋 whale bets
  for (const t of (sm?.tape || [])) {
    if ((t.usd || 0) < WHALE_MIN) continue;
    cands.push({
      type: "whale", key: `w:${t.tx_hash || t.wallet + t.timestamp}`, score: t.usd,
      data: { trader: t.name || "a top wallet", rank: t.cred_rank, lifetime_pnl: t.cred_pnl, side: t.side, outcome: t.outcome, usd: t.usd, market: t.market_title },
      link: `${SITE}/whales`, tweet: composeWhale(t),
    });
  }
  // 🗣️ trending / news-driven market
  const bzTop = (bz?.markets || []).filter((m) => (m.heat || 0) > 0).sort((a, b) => (b.heat || 0) - (a.heat || 0))[0];
  if (bzTop) cands.push({
    type: "buzz", key: `b:${(bzTop.market_url || bzTop.title || "").slice(0, 40)}:${Math.floor(Date.now() / 7.2e6)}`, score: Math.min((bzTop.heat || 0) * 90, 3500),
    data: { market: bzTop.title, sources_talking: bzTop.thread_count, heat: bzTop.heat },
    link: `${SITE}/buzz`, tweet: composeBuzz(bzTop),
  });
  // 👀 live market — prefer one with volume, else just the top live card (guaranteed fallback so the agent always has something)
  const cards = lv?.cards || [];
  const mkTop = cards.find((c) => (c.volume_24h || 0) > 0) || cards[0];
  if (mkTop) cands.push({
    type: "market", key: `m:${mkTop.id}:${Math.floor(Date.now() / 3.6e6)}`, score: Math.max(700, Math.min(mkTop.volume_24h || 0, 4000)),
    data: { market: mkTop.title, yes_cents: Math.round((mkTop.yes_price || 0) * 100), no_cents: Math.round((mkTop.no_price || 0) * 100), category: mkTop.category },
    link: `${SITE}/live`, tweet: composeMarket(mkTop),
  });
  return cands.sort((a, b) => b.score - a.score);
}
async function isPosted(key) { if (!kvEnabled) return false; try { return !!(await kvCmd(["GET", `x:p:${key}`])); } catch { return false; } }
async function markPosted(key) { if (!kvEnabled) return; try { await kvCmd(["SET", `x:p:${key}`, "1", "EX", "172800"]); } catch {} }

export default async function handler(req, res) {
  const force = new URL(req.url, "http://localhost").searchParams.get("force") === "1";
  const cands = await gather();
  if (!cands.length) { res.status(200).json({ ok: true, posted: false, reason: "no candidates right now", x_connected: xEnabled() }); return; }

  // rate-limit (skipped when forcing a manual preview)
  let last = 0;
  if (kvEnabled) { try { last = Number(await kvCmd(["GET", "x:last"])) || 0; } catch {} }
  if (!force && last && Date.now() - last < MIN_INTERVAL) {
    res.status(200).json({ ok: true, posted: false, reason: "rate-limited", next_in_min: Math.ceil((MIN_INTERVAL - (Date.now() - last)) / 60000), x_connected: xEnabled(), would_post: cands[0].tweet });
    return;
  }

  // first candidate we haven't already posted
  let picked = null;
  for (const c of cands) { if (!(await isPosted(c.key))) { picked = c; break; } }
  if (!picked) { res.status(200).json({ ok: true, posted: false, reason: "nothing new to post", x_connected: xEnabled() }); return; }

  // AI brain writes it (varied + natural) when ANTHROPIC_API_KEY is set; else template.
  const aiText = await composeWithAI(picked);
  const tweet = aiText || picked.tweet;
  const result = await postTweet(tweet);
  if (result.ok) { await markPosted(picked.key); if (kvEnabled) { try { await kvCmd(["SET", "x:last", String(Date.now())]); } catch {} } }

  res.status(200).json({
    ok: true,
    posted: !!result.ok,
    dry_run: !!result.dryRun,
    x_connected: xEnabled(),
    ai_written: !!aiText,
    ai_enabled: aiEnabled(),
    type: picked.type,
    tweet,
    chars: tweet.length,
    tweet_id: result.id || null,
    error: result.error || null,
  });
}
