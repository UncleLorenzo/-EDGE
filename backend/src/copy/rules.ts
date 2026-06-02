/**
 * FollowRule — what a user wants to copy. Stored per (user, target) in Postgres
 * (follow_rules). The single control surface for both web and Telegram.
 */

export type SizingMode = 'fixed' | 'pctOfSharp' | 'pctOfBankroll';
export type MarketCategory = 'politics' | 'crypto' | 'sports' | 'macro' | 'other';

export type FollowRule = {
  id: string;
  userId: string;
  targetWallet: string;
  enabled: boolean;
  sizing: { mode: SizingMode; value: number }; // $50 | 0.10 (10% of sharp) | 0.02 (2% bankroll)
  filters: {
    minSharpPnl?: number;
    markets?: MarketCategory[];
    minTradeUsd?: number;
    maxTradeUsd?: number;
    sides?: ('BUY' | 'SELL')[]; // entries only, exits only, or both
    priceCeiling?: number;      // don't chase if odds already > Xc
  };
  risk: {
    maxPerTradeUsd: number;
    maxDailyUsd: number;
    maxOpenExposureUsd: number;
    maxSlippageBps: number;
    stopLossPct?: number;
    dailyLossLimitUsd?: number;
  };
};

export interface FollowRuleStore {
  forTarget(targetWallet: string): Promise<FollowRule[]>; // enabled rules only
  upsert(rule: FollowRule): Promise<void>;
  setEnabled(id: string, enabled: boolean): Promise<void>;
}
