import { query } from '../db/pool.js';
import type { FeeBreakdown } from './fee.js';

/**
 * Persists every fee to fee_ledger (the token-agnostic money record). burn_usd is 0
 * while tokenomics are off; when the token switches on, the buy-burn worker fills
 * burn_tx_hash by reconciling the burn_usd rows to on-chain $EDGE burns.
 */
export const FeeLedger = {
  async record(tradeId: string, userId: string, fee: FeeBreakdown): Promise<void> {
    await query(
      `INSERT INTO fee_ledger
        (trade_id, user_id, notional_usd, bps, fee_usd, treasury_usd, burn_usd)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [tradeId, userId, fee.notionalUsd, fee.bps, fee.feeUsd, fee.split.treasuryUsd, fee.split.burnUsd],
    );
  },

  /** Token-era: rows with burn_usd > 0 awaiting an on-chain $EDGE buy-&-burn. */
  async pendingBurns(): Promise<{ id: string; burn_usd: number }[]> {
    return query<{ id: string; burn_usd: number }>(
      `SELECT id, burn_usd FROM fee_ledger WHERE burn_usd > 0 AND burn_tx_hash IS NULL`,
    );
  },

  async markBurned(id: string, txHash: string): Promise<void> {
    await query(`UPDATE fee_ledger SET burn_tx_hash = $2 WHERE id = $1`, [id, txHash]);
  },
};
