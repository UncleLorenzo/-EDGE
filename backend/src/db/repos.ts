import { query } from './pool.js';
import type { FollowRule, FollowRuleStore } from '../copy/rules.js';

/**
 * Data access for the system of record (db/schema.sql). Thin, typed repositories —
 * the engines depend on these interfaces, not on SQL. The money tables (trades,
 * fee_ledger) are append-mostly and reconciled on-chain.
 */

export type UserRow = {
  id: string;
  telegram_id: string | null;
  tier: string;
  geo_country: string | null;
  kyc_status: string;
};

export const Users = {
  async byId(id: string): Promise<UserRow | null> {
    const rows = await query<UserRow>(
      `SELECT id, telegram_id, tier, geo_country, kyc_status FROM users WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  },

  async byTelegramId(telegramId: number): Promise<UserRow | null> {
    const rows = await query<UserRow>(
      `SELECT id, telegram_id, tier, geo_country, kyc_status FROM users WHERE telegram_id = $1`,
      [telegramId],
    );
    return rows[0] ?? null;
  },

  async createForTelegram(telegramId: number, geoCountry: string | null): Promise<UserRow> {
    const rows = await query<UserRow>(
      `INSERT INTO users (telegram_id, geo_country) VALUES ($1, $2)
       RETURNING id, telegram_id, tier, geo_country, kyc_status`,
      [telegramId, geoCountry],
    );
    return rows[0]!;
  },
};

/** FollowRule store backed by Postgres. jsonb columns round-trip as JS objects. */
export class PgFollowRuleStore implements FollowRuleStore {
  async forTarget(targetWallet: string): Promise<FollowRule[]> {
    const rows = await query<RuleRow>(
      `SELECT id, user_id, target_wallet, enabled, sizing, filters, risk
         FROM follow_rules WHERE target_wallet = $1 AND enabled = true`,
      [targetWallet],
    );
    return rows.map(toRule);
  }

  async upsert(rule: FollowRule): Promise<void> {
    await query(
      `INSERT INTO follow_rules (id, user_id, target_wallet, enabled, sizing, filters, risk, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now())
       ON CONFLICT (id) DO UPDATE SET
         enabled = EXCLUDED.enabled, sizing = EXCLUDED.sizing,
         filters = EXCLUDED.filters, risk = EXCLUDED.risk, updated_at = now()`,
      [rule.id, rule.userId, rule.targetWallet, rule.enabled,
       JSON.stringify(rule.sizing), JSON.stringify(rule.filters), JSON.stringify(rule.risk)],
    );
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    await query(`UPDATE follow_rules SET enabled = $2, updated_at = now() WHERE id = $1`, [id, enabled]);
  }
}

type RuleRow = {
  id: string; user_id: string; target_wallet: string; enabled: boolean;
  sizing: FollowRule['sizing']; filters: FollowRule['filters']; risk: FollowRule['risk'];
};
function toRule(r: RuleRow): FollowRule {
  return {
    id: r.id, userId: r.user_id, targetWallet: r.target_wallet, enabled: r.enabled,
    sizing: r.sizing, filters: r.filters, risk: r.risk,
  };
}

export type TradeRecord = {
  userId: string; walletId: string; clientOrderId: string; tokenId: string;
  marketSlug: string | null; side: 'BUY' | 'SELL'; kind: 'manual' | 'autocopy';
  sizeUsd: number; avgPrice?: number; fillStatus: string;
  sourceSignalId?: string; sourceWallet?: string;
};

export const Trades = {
  /** Idempotency: has this (signal, user) already produced a copy? */
  async isDuplicate(sourceSignalId: string, userId: string): Promise<boolean> {
    const rows = await query<{ one: number }>(
      `SELECT 1 AS one FROM trades WHERE source_signal_id = $1 AND user_id = $2 LIMIT 1`,
      [sourceSignalId, userId],
    );
    return rows.length > 0;
  },

  async record(t: TradeRecord): Promise<string> {
    const rows = await query<{ id: string }>(
      `INSERT INTO trades
        (user_id, wallet_id, client_order_id, token_id, market_slug, side, kind,
         size_usd, avg_price, fill_status, source_signal_id, source_wallet)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (user_id, client_order_id) DO UPDATE SET fill_status = EXCLUDED.fill_status
       RETURNING id`,
      [t.userId, t.walletId, t.clientOrderId, t.tokenId, t.marketSlug, t.side, t.kind,
       t.sizeUsd, t.avgPrice ?? null, t.fillStatus, t.sourceSignalId ?? null, t.sourceWallet ?? null],
    );
    return rows[0]!.id;
  },
};
