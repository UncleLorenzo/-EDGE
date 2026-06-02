-- $EDGE backend — system of record (Postgres). Money lives here; KV stays for feeds.
-- Token-decoupled: nothing in this schema references $EDGE. The fee_ledger records
-- USDC fees and a burn_usd column that is simply 0 until tokenomics are switched on.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id   BIGINT UNIQUE,                 -- nullable: web-only users have none
  web_session   TEXT UNIQUE,                   -- nullable: TG-only users have none
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Tier is flat ('free') while tokenomics are off; becomes $EDGE-derived later.
  tier          TEXT NOT NULL DEFAULT 'free',
  geo_country   TEXT,                           -- for geo-fencing (legal gate)
  kyc_status    TEXT NOT NULL DEFAULT 'none'    -- none|pending|approved|rejected
);

-- ── Wallets (one per user; custody model recorded per wallet) ─────────────────
CREATE TABLE IF NOT EXISTS wallets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address        TEXT NOT NULL,                  -- Polygon address (EOA or smart account)
  custody_model  TEXT NOT NULL,                  -- 'A' connect | 'B' mpc | 'C' session-key
  mpc_wallet_ref TEXT,                           -- provider-side id (Turnkey/Privy), Model B/C
  approvals_set  BOOLEAN NOT NULL DEFAULT false, -- USDC.e + CTF approvals done
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, address)
);

-- ── Follow rules (the auto-copy control surface) ──────────────────────────────
CREATE TABLE IF NOT EXISTS follow_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_wallet   TEXT NOT NULL,                 -- the sharp being copied
  enabled         BOOLEAN NOT NULL DEFAULT true,
  sizing          JSONB NOT NULL,                -- { mode, value }
  filters         JSONB NOT NULL DEFAULT '{}',   -- { markets, minTradeUsd, sides, ... }
  risk            JSONB NOT NULL,                -- { maxPerTradeUsd, maxDailyUsd, ... }
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_follow_rules_target
  ON follow_rules (target_wallet) WHERE enabled;

-- ── Trades (every order we place, manual or copied) ───────────────────────────
CREATE TABLE IF NOT EXISTS trades (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id        UUID NOT NULL REFERENCES wallets(id),
  client_order_id  TEXT NOT NULL,                -- our idempotency key
  token_id         TEXT NOT NULL,                -- Polymarket ERC-1155 outcome token
  market_slug      TEXT,
  side             TEXT NOT NULL,                -- BUY | SELL
  kind             TEXT NOT NULL,                -- manual | autocopy
  size_usd         NUMERIC(18,6) NOT NULL,
  avg_price        NUMERIC(10,6),
  fill_status      TEXT NOT NULL,                -- pending|filled|partial|killed|failed
  source_signal_id UUID,                          -- copy provenance (nullable)
  source_wallet    TEXT,                          -- which sharp this copied (nullable)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_order_id)
);
-- Maps follower positions back to the sharp that originated them, so exit-mirroring
-- can sell the same % when the sharp reduces. (Copy products that skip this lose.)
CREATE INDEX IF NOT EXISTS idx_trades_source ON trades (source_wallet, token_id);

-- ── Positions (current holdings + PnL, reconciled to chain) ───────────────────
CREATE TABLE IF NOT EXISTS positions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id      UUID NOT NULL REFERENCES wallets(id),
  token_id       TEXT NOT NULL,
  market_slug    TEXT,
  size_shares    NUMERIC(24,6) NOT NULL DEFAULT 0,
  avg_cost       NUMERIC(10,6),
  realized_pnl   NUMERIC(18,6) NOT NULL DEFAULT 0,
  origin_wallet  TEXT,                            -- sharp this position was copied from
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (wallet_id, token_id)
);

-- ── Fee ledger (TOKEN-AGNOSTIC) ───────────────────────────────────────────────
-- Records USDC fees per trade. burn_usd is 0 until tokenomics turn on; then the
-- buy-&-burn worker reconciles burn_usd rows to on-chain $EDGE burn txs.
CREATE TABLE IF NOT EXISTS fee_ledger (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id      UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id),
  notional_usd  NUMERIC(18,6) NOT NULL,
  bps           INTEGER NOT NULL,
  fee_usd       NUMERIC(18,6) NOT NULL,
  treasury_usd  NUMERIC(18,6) NOT NULL,
  burn_usd      NUMERIC(18,6) NOT NULL DEFAULT 0,  -- 0 while token OFF
  burn_tx_hash  TEXT,                               -- filled later by buy-burn worker
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Audit log (every sensitive action: orders, withdrawals, kill-switch flips) ─
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES users(id),
  action      TEXT NOT NULL,
  detail      JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
