// The X agent's brain. With ANTHROPIC_API_KEY set, it writes a fresh, on-brand
// tweet from the live event — varied + natural, never the same template twice.
// Without the key (or on any failure) it returns null and the cron falls back to
// the hand-written template, so this is a pure, risk-free upgrade.
const MODEL = process.env.X_AGENT_MODEL || "claude-3-5-haiku-latest";

export function aiEnabled() { return !!process.env.ANTHROPIC_API_KEY; }

const SYSTEM = `You are the X/Twitter voice of $EDGE (@gopolyedge) — a real-time prediction-market intelligence terminal for Polymarket + Kalshi traders. Write ONE tweet about the event below.
Rules:
- Under 270 characters total.
- Sharp, confident, degen-savvy. No corporate hype, no "excited to announce", no emoji spam, 0–1 hashtag.
- Lead with one relevant emoji.
- Make a trader want to click.
- ALWAYS end with the provided link on its own final line, exactly as given.
- Output ONLY the tweet text — no surrounding quotes, no preamble, no explanation.`;

export async function composeWithAI(candidate) {
  if (!aiEnabled()) return null;
  const user = `Type: ${candidate.type}\nData: ${JSON.stringify(candidate.data).slice(0, 800)}\nLink (must be the final line, verbatim): ${candidate.link}`;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 220, system: SYSTEM, messages: [{ role: "user", content: user }] }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    let text = (d?.content?.[0]?.text || "").trim().replace(/^["']+|["']+$/g, "").trim();
    if (!text) return null;
    if (candidate.link && !text.includes(candidate.link)) text += `\n${candidate.link}`;
    return text.length <= 280 ? text : text.slice(0, 279);
  } catch {
    return null;
  }
}
