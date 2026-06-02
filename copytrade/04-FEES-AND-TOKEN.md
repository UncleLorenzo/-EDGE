# 04 — Fees & the $EDGE Flywheel

How the suite makes money, and how that money makes $EDGE scarcer. This is where
copy-trading becomes the **demand engine for the token** — far bigger than the
current affiliate model.

## ⚠️ Sequencing: build token-decoupled, tokenize later ("drop the hammer")

**Decision (Rob, June 2026):** we ship the entire product **with no token involved.**
It is used and traded purely in **USDC**. The $EDGE flywheel below is **designed-in
but switched off** until we deliberately turn it on later.

This is a deliberate two-phase play:

| | **Phase A — Token OFF (launch)** | **Phase B — Token ON ("drop the hammer")** |
|---|---|---|
| Fee currency | USDC | USDC (unchanged) |
| Fee destination | 100% → treasury | split: buy-&-burn $EDGE / treasury |
| Tiers | flat (or USDC-priced) | hold-$EDGE tiers: lower fees / more follows / higher caps |
| What changes in code | — | flip `TOKENOMICS_ENABLED=true` + run the buy-burn worker |

**Why decouple:** (1) cleaner regulatory story at launch — a USDC trading tool, not a
token scheme; (2) the token launches *onto proven volume + revenue*, so it's a demand
magnet from day one instead of a launch-day liability; (3) we never block shipping the
product on token/listing/legal timelines.

**The engineering contract:** the seam lives in exactly two files in the backend —
[`src/config.ts`](../backend/src/config.ts) (`TOKENOMICS_ENABLED`, default `false`) and
[`src/fees/fee.ts`](../backend/src/fees/fee.ts) (`splitFee()`). Token off ⇒ `splitFee` returns
`{ treasury: 100% }`; token on ⇒ it returns the burn split. **Nothing else in the codebase
knows the token exists.** The `fee_ledger` table already carries a `burn_usd` column that
stays `0` until the switch flips. Turning tokenomics on is a config change + a buy-burn
worker, **not a refactor.**

Everything below describes the **full** (Phase B) design. Read it as "what we switch on
later," with Phase A = the same minus the burn split and the $EDGE tiers.

## Fee models (use a combo)

| Model | Mechanism | Pros | Cons |
|-------|-----------|------|------|
| **A. Per-trade bps** | Skim e.g. **0.5–1.0%** of each copied/traded notional | Scales with volume; "free to start" | Needs the managed/router flow to capture (doc 01) |
| **B. Subscription / token-gate** | Pay in $EDGE (or fiat) to unlock auto-copy, more follows, higher caps | Recurring; zero contracts; works with non-custodial | Caps upside vs. volume fees |
| **C. Performance fee** | X% of *profits* on auto-copy (high-water mark) | Aligned; lucrative on winners | Custodial/vault; heaviest regulatory |

**Recommended launch:** **A + B.** A small per-trade fee on every execution (the
volume engine) **plus** a token-gated tier ladder (the recurring + token-demand
engine). Add C only if/when a custodial vault product is greenlit.

## How the fee is captured — ✅ SOLVED by Polymarket Builder Codes

> **Update (June 2026 audit):** the capture problem below is **solved natively.**
> Polymarket runs a self-serve **Builder Fees** program: attach our builder code to
> each order and Polymarket settles `builder_fee = notional × bps / 10000` on top of
> their own fees — **up to 100 bps taker / 50 bps maker**, at the no-approval
> "Unverified" tier. **No custodial skim and no router contract required, and it works
> with non-custodial connect-wallet (Model A).** See [`06-FEE-MODEL-DECISION.md`](06-FEE-MODEL-DECISION.md).

- **Web connect-wallet (Model A):** ~~can't skim a CLOB trade directly~~ → **attach the
  builder code; fee captured natively. No router contract, no custody needed to monetize.**
- **Managed / Telegram (Model B/C):** same builder code; the bot also controls the
  wallet, so capture is doubly assured. Custody here is for one-tap UX, not the fee.

*(The legacy options — a $EDGE subscription gate or a thin EDGE router contract — are
no longer needed for capture. Keep the router idea only if we later want to skim a
non-Polymarket venue.)*

## The buy-and-burn loop (ties into the existing deflationary design)

This plugs straight into `reference_edge_deflationary_design` — **50% of affiliate
revenue already buys + burns $EDGE.** Copy-trading fees become a far larger inflow
to the *same* mechanism:

```
copy/trade volume → fee (USDC) → treasury
                                   ├─ 50% market-buy $EDGE → BURN (on-chain, public tracker)
                                   └─ 50% operations
```

Every trade anyone copies makes $EDGE rarer. The more the product is used, the
faster the burn. Publish it on the existing burns tracker (`burns.html`) — the
copy-fee burn becomes the headline number.

## The tier ladder (token utility — reuse the existing tokenomics)

Hold $EDGE → better terms. Maps onto the tier thresholds already in the tokenomics
(`project_edge_marketing_os` / token.html). Illustrative:

| Tier | Hold | Auto-copy slots | Per-trade fee | Caps |
|------|------|-----------------|---------------|------|
| Free | 0 | 0 (manual one-click only) | 1.0% | low daily cap |
| Holder | 100K | 1 follow | 0.6% | medium |
| Analyst | 1M | 5 follows | 0.4% | high |
| Desk | 5M | unlimited follows + priority keeper | 0.2% | custom |

So $EDGE buys **lower fees + more auto-copy + higher caps + priority execution**.
That's hard token utility tied to real revenue — the strongest demand driver the
project has.

## Revenue math (illustrative, to size the prize)

```
copied volume / day      fee 0.7%      monthly fee
   $250k                  $1,750        ~$52k
   $1M                    $7,000        ~$210k
   $5M                    $35,000       ~$1.05M
```
Telegram bots in hot categories routinely clear seven figures/yr in fees on
comparable volume. Half of every dollar burns $EDGE. (Numbers illustrative — model
real assumptions in Phase 0.)

## Notes

- Always show the fee **inline before confirm** ("fee $0.20") — trust > hidden bps.
- Keep a **fee ledger** in Postgres (per trade, per user) reconciled to on-chain
  buy+burn txs for the public tracker.
- Free tier should still feel great (manual one-click copy) so the funnel is wide;
  auto-copy is the paid wedge.
