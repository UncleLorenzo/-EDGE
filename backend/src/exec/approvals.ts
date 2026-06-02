import { CONTRACTS } from './clob.js';

/**
 * USDC.e + CTF approvals are the ONE on-chain, gas-costing step a user takes before
 * they can trade (placing/cancelling orders is gasless). Idempotent: check first,
 * only send the missing setApprovalForAll / approve calls.
 *
 * Required approvals (per wallet): USDC.e + CTF (setApprovalForAll) for the
 * CTF Exchange, Neg-Risk Exchange, and Neg-Risk Adapter. Without these, orders
 * can't settle.
 */
export const REQUIRED_SPENDERS = [
  CONTRACTS.ctfExchange,
  CONTRACTS.negRiskExchange,
  CONTRACTS.negRiskAdapter,
] as const;

export interface Approvals {
  /** True if all required USDC.e + CTF approvals are already set for the wallet. */
  isApproved(walletAddress: string): Promise<boolean>;
  /** Send any missing approvals (Model A: user signs; Model B/C: policy-signed). */
  ensureApprovals(userId: string, walletAddress: string): Promise<void>;
}
