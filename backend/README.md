# $EDGE Backend Service

The always-on money layer for the $EDGE trading & copy-trading suite. The Vercel
site stays the read/UI front-end; **this service owns execution, custody, the copy
keeper, the Telegram bot, and the fee ledger.**

> **Vercel = read/UI · this service = money.**

## Core principle: token-decoupled (build now, tokenize later)

The product is designed to be **used and traded with zero token involvement.** Fees
are charged and settled in **USDC**. Everything the token will eventually touch —
the buy-and-burn split, the hold-$EDGE tier ladder — is **designed-in but switched
off** behind a single flag (`TOKENOMICS_ENABLED`, default `false`).

When we "drop the hammer" later, turning tokenomics on is a **config change, not a
refactor**:

| Concern | Token OFF (launch) | Token ON (later) |
|---------|--------------------|------------------|
| Fee currency | USDC | USDC (unchanged) |
| Fee destination | 100% → treasury (operations) | split: buy-&-burn $EDGE / treasury |
| Tier ladder | flat, or USDC-priced tiers | hold-$EDGE tiers (lower fees / more follows) |
| Code path | `fees/fee.ts` `splitFee()` returns `{ treasury: 100% }` | same fn returns `{ burn: x%, treasury: y% }` |

The seam lives in [`src/fees/fee.ts`](src/fees/fee.ts) and [`src/config.ts`](src/config.ts). Nothing
else in the codebase knows the token exists.

## What's here (Phase 0 scaffold)

```
src/
  config.ts            env + feature flags (TOKENOMICS_ENABLED, FEE_BPS, kill switch)
  index.ts             service bootstrap — API + bot + keeper
  db/pool.ts           Postgres pool
  exec/                EXECUTION ENGINE — Polymarket CLOB (doc 01)
    clob.ts            thin wrapper over @polymarket/clob-client
    markets.ts         EDGE market → Polymarket tokenId(s) + tick/min-size
    pricing.ts         book → marketable price + slippage check
    approvals.ts       USDC.e + CTF approvals per wallet
    positions.ts       positions + realized/unrealized PnL
    index.ts           public surface: placeOrder/cancelOrder/getPositions/...
  custody/             KEY CUSTODY (doc 01) — the signer abstraction
    signer.ts          Signer interface: A connect-wallet / B MPC / C session key
    provider-connect.ts  Model A (non-custodial, user signs)
    provider-mpc.ts      Model B (Turnkey/Privy managed wallet) — vendor TODO
  copy/                COPY ENGINE (doc 02)
    signal.ts          normalized sharp-trade signal + source adapter
    rules.ts           FollowRule type + store
    sizing.ts          fixed / pctOfSharp / pctOfBankroll
    risk.ts            the risk gate (caps, slippage, circuit breaker)
    keeper.ts          always-on worker: signal → fan-out to followers
  fees/
    fee.ts             TOKEN-AGNOSTIC fee compute + ledger + the tokenomics seam
  bot/
    bot.ts             grammY Telegram bot — commands + inline [Copy] (doc 03)
  api/
    server.ts          HTTP API the web app calls
db/
  schema.sql           Postgres system-of-record DDL
```

## Status & gates

This is the **Phase 0 foundation scaffold**. Before any real money flows, the
Day-0 decisions in [`../copytrade/ACTION-PLAN.md`](../copytrade/ACTION-PLAN.md) §7
must be made — chiefly **custody vendor** and **legal/geo**. Code is built to a
`Signer` abstraction so the custody vendor can be finalized in parallel.

The **CLOB spike** (place + fill a real \$1 order from this service) is the Phase 0
exit gate. Stubs are marked `// SPIKE:` where live mainnet wiring + creds are needed.

## Run (local, once deps + Postgres exist)

```bash
cp .env.example .env      # fill in DATABASE_URL, POLYGON_RPC_URL, etc.
npm install
npm run db:init           # apply db/schema.sql
npm run dev               # boots API + bot + keeper (keeper in dry-run by default)
```
