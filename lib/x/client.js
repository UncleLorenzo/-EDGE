import { oauthHeader } from "./oauth.js";

// X poster. Lights up the moment these 4 env vars exist (from a free X dev app
// at developer.x.com): X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET.
// Until then xEnabled() is false and the autopost cron runs in dry-run (preview)
// mode — same "drop in the keys" pattern as the affiliate code.
function creds() {
  return {
    consumerKey: process.env.X_API_KEY || process.env.TWITTER_API_KEY,
    consumerSecret: process.env.X_API_SECRET || process.env.TWITTER_API_SECRET,
    token: process.env.X_ACCESS_TOKEN || process.env.TWITTER_ACCESS_TOKEN,
    tokenSecret: process.env.X_ACCESS_SECRET || process.env.TWITTER_ACCESS_SECRET,
  };
}

export function xEnabled() {
  const c = creds();
  return !!(c.consumerKey && c.consumerSecret && c.token && c.tokenSecret);
}

export async function postTweet(text) {
  if (!xEnabled()) return { ok: false, dryRun: true, text };
  const url = "https://api.twitter.com/2/tweets";
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: oauthHeader("POST", url, creds()), "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, id: d?.data?.id || null, error: r.ok ? null : d, text };
  } catch (e) {
    return { ok: false, error: String(e?.message || e), text };
  }
}
