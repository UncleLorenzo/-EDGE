import Fastify from 'fastify';
import { config } from '../config.js';
import { computeFee, feeLabel } from '../fees/fee.js';
import { resolveVenue } from '../venue/venue.js';
import { UsVenue } from '../venue/us.js';
import type { IntlVenue } from '../venue/intl.js';
import type { OrderIntent } from '../venue/adapter.js';

/**
 * The HTTP API the Vercel web app calls. Vercel = read/UI; this service = money.
 *
 * The venue router is enforced here: /v1/route resolves the user's venue from a
 * SERVER-ATTESTED country (CDN geo header, never client-claimed) and dispatches —
 * US → referral deep-link (no custody), Intl → managed execution (when injected),
 * blocked → refused. The US one-click path is fully live today; the managed path
 * activates when the partner host injects the IntlVenue at go-live.
 */
export function buildServer(opts: { intl?: IntlVenue } = {}) {
  const app = Fastify({ logger: { level: config.logLevel } });
  const us = new UsVenue();

  app.get('/health', async () => ({
    ok: true,
    tokenomicsEnabled: config.tokenomics.enabled,
    venues: { us: config.venue.usEnabled, intl: config.venue.intlEnabled, managedReady: !!opts.intl },
    keeper: config.safety.keeperDryRun ? 'dry-run' : 'armed',
    killSwitch: config.safety.killSwitch,
  }));

  // Live fee quote — what the user will pay, shown inline before confirm (intl only).
  app.get('/v1/fee-quote', async (req) => {
    const q = req.query as { notionalUsd?: string; kind?: string };
    const fee = computeFee({
      notionalUsd: Number(q.notionalUsd ?? 0),
      kind: q.kind === 'manual' ? 'manual' : 'autocopy',
    });
    return { ...fee, label: feeLabel(fee) };
  });

  // The one entry point for trade/copy. Routes by server-attested geo.
  app.post('/v1/route', async (req, reply) => {
    const body = req.body as Partial<OrderIntent> & { kind?: OrderIntent['kind'] };
    const country = serverGeo(req.headers);
    const { venue, reason } = resolveVenue(country);

    if (venue === 'blocked') return reply.code(403).send({ error: 'unavailable in your region', reason });

    const intent: OrderIntent = {
      userId: String(body.userId ?? ''),
      tokenId: String(body.tokenId ?? ''),
      marketSlug: String(body.marketSlug ?? ''),
      side: body.side === 'SELL' ? 'SELL' : 'BUY',
      sizeUsd: Number(body.sizeUsd ?? 0),
      maxSlippageBps: Number(body.maxSlippageBps ?? 100),
      kind: body.kind === 'autocopy' ? 'autocopy' : 'manual',
      clientOrderId: String(body.clientOrderId ?? `${body.userId}:${body.tokenId}:${Date.now()}`),
      refPrice: body.refPrice != null ? Number(body.refPrice) : undefined,
    };

    if (venue === 'us') return { venue, result: await us.routeOrder(intent) };

    // venue === 'intl'
    if (!opts.intl) return reply.code(503).send({ error: 'managed venue not yet configured', reason });
    if (!config.venue.intlEnabled) return reply.code(503).send({ error: 'intl venue disabled' });
    return { venue, result: await opts.intl.routeOrder(intent) };
  });

  app.post('/v1/follow', async () => ({ todo: 'create FollowRule (intl users only — venue-guarded)' }));
  app.get('/v1/positions', async () => ({ todo: 'positions + PnL' }));

  return app;
}

/**
 * Server-attested country. Read ONLY from a trusted CDN/edge geo header — never a
 * client-supplied field (that would let anyone spoof their venue). Vercel sets
 * x-vercel-ip-country; Cloudflare sets cf-ipcountry.
 */
function serverGeo(headers: Record<string, unknown>): string | null {
  const h = (k: string) => {
    const v = headers[k];
    return typeof v === 'string' && v ? v : null;
  };
  return h('x-vercel-ip-country') ?? h('cf-ipcountry') ?? null;
}
