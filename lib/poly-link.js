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

// Polymarket US one-click deep-link (Track A). Builds the market URL from flat
// event/market slugs (the shape the sharp feed gives us). The user trades in their
// OWN account — EDGE never custodies or signs.
//
// IMPORTANT (verified June 2026): the consumer market pages live on POLYMARKET.COM
// (which geo-routes US users into the regulated US experience). `polymarket.us` is
// only a marketing/sign-up landing page with NO /event/ pages — linking there 404s.
// So we use polymarket.com/event/<event-slug>/<market-slug>, the same proven scheme
// the Whales page and the rest of the site use.
//
// `ref` is appended only when set. The exact Polymarket referral mechanism (URL param
// vs promo code at sign-up) still needs confirming with their referral program before
// we rely on it — until then links are clean + working without attribution.
export function polyUsUrl({ eventSlug, marketSlug } = {}, ref = "") {
  const base = "https://polymarket.com";
  let path = "";
  if (eventSlug && marketSlug) path = `/event/${eventSlug}/${marketSlug}`;
  else if (eventSlug) path = `/event/${eventSlug}`;
  else if (marketSlug) path = `/event/${marketSlug}`;
  if (!path) return base;
  return ref ? `${base}${path}?ref=${encodeURIComponent(ref)}` : `${base}${path}`;
}
