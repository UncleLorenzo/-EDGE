import Fastify from 'fastify';
import { config } from '../config.js';
import { computeFee, feeLabel } from '../fees/fee.js';

/**
 * The HTTP API the Vercel web app calls. Vercel = read/UI; this service = money.
 * Endpoints here are the web surfaces for one-click trade / copy / auto-copy.
 *
 * Auth, validation, and the execution/copy engine wiring are TODO; this establishes
 * the routes + a live fee-quote endpoint that already reflects the token-decoupled
 * config (so the web app can show "fee $0.20" before confirm today).
 */
export function buildServer() {
  const app = Fastify({ logger: { level: config.logLevel } });

  app.get('/health', async () => ({
    ok: true,
    tokenomicsEnabled: config.tokenomics.enabled,
    keeper: config.safety.keeperDryRun ? 'dry-run' : 'armed',
    killSwitch: config.safety.killSwitch,
  }));

  // Live fee quote — what the user will pay, shown inline before confirm.
  app.get('/v1/fee-quote', async (req) => {
    const q = req.query as { notionalUsd?: string; kind?: string };
    const fee = computeFee({
      notionalUsd: Number(q.notionalUsd ?? 0),
      kind: q.kind === 'manual' ? 'manual' : 'autocopy',
    });
    return { ...fee, label: feeLabel(fee) };
  });

  // ── Stubs the frontend will call (wired in Phases 1–4) ──────────────────────
  app.post('/v1/trade', async () => ({ todo: 'one-click trade — exec engine' }));
  app.post('/v1/copy', async () => ({ todo: 'one-click copy — pre-filled from signal' }));
  app.post('/v1/follow', async () => ({ todo: 'create FollowRule — auto-copy' }));
  app.get('/v1/positions', async () => ({ todo: 'positions + PnL' }));

  return app;
}
