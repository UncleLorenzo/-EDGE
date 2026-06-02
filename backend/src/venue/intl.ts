import type { VenueAdapter, OrderIntent, VenueOrderResult } from './adapter.js';
import type { ExecutionEngine } from '../exec/index.js';
import type { OrderBook } from '../exec/pricing.js';
import { assertCanManagedSign } from './venue.js';

/** Supplies the live order book for a token (Polymarket CLOB /book). */
export interface BookSource {
  getBook(tokenId: string): Promise<OrderBook>;
}

/**
 * Polymarket International venue — the FULL managed path (non-US only). Self-custody
 * on-chain, builder-code fee capture, and EDGE may sign on the user's behalf (managed
 * wallet), so one-tap + auto-copy work here. This is the lucrative core.
 *
 * Runs from the non-US partner's hosting. The single live-submit seam is inside
 * ExecutionEngine → ClobClient.buildSignSubmit (marked SPIKE).
 */
export class IntlVenue implements VenueAdapter {
  readonly id = 'intl' as const;

  constructor(
    private readonly engine: ExecutionEngine,
    private readonly books: BookSource,
  ) {}

  async routeOrder(intent: OrderIntent): Promise<VenueOrderResult> {
    // Defense in depth: only intl may manage-sign. Throws for any non-intl caller.
    assertCanManagedSign('intl');

    const book = await this.books.getBook(intent.tokenId);
    const res = await this.engine.placeOrder(
      {
        userId: intent.userId,
        tokenId: intent.tokenId,
        side: intent.side,
        sizeUsd: intent.sizeUsd,
        maxSlippageBps: intent.maxSlippageBps,
        kind: intent.kind,
        clientOrderId: intent.clientOrderId,
        refPrice: intent.refPrice,
      },
      book,
    );

    if (res.fillStatus === 'skipped') {
      return { kind: 'skipped', venue: 'intl', reason: res.skippedReason ?? 'skipped' };
    }
    return {
      kind: 'executed',
      venue: 'intl',
      orderId: res.orderId,
      fillStatus: res.fillStatus,
      avgPrice: res.avgPrice,
      fee: res.fee,
    };
  }
}
