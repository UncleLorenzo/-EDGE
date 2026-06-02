import type { Signer, UnsignedOrder, SignedOrder, SignerPolicy } from './signer.js';
import { config } from '../config.js';

/**
 * Model B — managed MPC wallet. EDGE policy-signs on the user's behalf so Telegram
 * and auto-copy can be one-tap. Keys are sharded/TEE-held by an MPC vendor
 * (Turnkey / Privy / Fireblocks) — NEVER raw on our servers. Every signature is
 * gated by a per-wallet policy: allowlisted contracts (only Polymarket + USDC.e),
 * per-tx + daily spend caps, withdrawals only to an allowlisted address.
 *
 * VENDOR TODO (Day-0 decision): wire the chosen provider's SDK in createWallet()
 * and signOrder(). Until then this throws clearly rather than pretending to sign.
 */
export class MpcSigner implements Signer {
  readonly model = 'B' as const;
  readonly canAutoSign = true;

  constructor(private readonly policy: SignerPolicy) {
    if (!config.custody.mpcProvider) {
      // Loud in prod; tolerated in the scaffold so the rest can typecheck/boot.
      if (config.env === 'production') {
        throw new Error('MPC_PROVIDER not configured — choose a custody vendor (Day-0).');
      }
    }
  }

  /** Create a managed wallet for a user on first deposit (/start in Telegram). */
  async createWallet(_userId: string): Promise<{ address: string; ref: string }> {
    // VENDOR TODO: provider.wallets.create({ policy: this.policy })
    throw new Error('MpcSigner.createWallet: wire MPC vendor SDK (Turnkey/Privy).');
  }

  async address(_userId: string): Promise<string> {
    // VENDOR TODO: look up the user's provider-side wallet ref -> address.
    throw new Error('MpcSigner.address: wire MPC vendor SDK.');
  }

  async signOrder(_userId: string, _order: UnsignedOrder): Promise<SignedOrder> {
    // VENDOR TODO: enforce this.policy, then provider.sign(order). The policy check
    // (caps + contract allowlist) is the security boundary — do it provider-side.
    throw new Error('MpcSigner.signOrder: wire MPC vendor SDK + policy engine.');
  }
}
