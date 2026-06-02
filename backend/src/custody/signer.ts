/**
 * The custody abstraction — the #1 fork (doc 01). Everything that needs a signature
 * depends on THIS interface, never on a concrete vendor. That lets engineering build
 * Phases 1–4 while the custody vendor (Day-0 decision) is finalized in parallel.
 *
 *   Model A  connect-wallet   user signs each order (non-custodial). Web one-click.
 *   Model B  managed MPC      EDGE policy-signs (Turnkey/Privy). Telegram + auto-copy.
 *   Model C  AA session key   user keeps custody; EDGE holds a limited session key.
 *
 * Telegram + auto-copy REQUIRE B or C (must be one-tap). Web one-click can use A.
 */

export type CustodyModel = 'A' | 'B' | 'C';

/** An EIP-712 order payload, pre-hashing. Shape mirrors @polymarket/clob-client. */
export type UnsignedOrder = Record<string, unknown>;
export type SignedOrder = UnsignedOrder & { signature: string };

export interface Signer {
  readonly model: CustodyModel;
  /** Polygon address that will own the position. */
  address(userId: string): Promise<string>;
  /** Produce a signed, submittable order. Throws if policy denies (caps/allowlist). */
  signOrder(userId: string, order: UnsignedOrder): Promise<SignedOrder>;
  /** Whether this signer can act WITHOUT a per-action human tap (B/C only). */
  readonly canAutoSign: boolean;
}

/** Policy guardrails enforced for managed/session signers (Model B/C). */
export type SignerPolicy = {
  allowedContracts: string[]; // ONLY Polymarket exchange + USDC.e
  maxPerTxUsd: number;
  maxDailyUsd: number;
  withdrawalAllowlist: string[];
};
