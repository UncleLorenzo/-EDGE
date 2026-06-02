import type { MarketCategory } from '../copy/rules.js';

/**
 * Resolve an EDGE/Polymarket market reference to the concrete tokenId(s), tick size,
 * and min order size the execution engine needs, plus the category used by copy
 * filters. Reuses the same Polymarket data the intelligence product already pulls.
 */
export type MarketMeta = {
  tokenId: string;
  marketSlug: string;
  marketTitle: string;
  tickSize: number;     // smallest price increment (e.g. 0.01 = 1¢)
  minOrderUsd: number;  // Polymarket min order — SPIKE: pin exact value on mainnet
  category: MarketCategory;
};

export interface MarketResolver {
  byTokenId(tokenId: string): Promise<MarketMeta | null>;
  bySlug(slug: string): Promise<MarketMeta | null>;
}
