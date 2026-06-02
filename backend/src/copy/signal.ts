/**
 * A normalized sharp-trade signal. The copy engine consumes these; where they come
 * from is an implementation detail (today: the existing ~4s poll over the smart-money
 * KV roster; Phase 6: a low-latency Polymarket WS + Alchemy webhook watcher).
 *
 * This is the seam between the *intelligence* product (already live) and the
 * *execution* product (this service). The intelligence layer is the moat.
 */
export type Signal = {
  id: string;
  sharpWallet: string;
  sharpName: string;
  credRank?: number;
  credPnl?: number;
  tokenId: string;
  marketSlug: string;
  marketTitle: string;
  side: 'BUY' | 'SELL';
  outcome: string;
  sharpPrice: number;
  sharpSizeUsd: number;
  ts: number;
  txHash?: string;
};

/** Source adapter contract — swap the poll for the WS watcher without touching the keeper. */
export interface SignalSource {
  /** Emit each new sharp trade exactly once. Implementations dedup by txHash. */
  subscribe(onSignal: (s: Signal) => void): Promise<void>;
}
