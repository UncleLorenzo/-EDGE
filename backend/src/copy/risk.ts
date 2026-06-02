import { config } from '../config.js';
import type { Signal } from './signal.js';
import type { FollowRule } from './rules.js';

/**
 * The risk gate — runs before EVERY execution. Any failure => skip + notify, never
 * a silent swallow. This is the difference between a safe auto-copier and one that
 * drains a follower in a bad market.
 */

export type RiskContext = {
  followerBalanceUsd: number;
  spentTodayUsd: number;
  openExposureUsd: number;
  dailyPnlUsd: number;
  marketBlacklisted: boolean;
  isDuplicate: boolean; // same (signal, user) already copied
  minOrderUsd: number;
};

export type RiskDecision = { ok: true } | { ok: false; reason: string };

export function riskGate(
  signal: Signal,
  rule: FollowRule,
  sizeUsd: number,
  feeUsd: number,
  ctx: RiskContext,
): RiskDecision {
  if (config.safety.killSwitch) return deny('global kill switch on');
  if (ctx.isDuplicate) return deny('duplicate copy for this signal');
  if (ctx.marketBlacklisted) return deny('market blacklisted');
  if (sizeUsd < ctx.minOrderUsd) return deny('size below Polymarket min after caps');

  if (ctx.followerBalanceUsd < sizeUsd + feeUsd) return deny('insufficient balance');
  if (ctx.spentTodayUsd + sizeUsd > rule.risk.maxDailyUsd) return deny('daily spend cap');
  if (ctx.openExposureUsd + sizeUsd > rule.risk.maxOpenExposureUsd) return deny('open exposure cap');
  if (ctx.openExposureUsd + sizeUsd > config.safety.globalMaxOpenExposureUsd)
    return deny('global exposure cap');

  // Circuit breaker: stop copying once today's losses hit the limit.
  if (rule.risk.dailyLossLimitUsd != null && ctx.dailyPnlUsd <= -rule.risk.dailyLossLimitUsd)
    return deny('daily loss limit hit (circuit breaker)');

  // Don't chase: filter on the sharp's entry odds if the user set a ceiling.
  if (rule.filters.priceCeiling != null && signal.sharpPrice > rule.filters.priceCeiling)
    return deny('price above ceiling — not chasing');

  // Note: the marketable-price slippage check happens in the execution engine,
  // which has the live book; this gate covers everything knowable pre-quote.
  return { ok: true };
}

function deny(reason: string): RiskDecision {
  return { ok: false, reason };
}
