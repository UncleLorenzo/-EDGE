import { config } from '../config.js';
import type { Signer } from '../custody/signer.js';

/**
 * Thin wrapper over @polymarket/clob-client. Polymarket is a CLOB (not an AMM):
 * orders are EIP-712 signed messages posted to the CLOB API; placing/cancelling is
 * gasless; matches settle on Polygon. Users pay gas once, for token approvals.
 *
 * SPIKE (Phase 0 exit gate): place + fill a real $1 order on a live market from this
 * process, with both a connect-wallet signer and an MPC signer. Pin exact contract
 * addresses, fee schedule, min sizes, and geo rules against live mainnet here.
 */

export type OrderType = 'FOK' | 'FAK' | 'GTC';

export type BuildOrderArgs = {
  tokenId: string;
  side: 'BUY' | 'SELL';
  /** Marketable price (from pricing.ts) for taker orders; limit price for GTC. */
  price: number;
  sizeShares: number;
  type: OrderType;
  clientOrderId: string;
};

export type SubmitResult = {
  orderId: string;
  status: 'filled' | 'partial' | 'killed' | 'pending';
  avgPrice?: number;
  filledShares?: number;
};

// Polymarket contracts to approve (one-time per wallet). SPIKE: verify on mainnet.
export const CONTRACTS = {
  usdcE: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  ctfExchange: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',
  negRiskExchange: '0xC5d563A36AE78145C45a50134d48A1215220f80a',
  negRiskAdapter: '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296',
} as const;

export class ClobClient {
  constructor(private readonly signer: Signer) {}

  /**
   * Build the EIP-712 order, sign via the custody model, POST to the CLOB. The
   * order carries our BUILDER CODE (config.fees.builderCode) so Polymarket settles
   * our fee natively — this is how we monetize without custody or a router contract.
   */
  async buildSignSubmit(userId: string, args: BuildOrderArgs): Promise<SubmitResult> {
    // SPIKE: const client = new PolyClobClient(config.polygon.clobUrl, ...)
    // const unsigned = client.buildOrder({ ...args, builder: config.fees.builderCode,
    //                                      builderFeeRateBps: config.fees.bps })
    // const signed = await this.signer.signOrder(userId, unsigned)
    // return client.postOrder(signed, args.type)
    void config.polygon.clobUrl;
    void config.fees.builderCode;
    void this.signer;
    throw new Error(`ClobClient.buildSignSubmit: wire @polymarket/clob-client (SPIKE) — order ${args.clientOrderId}`);
  }

  async cancel(_userId: string, _orderId: string): Promise<void> {
    throw new Error('ClobClient.cancel: wire @polymarket/clob-client (SPIKE).');
  }
}
