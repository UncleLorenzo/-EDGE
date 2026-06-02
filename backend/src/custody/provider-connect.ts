import type { Signer, UnsignedOrder, SignedOrder } from './signer.js';

/**
 * Model A — connect-wallet (non-custodial). The user holds their own keys; the
 * browser signs each order with their EOA. The server NEVER signs. `signOrder`
 * here just receives the signature the client produced and passes it through.
 *
 * This is the fastest path to ship web one-click trade with zero custody/regulatory
 * weight. It cannot auto-sign, so it powers manual trade/copy only — not auto-copy.
 */
export class ConnectWalletSigner implements Signer {
  readonly model = 'A' as const;
  readonly canAutoSign = false;

  async address(_userId: string): Promise<string> {
    // Resolved from the connected wallet session (set when the user links their EOA).
    throw new Error('ConnectWalletSigner.address: resolve from web wallet session');
  }

  async signOrder(_userId: string, order: UnsignedOrder): Promise<SignedOrder> {
    // The client already signed; the server only forwards. If no signature is
    // present, this code path was reached wrongly (e.g. keeper trying to auto-sign A).
    const signature = (order as { signature?: string }).signature;
    if (!signature) {
      throw new Error('Model A requires a client-side signature; cannot auto-sign.');
    }
    return order as SignedOrder;
  }
}
