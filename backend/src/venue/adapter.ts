import type { VenueId } from './venue.js';
import type { FeeBreakdown } from '../fees/fee.js';

/** A venue-agnostic intent to take/exit a position. The router picks who fulfills it. */
export type OrderIntent = {
  userId: string;
  tokenId: string;
  marketSlug: string;
  side: 'BUY' | 'SELL';
  sizeUsd: number;
  kind: 'manual' | 'autocopy';
  maxSlippageBps: number;
  clientOrderId: string;
  /** Sharp's price when copying — slippage reference. */
  refPrice?: number;
};

/** What a venue did with the intent. US never executes — it hands back a deep-link. */
export type VenueOrderResult =
  | {
      kind: 'executed';
      venue: VenueId;
      orderId: string;
      fillStatus: 'filled' | 'partial' | 'killed' | 'pending';
      avgPrice?: number;
      fee: FeeBreakdown;
    }
  | {
      kind: 'referral';
      venue: 'us';
      deepLink: string;
      referralCode: string;
      note: string;
    }
  | { kind: 'skipped'; venue: VenueId; reason: string };

export interface VenueAdapter {
  readonly id: VenueId;
  /** Fulfil an intent per this venue's rules (intl executes; us deep-links). */
  routeOrder(intent: OrderIntent): Promise<VenueOrderResult>;
}
