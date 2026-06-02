import { config } from '../config.js';
import type { VenueAdapter, OrderIntent, VenueOrderResult } from './adapter.js';

/**
 * Polymarket US venue — the LIGHT, regulated path. EDGE does NOT custody funds and
 * does NOT sign orders (the DCM/FCM model forbids it). Instead we hand the user a
 * deep-link into their OWN KYC'd Polymarket US account, tagged with our referral/IB
 * code so we earn the revenue-share. Auto-copy never reaches here — the keeper's
 * venue guard skips US users before any managed action.
 *
 * No builder fee exists on US (see copytrade/07); monetization is referral/IB only.
 */
export class UsVenue implements VenueAdapter {
  readonly id = 'us' as const;

  async routeOrder(intent: OrderIntent): Promise<VenueOrderResult> {
    if (intent.kind === 'autocopy') {
      // Defense in depth — the keeper should never route a US user here in the first place.
      return {
        kind: 'skipped',
        venue: 'us',
        reason: 'auto-copy is not available on the regulated US venue (no third-party signing)',
      };
    }
    const ref = config.venue.usReferralCode;
    const deepLink = buildDeepLink(intent.marketSlug, ref);
    return {
      kind: 'referral',
      venue: 'us',
      deepLink,
      referralCode: ref,
      note: 'Trade in your own Polymarket US account — EDGE never holds your funds.',
    };
  }
}

function buildDeepLink(marketSlug: string, referralCode: string): string {
  const base = config.venue.usSiteUrl.replace(/\/$/, '');
  const url = new URL(`${base}/event/${encodeURIComponent(marketSlug)}`);
  if (referralCode) url.searchParams.set('ref', referralCode);
  return url.toString();
}
