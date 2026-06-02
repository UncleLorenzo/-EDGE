// Tweet composers — turn a live $EDGE signal into a punchy, on-brand post with
// a link back to the platform. All capped under X's 280-char limit.
const SITE = "https://www.thepolyedge.com";

function usd(n) {
  const a = Math.abs(Number(n) || 0);
  return a >= 1e9 ? `$${(a / 1e9).toFixed(1)}B` : a >= 1e6 ? `$${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `$${(a / 1e3).toFixed(0)}K` : `$${Math.round(a)}`;
}
function cap(s, n = 278) { return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; }
function who(t) { return t.name || (t.wallet ? t.wallet.slice(0, 6) + "…" + t.wallet.slice(-4) : "A whale"); }
function mkt(s, n = 90) { s = (s || "").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; }

// 🐋 A tracked sharp just placed a big bet.
export function composeWhale(t) {
  const cred = t.cred_rank ? ` (#${t.cred_rank} all-time · ${usd(t.cred_pnl)})` : "";
  const verb = t.side === "BUY" ? "bought" : "sold";
  return cap(`🐋 SMART MONEY MOVE\n\n${who(t)}${cred} just ${verb} ${usd(t.usd)} of "${t.outcome || ""}" on:\n${mkt(t.market_title)}\n\nTrack every sharp, live 👇\n${SITE}/whales`);
}

// 🎯 Smart money + momentum agreeing (conviction signal).
export function composeConviction({ t, c }) {
  return cap(`🎯 CONVICTION ${c.score}/100\n\n${who(t)} (#${t.cred_rank}) bought "${t.outcome || ""}" — and it's ${c.m.label.toLowerCase()} (${c.m.delta > 0 ? "+" : ""}${c.m.delta}¢).\n\nSmart money + momentum, agreeing.\n${SITE}/conviction`);
}

// 👀 A live market heating up.
export function composeMarket(card) {
  const yes = Math.round((card.yes_price || 0) * 100), no = Math.round((card.no_price || 0) * 100);
  return cap(`👀 HEATING UP\n\n"${mkt(card.title, 100)}"\nlive now — ${yes}¢ YES / ${no}¢ NO.\n\nEvery live market, ranked by real-time momentum 👇\n${SITE}/live`);
}
