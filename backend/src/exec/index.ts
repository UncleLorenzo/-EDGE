import { ClobClient } from './clob.js';
import { marketablePrice, withinSlippage, type OrderBook } from './pricing.js';
import type { Signer } from '../custody/signer.js';
import { computeFee, type FeeBreakdown } from '../fees/fee.js';

/**
 * The public surface the rest of the suite (web, copy keeper, Telegram) calls.
 * Everything routes through here so fees, slippage, and idempotency are enforced
 * in exactly one place.
 */

export type PlaceOrderArgs = {
  userId: string;
  tokenId: string;
  side: 'BUY' | 'SELL';
  sizeUsd: number;
  maxSlippageBps: number;
  kind: 'manual' | 'autocopy';
  clientOrderId: string;
  /** Sharp's price when copying — the reference for the slippage gate. */
  refPrice?: number;
};

export type PlaceOrderResult = {
  orderId: string;
  fillStatus: 'filled' | 'partial' | 'killed' | 'pending' | 'skipped';
  avgPrice?: number;
  fee: FeeBreakdown;
  skippedReason?: string;
};

export class ExecutionEngine {
  private readonly clob: ClobClient;
  constructor(private readonly signer: Signer) {
    this.clob = new ClobClient(signer);
  }

  async placeOrder(args: PlaceOrderArgs, book: OrderBook): Promise<PlaceOrderResult> {
    const fee = computeFee({ notionalUsd: args.sizeUsd, kind: args.kind });

    // Convert USD notional -> shares at the marketable price, then slippage-gate.
    const sizeShares = sharesForUsd(args.sizeUsd, book, args.side);
    const price = marketablePrice(book, args.side, sizeShares);
    if (price == null) {
      return { orderId: '', fillStatus: 'skipped', fee, skippedReason: 'insufficient liquidity' };
    }
    if (args.refPrice != null && !withinSlippage(args.refPrice, price, args.maxSlippageBps)) {
      return { orderId: '', fillStatus: 'skipped', fee, skippedReason: 'slippage exceeded — not chasing' };
    }

    const res = await this.clob.buildSignSubmit(args.userId, {
      tokenId: args.tokenId,
      side: args.side,
      price,
      sizeShares,
      type: 'FOK', // marketable taker: fill now near the sharp's price, or kill
      clientOrderId: args.clientOrderId,
    });

    return { orderId: res.orderId, fillStatus: res.status, avgPrice: res.avgPrice, fee };
  }

  async cancelOrder(userId: string, orderId: string): Promise<void> {
    return this.clob.cancel(userId, orderId);
  }
}

/** Rough USD->shares using the top of book; the engine re-prices on the full walk. */
function sharesForUsd(sizeUsd: number, book: OrderBook, side: 'BUY' | 'SELL'): number {
  const top = side === 'BUY' ? book.asks[0]?.price : book.bids[0]?.price;
  const px = top && top > 0 ? top : 0.5;
  return sizeUsd / px;
}
