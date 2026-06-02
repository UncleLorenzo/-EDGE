# GO-LIVE Checklist — $EDGE backend

Everything is **built and wired**. Going live = provisioning a few external accounts,
pasting their credentials, and flipping switches. This doc is what to walk through with
the international partner + counsel. Nothing here is a code change.

> Two independent tracks. The **US light path** can ship on its own (no custody, no
> partner). The **Non-US managed bot** is partner-hosted. See
> [`../copytrade/07-VENUE-AND-COMPLIANCE.md`](../copytrade/07-VENUE-AND-COMPLIANCE.md).

---

## What's already done (no action needed)

- ✅ Venue router + **hard compliance guard** (US can never custody/sign — enforced in code)
- ✅ Execution engine, copy engine (sizing/risk/keeper), exit-mirroring, idempotency
- ✅ Fee engine + ledger (80 bps, token-agnostic; buy-burn seam dormant)
- ✅ Telegram bot skeleton (commands + inline copy), API (US referral router LIVE), Postgres schema
- ✅ Signal source wired to EDGE's existing sharp feed
- ✅ Dockerfile + Render blueprint; typecheck clean

---

## Track A — US light path (EDGE-hosted, ship anytime)

The clean, no-custody path for your US audience. EDGE = signal + referral deep-link into
the user's own Polymarket US account.

| # | Step | Owner |
|---|------|-------|
| A1 | Get EDGE's **Polymarket US Referral / Introducing-Broker code** | Rob |
| A2 | Set `US_REFERRAL_CODE`, `VENUE_US_ENABLED=true` | Rob |
| A3 | Provision Postgres → set `DATABASE_URL` → `npm run db:init` | DevOps |
| A4 | Deploy (Render blueprint) | DevOps |
| A5 | Counsel: confirm referral/IB partnership terms (no registration needed for pure referral) | Counsel |

**Result:** US users get one-click *routing* + the sharp signal; EDGE earns referral share. Live.

---

## Track B — Non-US managed bot (partner-hosted, the lucrative core)

The full one-tap + auto-copy + Telegram product on Polymarket International. Hosted by the
non-US partner entity, serving **non-US users only**.

| # | Step | Owner | Unblocks |
|---|------|-------|----------|
| B1 | **Custody vendor** — open Turnkey/Privy; set `MPC_PROVIDER/_API_KEY/_API_SECRET`; implement the two TODOs in `src/custody/provider-mpc.ts` | Partner + Tech Lead | managed wallets, one-tap signing |
| B2 | Implement the live CLOB submit — the one SPIKE in `src/exec/clob.ts` (`buildSignSubmit`) using `@polymarket/clob-client` + the builder code | Tech Lead | real order fills + fee capture |
| B3 | Implement `BookSource.getBook` (CLOB `/book`) + inject `IntlVenue` in `index.ts` | Tech Lead | slippage-gated routing |
| B4 | Provision Postgres + Redis; `DATABASE_URL`, `REDIS_URL`; `npm run db:init` | Partner DevOps | persistence + durable keeper |
| B5 | Telegram: create bot via @BotFather → `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_URL` | Partner | the bot |
| B6 | **June 9:** set Polymarket builder Taker `0.80` / Maker `0.50` (cooldown) | Rob | non-zero fee capture |
| B7 | Geo-fencing: confirm CDN geo header (`x-vercel-ip-country`) attests country to `/v1/route`; verify US/blocked are refused | Partner DevOps | the compliance guard works end-to-end |
| B8 | Run the funded **$1 spike** from partner infra (non-US) → confirm fill + builder fee lands | Tech Lead | proof |
| B9 | Counsel (BOTH sides): entity structure, the FCM/IB/CTA question, ToS/geo | Counsel | legal clearance |

### The flip-on switches (after B1–B9)
```bash
VENUE_INTL_ENABLED=true     # turn the managed venue on
KEEPER_DRY_RUN=false        # arm the auto-copy keeper (was logging only)
# KILL_SWITCH stays false; flip to true to instantly halt all new orders.
```

---

## Later — the tokenomics drop ("drop the hammer", P7)

One flip, no refactor (seam already built):
```bash
TOKENOMICS_ENABLED=true
BURN_SPLIT_PCT=50
EDGE_TOKEN_ADDRESS=0x...     # once the token exists
```
Then run the buy-burn worker (`src/worker/buyburn.ts`) with a DEX-buy implementation.
Fees start splitting to buy-&-burn $EDGE; the `$EDGE` tier ladder activates.

---

## The 4 things only an external party can provide (the whole gating list)
1. **Custody vendor account** (Turnkey/Privy) — managed wallets
2. **Production Postgres (+ Redis)** — persistence
3. **Telegram bot token** — the bot
4. **Non-US hosting to run the live order submit** — the partner

Everything else is built. Flip the switches and go.
