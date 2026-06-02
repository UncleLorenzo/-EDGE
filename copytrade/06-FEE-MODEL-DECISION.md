# 06 — Fee Model Decision (token-less launch)

**Date:** June 2026 · **Owner:** Rob · **Basis:** competitive fee audit (deep research,
24/25 claims adversarially verified, 3-0 votes on all load-bearing findings).

This locks the **Phase A (token OFF)** fee model. It supersedes the illustrative
numbers in [`04-FEES-AND-TOKEN.md`](04-FEES-AND-TOKEN.md), which describes the full
Phase-B (token ON) flywheel we switch on later.

> ⚠️ **VENUE CAVEAT (added June 2026 — see [`07-VENUE-AND-COMPLIANCE.md`](07-VENUE-AND-COMPLIANCE.md)):**
> The 80 bps builder-code mechanism below applies to **Polymarket International only**
> (non-US users). **Polymarket US has NO builder program** — US monetization is a
> **Referral / Introducing-Broker revenue-share**, and US users trade in their own
> KYC'd accounts (EDGE never custodies or signs). Read this doc as "the fee model for
> the International managed product." The US path's economics are TBD via IB partnership.

---

## TL;DR decision

> **Charge from day one: 80 bps (0.80%) per trade, in USDC, captured natively via
> Polymarket Builder Codes. 30% referral share. Free to start; auto-copy is the
> premium wedge. No token required, and no custodial skim or router contract needed
> to collect the fee.**

| Lever | Decision | Why |
|-------|----------|-----|
| **Mechanism** | Per-trade % (bps), **not** subscription or performance fee | The entire Telegram-bot genre — the true comp — uses per-trade %. Users tolerate it as standard. |
| **Rate** | **80 bps (0.80%)** | Undercuts the ~1% norm (Banana Gun/Maestro/BONKbot/Trojan) and the direct competitor **PolyGun (1%)**, while staying within the **100 bps builder-fee cap**. |
| **Capture** | **Polymarket Builder Codes** (Unverified tier, no approval) | `builder_fee = notional × bps / 10000`, settled by Polymarket on top of their own fees. **No token, no partner deal, no router contract, works with non-custodial connect-wallet.** |
| **Referral** | **30%** lifetime to referrer | Matches Trojan/Maestro (25–35%); drives the viral loop that built the genre. |
| **When** | **Day one.** Not free-first. | Every closest comp charges from launch; bots don't run free. Free-*to-start* (no fee to sign up) ≠ free trading. |
| **Premium** | Later: paid tier for auto-copy / faster execution / analytics | Maestro $200/mo fee-waiver; Polywhaler $9–$99/mo analytics. Upsell, not the base. |
| **Token** | **Off at launch.** Switches the fee *split* (buy-&-burn) + tiers on later. | See `04` sequencing. The 80 bps doesn't change; later a % of it buys & burns $EDGE. |

---

## The evidence (what the best platforms actually charge)

### Telegram trading bots — the closest genre (per-trade %, charged from day one)
| Bot | Per-trade fee | Referral | Note |
|-----|---------------|----------|------|
| **BONKbot** | **1%** every swap | 30 / 20 / 10% taper | |
| **Trojan** | **1%** (0.9% w/ referral) | up to 35% | |
| **Maestro** | **1%** buy & sell | 25% lifetime | $200/mo premium *waives* fees |
| **Banana Gun** | **1%** snipe / 0.5% manual | 10% | **$87M+ all-time fees** (DefiLlama) |

Subscriptions appear only as premium fee-*waivers* or analytics add-ons — **never the
primary mechanism.** The genre is per-trade %, full stop.

### The direct Polymarket competitor
- **PolyGun** (execution bot behind the **Polywhaler** tracker): **1% per buy/sell**,
  gas sponsored, **no subscription.** ← our head-to-head benchmark; we launch under it at 80 bps.
- **Polywhaler** (the tracker itself): doesn't execute; monetizes via analytics subs
  (Free / **$9** Pro / **$99** Quant). Confirms the split: **analytics = subscription,
  execution/copy = ~1% per-trade.**

### Polymarket Builder Fees — the capture rail (the unlock)
- Self-serve program; **enabled at the no-approval "Unverified" tier** with gasless
  trading + order attribution. V2 SDK handles builder codes natively.
- `builder_fee = notional × builder_fee_rate_bps / 10000`. **Caps: 100 bps taker,
  50 bps maker**, 1 bp granularity, configurable per builder.
- Additive on top of Polymarket's own (taker-only) platform fees. **This is why we
  need no custodial skim and no router contract to collect — the protocol does it.**

### Reference points
- **DEX frontends:** integrator-takes-X-bps is standard — Jupiter `platformFeeBps`
  (~20 bps), Uniswap Labs' interface fee 0.25% earned **$50M+** (since removed). Pure
  *routing* tolerates ~15–25 bps; copy-trading commands ~1% because it sells *signal +
  automation*, not just routing.
- **Polymarket base fees (2026):** now taker-only, category-based (effective peak
  ~0.75% Sports, up to ~1.8% Crypto at 50/50). Our 80 bps stacks on top of this — show
  the all-in cost inline before confirm.

---

## How 80 bps maps onto our architecture

- **Web one-click (Model A, connect-wallet):** attach our builder code to the order.
  Fee captured natively. **No custody needed to monetize.** ← collapses the old
  "can't skim a connect-wallet trade" problem in `01`/`04`.
- **Telegram + auto-copy (Model B/C, managed wallet):** same builder code; the bot
  also controls the wallet, so the fee is doubly assured. Custody here is for the
  one-tap *UX*, not for fee capture.
- **Ledger:** `fee_ledger` records `fee_usd` + `treasury_usd`; `burn_usd = 0` until
  the token switches on. Reconcile against Polymarket builder-fee payouts.
- **Config:** `FEE_BPS=80`, `BUILDER_CODE=<ours>`, `REFERRAL_SHARE_PCT=30`. One knob each.

## Revenue at 80 bps (illustrative)
```
copied+traded volume/day     fee 0.80%      monthly fee
   $250k                       $2,000         ~$60k
   $1M                         $8,000         ~$240k
   $5M                         $40,000        ~$1.2M
```
(When the token switches on, ~50% of this becomes $EDGE buy-&-burn — see `04`.)

## Open items (from the audit, route to owners)
- **Confirm builder-fee terms at scale** — volume thresholds, KYC, revocation, and the
  100-tx/day Unverified relayer limit (do we need a higher builder tier?). → Tech Lead.
- **PolyGun's referral structure + volume** — the one direct competitor; only its 1%
  fee is confirmed. → Rob.
- **CeFi copy-trading economics (eToro/Bybit/Bitget)** — profit-share % unconfirmed in
  this pass; a gap, not a finding. Only matters if we add lead-trader payouts. → later.
- **Kalshi fee schedule** — not captured this pass; needed if we extend copy to Kalshi. → later.

## Sources
Polymarket Builder Fees & tiers (`docs.polymarket.com/builders/fees`,
`/developers/builders/builder-tiers`), Polymarket trading fees
(`docs.polymarket.com/trading/fees`, `docs.polymarket.us/fees`), BONKbot/Maestro/
Banana Gun docs, DefiLlama (`/protocol/banana-gun`), Polywhaler (`polywhaler.com`),
Jupiter (`dev.jup.ag/docs/swap-api/add-fees-to-swap`), Uniswap Labs fee docs,
CoinGecko Telegram-bot survey. Full citations in the research run.
