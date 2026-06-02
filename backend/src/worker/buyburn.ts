import { config } from '../config.js';
import { FeeLedger } from '../fees/ledger.js';

/**
 * Buy-&-burn worker — DORMANT until "drop the hammer" (TOKENOMICS_ENABLED=true).
 * When armed, it periodically takes the accumulated burn_usd from the fee ledger,
 * market-buys $EDGE with that USDC, sends it to the burn address, and records the tx
 * hash for the public burns tracker. Until then it does nothing — the seam exists so
 * turning the token on is a config flip, not a new build.
 */
export async function runBuyBurnOnce(
  buyAndBurn: (usd: number) => Promise<string>, // returns burn tx hash
): Promise<{ burned: number; txs: number }> {
  if (!config.tokenomics.enabled) return { burned: 0, txs: 0 };

  const pending = await FeeLedger.pendingBurns();
  if (pending.length === 0) return { burned: 0, txs: 0 };

  const totalUsd = pending.reduce((s, r) => s + Number(r.burn_usd), 0);
  const txHash = await buyAndBurn(totalUsd); // SPIKE (token era): DEX-buy $EDGE → burn addr
  await Promise.all(pending.map((r) => FeeLedger.markBurned(r.id, txHash)));
  return { burned: totalUsd, txs: 1 };
}
