import { config } from '../config.js';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TOKENOMICS SEAM
 * ─────────────────────────────────────────────────────────────────────────────
 * Fees are computed and charged in USDC, always. Whether any of that USDC ever
 * touches the $EDGE token is decided HERE and nowhere else.
 *
 *   TOKENOMICS_ENABLED = false  (launch):  100% of every fee -> treasury.
 *                                          No token. No burn. Flat fees.
 *   TOKENOMICS_ENABLED = true   (later):   fee splits -> buy-&-burn $EDGE + treasury,
 *                                          and tiers (computed elsewhere) lower the bps.
 *
 * The rest of the codebase calls computeFee() / splitFee() and records the result
 * in the fee_ledger. It never branches on the token. "Dropping the hammer" is a
 * config flip + a buy-burn worker, not a refactor.
 *
 * CAPTURE: the fee is collected NATIVELY via a Polymarket Builder Code attached to
 * each order (config.fees.builderCode). No custodial skim and no router contract are
 * needed — Polymarket settles builder_fee = notional × bps / 10000 on top of their
 * own fees. The exec layer attaches the code; this module only does the accounting.
 * See copytrade/06-FEE-MODEL-DECISION.md.
 */

export type TradeContext = {
  notionalUsd: number;
  /** 'manual' = human-confirmed one-click; 'autocopy' = keeper-driven mirror. */
  kind: 'manual' | 'autocopy';
  /** Effective bps for THIS user. Flat today; tier-discounted when token is on. */
  effectiveBps?: number;
  /** Was this user referred? If so, a share of the fee routes to the referrer. */
  referred?: boolean;
};

export type FeeBreakdown = {
  notionalUsd: number;
  bps: number;
  feeUsd: number;
  /** Referral payout carved from our take (0 if user wasn't referred). */
  referralUsd: number;
  /** Where the rest of the USDC goes. treasuryUsd + burnUsd + referralUsd = feeUsd. */
  split: { treasuryUsd: number; burnUsd: number };
  tokenomicsEnabled: boolean;
};

/** Should we charge a fee for this kind of trade at all? (Audit-driven toggles.) */
export function isFeeable(kind: TradeContext['kind']): boolean {
  return kind === 'manual' ? config.fees.onManual : config.fees.onAutoCopy;
}

/** Compute the USDC fee for a trade. Tier discounts (token era) arrive via effectiveBps. */
export function computeFee(ctx: TradeContext): FeeBreakdown {
  const bps = ctx.effectiveBps ?? config.fees.bps;
  const feeUsd = isFeeable(ctx.kind) ? round2((ctx.notionalUsd * bps) / 10_000) : 0;

  // Referral comes off the top of the fee; the rest is ours to split.
  const referralUsd = ctx.referred ? round2((feeUsd * config.fees.referralSharePct) / 100) : 0;
  const ourTake = round2(feeUsd - referralUsd);

  return {
    notionalUsd: ctx.notionalUsd,
    bps: isFeeable(ctx.kind) ? bps : 0,
    feeUsd,
    referralUsd,
    split: splitFee(ourTake),
    tokenomicsEnabled: config.tokenomics.enabled,
  };
}

/**
 * THE SWITCH. Token off => everything to treasury. Token on => carve out the
 * burn share. Callers route USDC per this split; the buy-&-burn worker (token era)
 * consumes the burn share, market-buys $EDGE, and sends it to the burn address.
 * `ourTake` is the fee minus any referral payout.
 */
export function splitFee(ourTake: number): { treasuryUsd: number; burnUsd: number } {
  if (!config.tokenomics.enabled) {
    return { treasuryUsd: ourTake, burnUsd: 0 };
  }
  const burnUsd = round2((ourTake * config.tokenomics.burnSplitPct) / 100);
  return { treasuryUsd: round2(ourTake - burnUsd), burnUsd };
}

/**
 * Display string shown inline before every confirm. Trust > hidden bps.
 * "fee $0.20" today; same call site shows "fee $0.20 · 50% burns $EDGE" later.
 */
export function feeLabel(fee: FeeBreakdown): string {
  if (fee.feeUsd === 0) return 'no fee';
  const base = `fee $${fee.feeUsd.toFixed(2)}`;
  return fee.split.burnUsd > 0
    ? `${base} · $${fee.split.burnUsd.toFixed(2)} buys & burns $EDGE`
    : base;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
