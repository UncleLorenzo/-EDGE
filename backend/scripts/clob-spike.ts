/**
 * PHASE 0 EXIT-GATE SPIKE. Run this to prove the whole program is buildable:
 * place + fill a REAL $1 order on a live Polymarket market from this backend.
 *
 * Checklist (doc 01 §"What Phase 0 must prove"):
 *   1. Place + fill a real $1 order on a live market via @polymarket/clob-client.
 *   2. Confirm the approval set; a fresh EOA can trade after approvals.
 *   3. Stand up ONE managed (MPC) wallet, deposit USDC, place a policy-signed order.
 *   4. Read positions + PnL back. Pin exact contract addresses, fees, min sizes, geo.
 *
 * This file is intentionally a TODO harness — it documents the spike and fails loud
 * until the live wiring + creds + custody vendor are in place. De-risks everything.
 */
import { config } from '../src/config.js';

async function spike() {
  console.log('CLOB spike — target:', config.polygon.clobUrl, 'chain', config.polygon.chainId);
  console.log('Step 1: build + sign + submit a $1 FOK order on a live market…');
  // TODO: const client = new ClobClient(...); const eoa = new ethers.Wallet(PK)
  // TODO: ensureApprovals(eoa); buildOrder; postOrder; poll fill; read position
  throw new Error('SPIKE not wired — add Polygon key + a funded test EOA, then implement.');
}

spike().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
