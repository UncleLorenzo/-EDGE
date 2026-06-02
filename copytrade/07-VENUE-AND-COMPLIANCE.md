# 07 — Venue & Compliance Decision (US vs International)

**Date:** June 2026 · **Owner:** Rob + Counsel · **Basis:** deep-research verdict
(24/25 claims adversarially verified, high confidence). Supersedes the implicit
"builder codes work everywhere" assumption in [`06-FEE-MODEL-DECISION.md`](06-FEE-MODEL-DECISION.md).

---

## TL;DR

> **The no-KYC, managed-wallet, one-tap auto-copy product (the "main build") is only
> legally viable on Polymarket INTERNATIONAL, serving NON-US users. On Polymarket US
> (the regulated DCM), EDGE cannot custody keys, cannot sign for users, and there is
> no builder code — the only US path is a Referral / Introducing-Broker partnership.
> The product MUST be segmented by jurisdiction.**

## The two venues are architecturally opposite

| | **Polymarket International** | **Polymarket US** |
|---|---|---|
| Legal structure | Permissionless on-chain protocol (CTF on Polygon) | **CFTC-regulated DCM** — QCX LLC, clearing by QC Clearing LLC (DCO), via the $112M QCEX acquisition |
| Custody | **Self-custodial** — user holds/export keys, signs EIP-712 orders; Polymarket "never takes possession of your USDC" | **Account-based** — funds held via FCMs / Settlement Bank / Clearinghouse; User-ID + password accounts |
| Builder codes / fee capture | ✅ `bytes32` builder code on the signed order; ≤100 bps taker / ≤50 bps maker | ❌ **No builder program.** Docs describe only a **Referral Program** + IB/FCM/ISV partner structure |
| Third-party order flow | ✅ A bot can sign + submit orders on a user's behalf | ❌ Routes through **registered FCM intermediaries**; no non-custodial third-party signing |
| KYC | None | **Mandatory** (identity verification to open/trade) |
| US users | 🚫 Geo-blocked — 1 of 33 fully-restricted countries; **VPNs banned** (ToS §2.1.4) | ✅ Permitted (that's the point) |
| Live precedent | ✅ Managed-wallet **no-KYC copy bots run today** (PolyGun: auto-generates a per-user wallet, mirrors entries/exits, ~1% fee, no KYC) | ❌ No non-custodial copy-bot precedent; sanctioned path is IB/FCM partnership |

The self-custody on International is the *technical precondition* that makes copy-trading
bots possible. Its **absence** on Polymarket US is what blocks the same architecture there.

## The decision: segment by jurisdiction (the only coherent design)

```
                         ┌─────────────── EDGE (signal + routing layer) ───────────────┐
   user hits EDGE  ──►   │  geo-detect  ──►  route to the venue legal for THIS user      │
                         └───────────────┬───────────────────────────┬──────────────────┘
                                         │                           │
                      🇺🇸 US user                          🌍 Non-US user
              ┌───────────────────────────────┐   ┌────────────────────────────────────────┐
              │ LIGHT path · Polymarket US      │   │ FULL path · Polymarket International     │
              │ • EDGE = signal + deep-links    │   │ • managed wallet (Model B/C)            │
              │ • user trades in own KYC'd acct │   │ • one-tap + AUTO-COPY + Telegram bot    │
              │ • monetize: Referral / IB share │   │ • monetize: 80 bps BUILDER CODE         │
              │ • EDGE holds NO funds, signs    │   │ • no KYC by EDGE (venue is permissionless)│
              │   for NO ONE                    │   │ • NON-US ONLY — never serve US here      │
              └───────────────────────────────┘   └────────────────────────────────────────┘
```

- **US (light):** EDGE is a non-custodial *interface + intelligence* layer. It shows the
  sharp signal, one-click *links* into the user's own Polymarket US account, and earns
  through the **Referral Program / Introducing-Broker** revenue-share. No managed wallet,
  no auto-copy by EDGE, no order-signing. KYC is the venue's job.
- **Non-US (full):** the lucrative core — managed wallet, one-tap, auto-copy, Telegram —
  on International CTF, monetized by the **80 bps builder code**. This is exactly the
  PolyGun model, which is live and proven. **Never expose this path to US users.**

## What this changes in the code (small — the abstraction already anticipated it)

- The `Signer` abstraction + `users.geo_country` already exist. Add a **venue router**:
  `resolveVenue(user) -> 'us' | 'intl'` and a `Venue` interface so execution/fees/custody
  pick the right implementation per user.
- `fees/fee.ts` builder-code capture applies to the **intl** venue only. The **us** venue
  fee path is a referral/IB attribution record, not a builder fee. Gate accordingly.
- Auto-copy / managed signing is **disabled** for `venue === 'us'` users at the engine level
  (a hard guard, not just UI), so the regulated path can never accidentally custody/sign.

## The hard line (do not cross)

**EDGE-custodied, no-KYC, auto-trading for US users on either venue is off the table.**
On International that means facilitating geo-block circumvention + unregistered
intermediation; on US it means custody/signing the regulated model forbids. The segmented
design exists precisely so no user is ever asked to evade anything.

## 🚨 Counsel questions (gating — Day-0 #2/#4)

1. **THE landmine:** does routing / auto-trading order flow for **US users** on Polymarket
   US require EDGE to register as an **FCM, Introducing Broker, or CTA**? (Inferred from the
   DCM structure; not stated verbatim in any source. Confirm before any US execution feature.)
2. Does Polymarket US expose **any** programmatic/ISV order-routing surface, or is order
   entry exclusively FCM-mediated?
3. Is there (or will there be) a **US builder/affiliate fee** analog, or is US monetization
   permanently Referral/IB revenue-share?
4. For the **International managed bot**: what entity/structure (offshore?) and geo-fencing
   are required so it serves non-US users only, given the venue's US block + VPN ban?
5. Polymarket US **KYC** tiers/thresholds (confirmed mandatory; specifics unpinned).

## Sources
CFTC Amended Order of Designation + Dec 30 2025 Rulebook; PRNewswire (QCEX $112M
acquisition; intermediated-access approval); docs.polymarket.com/builders/fees +
order-attribution; Polymarket Help Center (geo-restrictions §2.1.4, "is my money safe");
docs.polymarket.us (Referral Program, IB/FCM/ISV partner guides); PolyGun (polygun.xyz)
+ independent reviews. Full citations in the research run.
