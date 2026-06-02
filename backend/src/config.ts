import 'dotenv/config';
import { z } from 'zod';

/**
 * Central config + feature flags. The ONLY place that reads process.env.
 *
 * The tokenomics seam lives here: `tokenomics.enabled` is false by default, so the
 * product runs as a pure-USDC trading/copy tool with no token anywhere. Flipping it
 * true (later — "drop the hammer") turns on the buy-&-burn fee split and the
 * hold-$EDGE tier ladder with no code changes elsewhere. See fees/fee.ts.
 */

const bool = (v: string | undefined, dflt = false) =>
  v == null ? dflt : /^(1|true|yes|on)$/i.test(v);

const num = (v: string | undefined, dflt: number) => {
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : dflt;
};

const env = process.env;

export const config = {
  env: env.NODE_ENV ?? 'development',
  port: num(env.PORT, 8080),
  logLevel: env.LOG_LEVEL ?? 'info',

  db: { url: req('DATABASE_URL') },
  redis: { url: env.REDIS_URL ?? 'redis://localhost:6379' },

  polygon: {
    rpcUrl: req('POLYGON_RPC_URL'),
    chainId: num(env.CHAIN_ID, 137),
    clobUrl: env.POLYMARKET_CLOB_URL ?? 'https://clob.polymarket.com',
  },

  /**
   * Fees are token-agnostic and captured natively via Polymarket Builder Codes
   * (no custody/router needed). Rate decided from the competitive audit: 80 bps,
   * undercutting the ~1% genre norm + PolyGun. See copytrade/06-FEE-MODEL-DECISION.md.
   */
  fees: {
    bps: num(env.FEE_BPS, 80), // 80 bps = 0.80%
    builderCode: env.BUILDER_CODE ?? '',
    referralSharePct: num(env.REFERRAL_SHARE_PCT, 30),
    onManual: bool(env.FEE_ON_MANUAL, true),
    onAutoCopy: bool(env.FEE_ON_AUTOCOPY, true),
    treasuryAddress: env.TREASURY_ADDRESS ?? '',
  },

  /**
   * THE SEAM. Everything token-related hangs off `enabled`. Off => no token exists
   * as far as the product is concerned. On => fee split + tiers activate.
   */
  tokenomics: {
    enabled: bool(env.TOKENOMICS_ENABLED, false),
    burnSplitPct: num(env.BURN_SPLIT_PCT, 50),
    edgeTokenAddress: env.EDGE_TOKEN_ADDRESS ?? '',
    burnAddress: env.BURN_ADDRESS ?? '0x000000000000000000000000000000000000dEaD',
  },

  custody: {
    defaultModel: (env.DEFAULT_CUSTODY_MODEL ?? 'A') as 'A' | 'B' | 'C',
    mpcProvider: env.MPC_PROVIDER ?? '',
    mpcApiKey: env.MPC_API_KEY ?? '',
    mpcApiSecret: env.MPC_API_SECRET ?? '',
  },

  safety: {
    killSwitch: bool(env.KILL_SWITCH, false),
    keeperDryRun: bool(env.KEEPER_DRY_RUN, true),
    globalMaxOpenExposureUsd: num(env.GLOBAL_MAX_OPEN_EXPOSURE_USD, 100_000),
  },

  /**
   * Venue segmentation (see copytrade/07-VENUE-AND-COMPLIANCE.md). US users route to
   * the light/referral path on Polymarket US (no custody, no signing); everyone else
   * (non-US, non-sanctioned) routes to the managed builder-fee product on International.
   * Both halves only turn on when their `*Enabled` flag is flipped at go-live.
   */
  venue: {
    intlEnabled: bool(env.VENUE_INTL_ENABLED, false), // the non-US managed bot (partner-hosted)
    usEnabled: bool(env.VENUE_US_ENABLED, false),     // the US referral/IB path
    // EDGE's Polymarket US referral/IB code (US-side monetization; no builder fee on US).
    usReferralCode: env.US_REFERRAL_CODE ?? '',
    // Polymarket US public site for deep-links (US users trade in their own account).
    usSiteUrl: env.US_SITE_URL ?? 'https://polymarket.us',
  },

  telegram: {
    botToken: env.TELEGRAM_BOT_TOKEN ?? '',
    webhookUrl: env.TELEGRAM_WEBHOOK_URL ?? '',
  },

  /** The copy signal comes from EDGE's existing sharp feed (the intelligence moat). */
  signals: {
    edgeFeedUrl: env.EDGE_FEED_URL ?? 'https://www.thepolyedge.com/api/whales/sharp',
    pollMs: num(env.SIGNAL_POLL_MS, 4_000),
  },
} as const;

function req(key: string): string {
  const v = process.env[key];
  if (!v) {
    // Don't hard-crash the scaffold in dev; real deploys must set these.
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing required env var: ${key}`);
    }
    return '';
  }
  return v;
}

/** Tiny zod sanity check so a malformed FEE_BPS fails loud, not silent. */
export const FeeConfigSchema = z.object({
  bps: z.number().int().min(0).max(1000), // hard ceiling 10%
});
FeeConfigSchema.parse({ bps: config.fees.bps });

export type Config = typeof config;
