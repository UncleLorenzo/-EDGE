/**
 * ─────────────────────────────────────────────────────────────────────────────
 * VENUE ROUTER — the compliance backbone (copytrade/07-VENUE-AND-COMPLIANCE.md)
 * ─────────────────────────────────────────────────────────────────────────────
 * The two Polymarket venues are architecturally opposite, so EDGE routes every user
 * to the one that's legal for them — and ENFORCES the difference in code, not just UI:
 *
 *   intl  Polymarket International — permissionless, self-custody, builder fees,
 *         managed auto-copy allowed.  NON-US users only.
 *   us    Polymarket US — CFTC-regulated DCM, account-based, NO builder fees, NO
 *         third-party signing. EDGE = signal + referral deep-link only.
 *   blocked  sanctioned/unknown — no execution features at all.
 *
 * The hard guard (assertCanManagedSign) makes it IMPOSSIBLE for the keeper or bot to
 * custody/sign for a US user, even if a UI bug tried — the regulated rule lives here.
 */

export type VenueId = 'us' | 'intl';
export type VenueResolution = VenueId | 'blocked';

export type VenueCapabilities = {
  selfCustody: boolean;            // user holds keys (intl) vs broker-held (us)
  builderFees: boolean;            // 80bps builder code works (intl only)
  managedAutoCopy: boolean;        // EDGE may sign/auto-copy for the user (intl only)
  thirdPartyOrderSigning: boolean; // EDGE may place orders on the user's behalf
  kycByVenue: boolean;             // the venue does KYC (us)
};

export const VENUE_CAPS: Record<VenueId, VenueCapabilities> = {
  intl: {
    selfCustody: true,
    builderFees: true,
    managedAutoCopy: true,
    thirdPartyOrderSigning: true,
    kycByVenue: false,
  },
  us: {
    selfCustody: false,
    builderFees: false,
    managedAutoCopy: false,
    thirdPartyOrderSigning: false,
    kycByVenue: true,
  },
};

/**
 * Jurisdictions neither venue serves (sanctioned / Polymarket-restricted, minus US
 * which routes to the regulated `us` path). Keep in sync with counsel + venue ToS.
 */
export const FULLY_BLOCKED_COUNTRIES = new Set<string>([
  'CU', 'IR', 'KP', 'SY', 'RU', 'BY', // sanctions
  // ... the remainder of Polymarket's restricted list, confirmed with counsel.
]);

/**
 * Decide the venue for a user from their (venue-attested) country code. We refuse to
 * guess: unknown geo => 'blocked' for execution (the read-only signal site is separate
 * and unrestricted). US => the regulated light path. Everyone else allowed => intl.
 */
export function resolveVenue(geoCountry: string | null | undefined): {
  venue: VenueResolution;
  reason: string;
} {
  if (!geoCountry) return { venue: 'blocked', reason: 'geo unknown — execution withheld' };
  const cc = geoCountry.toUpperCase();
  if (cc === 'US') return { venue: 'us', reason: 'US → regulated light path (Polymarket US)' };
  if (FULLY_BLOCKED_COUNTRIES.has(cc)) return { venue: 'blocked', reason: `${cc} restricted` };
  return { venue: 'intl', reason: `${cc} → International managed path` };
}

export function capsFor(venue: VenueId): VenueCapabilities {
  return VENUE_CAPS[venue];
}

/** Raised when a US/blocked user reaches a managed-signing path. Compliance backstop. */
export class VenueGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VenueGuardError';
  }
}

/**
 * THE HARD GUARD. Call before any custody/auto-copy/order-signing action. Throws unless
 * the venue permits EDGE to sign on the user's behalf (intl only). This is what makes
 * the regulated rule un-bypassable from the engine layer.
 */
export function assertCanManagedSign(venue: VenueResolution): asserts venue is 'intl' {
  if (venue !== 'intl' || !VENUE_CAPS.intl.managedAutoCopy) {
    throw new VenueGuardError(
      `Managed signing is forbidden for venue="${venue}". EDGE never custodies or signs ` +
        `for US/blocked users — route them to the referral path instead.`,
    );
  }
}
