// Social follow graph — v1 is LOCAL-FIRST (localStorage), so anyone can build a
// watchlist + a "Following" feed with zero login. Phase 2 syncs this to an
// account on first login (same shape), so nothing here is throwaway.
const KEY = "edge_following";

function read() { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } }
function write(o) {
  try { localStorage.setItem(KEY, JSON.stringify(o)); } catch {}
  try { window.dispatchEvent(new Event("edge-follow-change")); } catch {}
}

export function followMap() { return read(); }                                  // { wallet: {name,image,ts} }
export function followList() {                                                  // newest first
  return Object.entries(read()).map(([wallet, v]) => ({ wallet, ...(v || {}) })).sort((a, b) => (b.ts || 0) - (a.ts || 0));
}
export function isFollowing(wallet) { return !!read()[(wallet || "").toLowerCase()]; }
export function followCount() { return Object.keys(read()).length; }
export function toggleFollow(wallet, meta = {}) {
  wallet = (wallet || "").toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) return false;
  const o = read();
  if (o[wallet]) { delete o[wallet]; write(o); return false; }
  o[wallet] = { name: meta.name || null, image: meta.image || null, ts: Date.now() };
  write(o);
  return true;
}
