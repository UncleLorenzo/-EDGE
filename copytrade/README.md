# $EDGE Copy-Trading Suite — Build Plan

> The execution layer on top of the wallet-intelligence stack. We already know
> **who** is sharp and **when** they bet. This turns that signal into money:
> trade Polymarket from EDGE, one-click copy a sharp, auto-mirror a wallet, and
> do all of it from a Telegram bot — with a fee on every trade that buys + burns
> $EDGE.

**Status:** building. Phase 0 backend scaffold is live in [`../backend/`](../backend/).

**Two decisions now locked (June 2026):**
1. **Token-decoupled launch.** The product ships and is traded in **pure USDC with no
   token involved**; the $EDGE flywheel is designed-in but switched off behind one flag
   (`TOKENOMICS_ENABLED=false`) and turned on later ("drop the hammer"). See
   [04 §Sequencing](04-FEES-AND-TOKEN.md).
2. **Fee model: 80 bps via Polymarket Builder Codes.** The fee-capture rail exists
   natively — **no custody, no router contract, works with connect-wallet.** See
   [06-FEE-MODEL-DECISION.md](06-FEE-MODEL-DECISION.md).

The remaining gates before real money flows are the **custody + regulatory + geo**
decisions in [05-INFRA-SECURITY-ROADMAP.md](05-INFRA-SECURITY-ROADMAP.md#decisions) — note that
builder-code fee capture means custody is now only needed for the one-tap Telegram/auto-copy
*UX*, not for monetization.

---

## The package (what we're building)

| # | Product | One-liner |
|---|---------|-----------|
| 1 | **Execution Engine** | Place real Polymarket CLOB orders from EDGE infrastructure. The core every other product calls. |
| 2 | **One-Click Trade** | A "Trade" ticket on any market — buy/sell without leaving EDGE. |
| 3 | **One-Click Copy** | "Mirror this bet" pre-filled from a detected sharp trade. The data→execution bridge. |
| 4 | **Auto-Copy** | Follow a wallet; every trade it makes is mirrored for you automatically, within your risk caps. The flagship. |
| 5 | **Telegram Bot** | The whole thing from Telegram: managed wallet, live sharp alerts with inline **[Copy]** buttons, `/follow`, positions, PnL. |
| 6 | **Fee + Token Layer** | bps fee per trade → buy + burn $EDGE; hold $EDGE → lower fees / higher caps / more auto-copy slots. |
| 7 | **Own Venue (stretch)** | Long-term: EDGE-native markets + liquidity so we own the orderbook, not just route to it. |

---

## Why this is uniquely ours

Anyone can build a Polymarket trade button. **Almost nobody can build a good copy-
trading product, because the hard part is the *signal* — and we already built it:**

- `lib/whales/*` + `api/whales/smart-money` → who is profitable, ranked, live.
- `lib/whales/sharp.js` (KV `sharp:feed`) → every sharp trade, timestamped.
- `lib/onchain/eagle.js` → what those wallets do off-Polymarket (risk + lineage).
- The persistent KV roster (Hall of Fame, 138+ wallets) → a curated universe to copy.

Copy-trading is **"detect a sharp's trade → size it → execute it for the follower"**.
We've built detect. This plan is **size + execute + monetize**, plus the surfaces
(web tickets, Telegram) to deliver it.

---

## System architecture at a glance

```
            ┌──────────────────────── EDGE backend service (NEW, always-on) ─────────────────────────┐
            │                                                                                          │
 sharps ──► │  SIGNAL          ┌── copy keeper ──┐      EXECUTION ENGINE         CUSTODY               │
 trade on   │  (existing data  │  match signal   │      build → sign → submit    MPC / embedded        │
 Polymarket │   layer + a      │  to follow-rules│ ───► Polymarket CLOB  ◄──────  wallets (per user)   │
            │   low-latency    │  size + risk    │      (@polymarket/clob-client) policy engine        │
            │   watcher)       └─────────────────┘            │                                        │
            │       │                  ▲                       ▼                                        │
            │       │            rules │              fee router → buy+burn $EDGE                       │
            │       ▼                  │                       │                                        │
            │   Postgres (users, wallets, follows, positions, trades, fee ledger)                      │
            └───────┬───────────────────────────────────────────┬──────────────────────────────────────┘
                    │                                            │
              WEB APP (existing)                          TELEGRAM BOT
          one-click trade / copy / auto-copy UI       alerts + inline copy + /follow
```

Key shift: **this needs an always-on backend service + a real database.** The
current static-Vercel + KV model hosts the *intelligence* product but cannot host
long-running watchers, a signing keeper, or a Telegram bot. See
[05-INFRA-SECURITY-ROADMAP.md](05-INFRA-SECURITY-ROADMAP.md).

---

## The documents

| Doc | Covers |
|-----|--------|
| [01-EXECUTION-ENGINE.md](01-EXECUTION-ENGINE.md) | Polymarket CLOB integration, order lifecycle, the 3 wallet/custody models, approvals, settlement |
| [02-COPY-ENGINE.md](02-COPY-ENGINE.md) | Signal → rules engine → keeper; one-click copy + auto-copy; sizing, slippage, risk caps |
| [03-TELEGRAM-BOT.md](03-TELEGRAM-BOT.md) | Bot UX, commands, managed wallets, inline copy buttons, auto-copy from chat |
| [04-FEES-AND-TOKEN.md](04-FEES-AND-TOKEN.md) | Fee models, the $EDGE buy+burn flywheel, tier ladder, revenue math |
| [05-INFRA-SECURITY-ROADMAP.md](05-INFRA-SECURITY-ROADMAP.md) | Backend service, DB, key custody, security, phased roadmap, effort, risks, **the decisions** |
| [06-FEE-MODEL-DECISION.md](06-FEE-MODEL-DECISION.md) | **Locked fee model** (80 bps via builder codes, token-decoupled) + the competitive fee audit behind it |
| [07-VENUE-AND-COMPLIANCE.md](07-VENUE-AND-COMPLIANCE.md) | **Venue decision** — segment US (Polymarket US, light/referral) vs non-US (International, managed copy bot); builder codes are International-only; the FCM/IB counsel landmine |
| [`../backend/`](../backend/) | **Phase 0 scaffold** — the always-on service: exec engine, custody abstraction, copy keeper, Telegram bot, token-agnostic fee ledger |

---

## Phase map (detail in doc 05)

```
Phase 0  Foundations      backend service + DB + custody choice + CLOB read-only spike
Phase 1  One-click TRADE  place a single real order from EDGE (connect-wallet, web)
Phase 2  One-click COPY   pre-filled from a sharp's trade  ← the bridge
Phase 3  Telegram v1      managed wallets, deposit, manual trade, alerts + inline copy
Phase 4  AUTO-COPY        rules engine + keeper (web + TG)  ← the flagship
Phase 5  Fees + token     bps skim → buy+burn $EDGE, tier ladder
Phase 6  Low-latency      WS/webhook push so copies fill near the sharp's price
Phase 7  Own venue        (stretch) EDGE-native markets + liquidity
```

Recommended public order: ship **2 → 3 → 4** as the headline launch (copy + Telegram
+ auto-copy), with 1 and 5 underneath. The data we already have makes 2–4 the moat;
everything else is plumbing.
