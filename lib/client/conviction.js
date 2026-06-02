// Shared Conviction scorer — smart money × momentum. Used by the Conviction
// terminal (conviction.js) AND the dashboard strip (dashboard.js), so the score
// means exactly the same thing everywhere. Pure: pass a sharp trade + the
// market's price series, get a 0–100 conviction read (or null if no signal).
import { analyzeMomentum } from "/lib/client/momentum.js";

// t: a sharp-tape trade { side, cred_rank, usd, timestamp, ... }
// series: the traded outcome's probability series (0..1)
export function convictionScore(t, series) {
  if (!series || series.length < 2) return null;
  const m = analyzeMomentum(series);
  const buy = t.side === "BUY";
  const aligned = (buy && m.dir > 0) || (!buy && m.dir < 0); // market moving the way they bet
  if (!aligned) return null;
  if (m.state === "quiet" || m.state === "steady") return null; // needs real momentum
  const ageMin = (Date.now() / 1000 - (t.timestamp || 0)) / 60;
  if (ageMin > 120) return null;
  const rankF = t.cred_rank ? ((51 - Math.min(50, t.cred_rank)) / 50) * 35 : 12;
  const sizeF = Math.min(25, Math.log10((t.usd || 0) + 10) * 6);
  const momF = Math.min(36, m.score * 1.4 + (m.state === "breakout" ? 8 : m.state === "reversal" ? 5 : 0));
  const freshF = Math.max(0, 10 * (1 - ageMin / 120));
  const score = Math.round(Math.min(100, rankF + sizeF + momF + freshF));
  const tier = score >= 80 ? "elite" : score >= 60 ? "strong" : "live";
  return { m, score, tier, ageMin };
}
