// Canonical Polymarket URL builder for a Gamma `/markets` object.
//
// Polymarket pages are keyed by the EVENT slug, not the market slug. A
// candidate market like "Will Ron DeSantis win the 2028 election?" carries:
//   m.slug           = will-ron-desantis-win-the-2028-us-presidential-election  → 404 as a URL
//   m.events[0].slug = presidential-election-winner-2028                        → the real page
//
// The deep path  event/<event-slug>/<market-slug>  lands the user directly on
// that candidate's leg and is safe for binary events too (they 307-redirect to
// the event root). Using the bare market slug — the old behaviour — 404s on
// every multi-outcome market (elections, league winners, nominees …).
export function polyEventUrl(m) {
  if (!m) return null;
  const ev = Array.isArray(m.events) && m.events[0];
  const eventSlug = ev && typeof ev.slug === "string" ? ev.slug : null;
  const marketSlug = typeof m.slug === "string" ? m.slug : null;
  if (eventSlug && marketSlug) return `https://polymarket.com/event/${eventSlug}/${marketSlug}`;
  if (eventSlug) return `https://polymarket.com/event/${eventSlug}`;
  if (marketSlug) return `https://polymarket.com/event/${marketSlug}`;
  return null;
}

// Polymarket US deep-link (Track A — the regulated, US one-click path). Builds the
// market URL from flat event/market slugs (the shape the sharp feed gives us) and
// attaches our Referral / Introducing-Broker code so EDGE earns the revenue-share.
// EDGE never custodies or signs — the user trades in their OWN Polymarket US account.
// NOTE: confirm the exact polymarket.us path scheme at go-live; mirrors .com today.
export function polyUsUrl({ eventSlug, marketSlug } = {}, ref = "") {
  const base = "https://polymarket.us";
  let path = "";
  if (eventSlug && marketSlug) path = `/event/${eventSlug}/${marketSlug}`;
  else if (eventSlug) path = `/event/${eventSlug}`;
  else if (marketSlug) path = `/event/${marketSlug}`;
  if (!path) return base;
  return ref ? `${base}${path}?ref=${encodeURIComponent(ref)}` : `${base}${path}`;
}
