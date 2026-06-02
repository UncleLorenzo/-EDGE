/**
 * Positions + realized/unrealized PnL per wallet. Reads ERC-1155 balances + the
 * Polymarket data-api, reconciled against our `positions` table by a background job
 * (on-chain reconciliation is a security control, not just bookkeeping).
 *
 * `originWallet` is carried through so exit-mirroring knows which follower positions
 * came from which sharp — the keeper sells the same % when the sharp reduces.
 */
export type Position = {
  tokenId: string;
  marketSlug: string;
  sizeShares: number;
  avgCost: number;
  unrealizedPnlUsd: number;
  realizedPnlUsd: number;
  originWallet?: string;
};

export interface PositionsReader {
  getPositions(walletAddress: string): Promise<Position[]>;
  getBalanceUsd(walletAddress: string): Promise<number>;
}
