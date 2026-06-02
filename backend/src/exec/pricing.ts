/**
 * Book -> marketable price + slippage check. For copy trades we use marketable
 * taker orders (FOK/FAK) so a copy fills NOW near the sharp's price, or not at all.
 * The slippage cap is the guardrail: if the book has moved beyond it, we SKIP the
 * copy rather than chase a market that already ran. (Chasing is how copy products
 * bleed followers.)
 */

export type BookLevel = { price: number; sizeShares: number };
export type OrderBook = { bids: BookLevel[]; asks: BookLevel[] };

/** Walk the book to fill `sizeShares`; return size-weighted avg price, or null if too thin. */
export function marketablePrice(
  book: OrderBook,
  side: 'BUY' | 'SELL',
  sizeShares: number,
): number | null {
  const levels = side === 'BUY' ? book.asks : book.bids; // BUY lifts asks, SELL hits bids
  let remaining = sizeShares;
  let cost = 0;
  for (const lvl of levels) {
    const take = Math.min(remaining, lvl.sizeShares);
    cost += take * lvl.price;
    remaining -= take;
    if (remaining <= 0) break;
  }
  if (remaining > 0) return null; // not enough resting liquidity
  return cost / sizeShares;
}

/** True if `execPrice` is within `maxSlippageBps` of the sharp's `refPrice`. */
export function withinSlippage(refPrice: number, execPrice: number, maxSlippageBps: number): boolean {
  if (refPrice <= 0) return false;
  const slipBps = (Math.abs(execPrice - refPrice) / refPrice) * 10_000;
  return slipBps <= maxSlippageBps;
}
