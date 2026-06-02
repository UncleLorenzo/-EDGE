import crypto from "crypto";

// OAuth 1.0a request signing for the X API (user context). X's POST /2/tweets
// needs OAuth 1.0a or OAuth2-user; 1.0a is simplest for a server bot (4 static
// keys, no token refresh). For a JSON body, the body is NOT part of the
// signature base — only the oauth_* params (+ any query params).
function pe(s) {
  return encodeURIComponent(String(s)).replace(/[!*'()]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

export function oauthHeader(method, url, creds) {
  const oauth = {
    oauth_consumer_key: creds.consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.token,
    oauth_version: "1.0",
  };
  const paramStr = Object.keys(oauth).sort().map((k) => pe(k) + "=" + pe(oauth[k])).join("&");
  const base = method.toUpperCase() + "&" + pe(url) + "&" + pe(paramStr);
  const signingKey = pe(creds.consumerSecret) + "&" + pe(creds.tokenSecret);
  oauth.oauth_signature = crypto.createHmac("sha1", signingKey).update(base).digest("base64");
  return "OAuth " + Object.keys(oauth).sort().map((k) => pe(k) + '="' + pe(oauth[k]) + '"').join(", ");
}
