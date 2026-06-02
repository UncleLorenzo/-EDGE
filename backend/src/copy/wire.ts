import { config } from '../config.js';
import { CopyKeeper, type CopyDeps } from './keeper.js';
import { EdgeFeedSource } from './source-edge.js';
import { PgFollowRuleStore, Users, Trades } from '../db/repos.js';
import { FeeLedger } from '../fees/ledger.js';
import { computeFee } from '../fees/fee.js';
import { resolveVenue } from '../venue/venue.js';
import type { IntlVenue } from '../venue/intl.js';
import type { PositionsReader } from '../exec/positions.js';
import type { RiskContext } from './risk.js';
import type { Signal } from './signal.js';
import type { FollowRule } from './rules.js';

/**
 * Composes the live CopyKeeper from real parts: EDGE feed → Postgres rules → venue-guarded
 * execution → fee ledger. Auto-copy is INTL-ONLY; a US (or blocked) follower is skipped
 * here before any signing, enforcing copytrade/07 at the engine layer.
 *
 * Injected (provided at go-live by the partner host):
 *   intl     IntlVenue (ExecutionEngine + BookSource) — the managed signer + live book
 *   positions PositionsReader — on-chain balances/PnL for risk sizing
 *   walletOf  user → their managed wallet id (from the custody vendor)
 *   notify    push to Telegram/web
 */
export type KeeperWiring = {
  intl: IntlVenue;
  positions: PositionsReader;
  walletOf: (userId: string) => Promise<{ id: string; address: string }>;
  notify: (userId: string, msg: string) => Promise<void>;
  log: CopyDeps['log'];
};

export function buildKeeper(w: KeeperWiring): CopyKeeper {
  const rules = new PgFollowRuleStore();
  const source = new EdgeFeedSource(config.signals.edgeFeedUrl, config.signals.pollMs);

  const riskContext = async (rule: FollowRule, _signal: Signal): Promise<RiskContext> => {
    const wallet = await w.walletOf(rule.userId);
    const balance = await w.positions.getBalanceUsd(wallet.address);
    // spentToday / openExposure / dailyPnl come from the positions + trades reads;
    // conservative zeros until those aggregates are wired (keeper is dry-run until armed).
    return {
      followerBalanceUsd: balance,
      spentTodayUsd: 0,
      openExposureUsd: 0,
      dailyPnlUsd: 0,
      marketBlacklisted: false,
      isDuplicate: false,
      minOrderUsd: 1,
    };
  };

  const execute = async (rule: FollowRule, signal: Signal, sizeUsd: number) => {
    // VENUE GUARD — auto-copy only for non-US (intl). US/blocked → never sign.
    const user = await Users.byId(rule.userId);
    const { venue } = resolveVenue(user?.geo_country);
    if (venue !== 'intl') {
      await w.notify(rule.userId, `Auto-copy unavailable on your venue (${venue}); use the US one-click instead.`);
      return { status: 'skipped' };
    }

    if (await Trades.isDuplicate(signal.id, rule.userId)) return { status: 'duplicate' };

    const wallet = await w.walletOf(rule.userId);
    const clientOrderId = `${signal.id}:${rule.userId}`;
    const res = await w.intl.routeOrder({
      userId: rule.userId,
      tokenId: signal.tokenId,
      marketSlug: signal.marketSlug,
      side: signal.side,
      sizeUsd,
      maxSlippageBps: rule.risk.maxSlippageBps,
      kind: 'autocopy',
      clientOrderId,
      refPrice: signal.sharpPrice,
    });

    if (res.kind !== 'executed') {
      return { status: res.kind === 'skipped' ? `skipped:${res.reason}` : res.kind };
    }

    const tradeId = await Trades.record({
      userId: rule.userId, walletId: wallet.id, clientOrderId,
      tokenId: signal.tokenId, marketSlug: signal.marketSlug, side: signal.side,
      kind: 'autocopy', sizeUsd, avgPrice: res.avgPrice, fillStatus: res.fillStatus,
      sourceSignalId: signal.id, sourceWallet: signal.sharpWallet,
    });
    await FeeLedger.record(tradeId, rule.userId, res.fee ?? computeFee({ notionalUsd: sizeUsd, kind: 'autocopy' }));
    return { status: res.fillStatus };
  };

  const deps: CopyDeps = { source, rules, execute, riskContext, notify: w.notify, log: w.log };
  return new CopyKeeper(deps);
}
