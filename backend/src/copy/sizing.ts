import type { Signal } from './signal.js';
import type { FollowRule } from './rules.js';

/**
 * Turn a signal + rule into a USD size, then clamp by every cap. If the clamped
 * size falls below Polymarket's min order, the caller SKIPS and notifies
 * ("too small after caps") rather than placing a dust order.
 */
export function sizeForCopy(
  signal: Signal,
  rule: FollowRule,
  ctx: { followerBalanceUsd: number; spentTodayUsd: number; openExposureUsd: number },
): { sizeUsd: number; clampedBy?: string } {
  let size: number;
  switch (rule.sizing.mode) {
    case 'fixed':
      size = rule.sizing.value;
      break;
    case 'pctOfSharp':
      size = signal.sharpSizeUsd * rule.sizing.value;
      break;
    case 'pctOfBankroll':
      size = ctx.followerBalanceUsd * rule.sizing.value;
      break;
  }

  let clampedBy: string | undefined;
  const clamp = (cap: number | undefined, label: string) => {
    if (cap != null && size > cap) {
      size = cap;
      clampedBy = label;
    }
  };

  clamp(rule.filters.maxTradeUsd, 'maxTradeUsd');
  clamp(rule.risk.maxPerTradeUsd, 'maxPerTradeUsd');
  clamp(Math.max(0, rule.risk.maxDailyUsd - ctx.spentTodayUsd), 'maxDailyUsd');
  clamp(Math.max(0, rule.risk.maxOpenExposureUsd - ctx.openExposureUsd), 'maxOpenExposureUsd');

  return { sizeUsd: Math.max(0, round2(size)), clampedBy };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
