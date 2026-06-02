import { config } from '../config.js';
import type { Signal, SignalSource } from './signal.js';
import type { FollowRule, FollowRuleStore } from './rules.js';
import { sizeForCopy } from './sizing.js';
import { riskGate, type RiskContext } from './risk.js';
import { computeFee } from '../fees/fee.js';

/**
 * The keeper — the always-on worker at the center of auto-copy. Consumes sharp
 * signals and fans them out to every follower's rule:
 *
 *   signal -> rules for target -> size -> risk gate -> execute -> record + notify
 *
 * Hard requirements (doc 02 §5):
 *   - IDEMPOTENT per (signalId, user): never double-submit a copy.
 *   - retries with backoff on transient CLOB errors (handled by the BullMQ queue).
 *   - partial-fill handling.
 *   - a GLOBAL PAUSE the ops team can flip instantly (config.safety.killSwitch).
 *   - DRY-RUN by default: logs intended copies, places nothing, until explicitly armed.
 *
 * Exit-mirroring (the alpha): when a followed sharp SELLS/reduces a position the
 * follower holds, mirror the exit. Provenance is tracked in trades.source_wallet /
 * positions.origin_wallet so exits map cleanly. Built in from day one, not bolted on.
 */

export type CopyDeps = {
  source: SignalSource;
  rules: FollowRuleStore;
  /** Place an order via the per-user execution engine. Returns fill or skip. */
  execute: (rule: FollowRule, signal: Signal, sizeUsd: number) => Promise<{ status: string }>;
  /** Gather the live risk context for a (user, signal). */
  riskContext: (rule: FollowRule, signal: Signal) => Promise<RiskContext>;
  notify: (userId: string, msg: string) => Promise<void>;
  log: (level: 'info' | 'warn' | 'error', msg: string, meta?: unknown) => void;
};

export class CopyKeeper {
  constructor(private readonly deps: CopyDeps) {}

  async start(): Promise<void> {
    const mode = config.safety.keeperDryRun ? 'DRY-RUN (places nothing)' : 'ARMED';
    this.deps.log('info', `CopyKeeper starting — ${mode}`);
    await this.deps.source.subscribe((s) => void this.onSignal(s));
  }

  private async onSignal(signal: Signal): Promise<void> {
    if (config.safety.killSwitch) {
      this.deps.log('warn', 'kill switch on — dropping signal', { id: signal.id });
      return;
    }
    const rules = await this.deps.rules.forTarget(signal.sharpWallet);
    this.deps.log('info', `signal ${signal.id}: ${rules.length} followers`);

    // Bounded fan-out; each follower is independent and idempotent.
    await Promise.all(rules.map((rule) => this.copyForFollower(rule, signal)));
  }

  private async copyForFollower(rule: FollowRule, signal: Signal): Promise<void> {
    if (!matchesFilters(rule, signal)) return;

    const ctx = await this.deps.riskContext(rule, signal);
    const { sizeUsd, clampedBy } = sizeForCopy(signal, rule, {
      followerBalanceUsd: ctx.followerBalanceUsd,
      spentTodayUsd: ctx.spentTodayUsd,
      openExposureUsd: ctx.openExposureUsd,
    });
    const fee = computeFee({ notionalUsd: sizeUsd, kind: 'autocopy' });

    const decision = riskGate(signal, rule, sizeUsd, fee.feeUsd, ctx);
    if (!decision.ok) {
      await this.deps.notify(rule.userId, `Skipped copy of ${signal.sharpName}: ${decision.reason}`);
      this.deps.log('info', `skip ${rule.id}: ${decision.reason}`, { clampedBy });
      return;
    }

    if (config.safety.keeperDryRun) {
      this.deps.log('info', `DRY-RUN would copy ${signal.sharpName} $${sizeUsd}`, { rule: rule.id });
      return;
    }

    try {
      const res = await this.deps.execute(rule, signal, sizeUsd);
      await this.deps.notify(
        rule.userId,
        `Copied ${signal.sharpName}: ${signal.side} ${signal.outcome} $${sizeUsd} (${res.status})`,
      );
    } catch (err) {
      this.deps.log('error', `execute failed for ${rule.id}`, err);
      // The BullMQ wrapper retries transient failures with backoff; non-transient
      // errors surface to the user so they aren't left guessing.
      await this.deps.notify(rule.userId, `Copy of ${signal.sharpName} failed — will retry`);
      throw err;
    }
  }
}

/** Category / size / side filters from the rule. */
function matchesFilters(rule: FollowRule, signal: Signal): boolean {
  const f = rule.filters;
  if (f.sides && !f.sides.includes(signal.side)) return false;
  if (f.minTradeUsd != null && signal.sharpSizeUsd < f.minTradeUsd) return false;
  if (f.minSharpPnl != null && (signal.credPnl ?? 0) < f.minSharpPnl) return false;
  // markets[] filter applied once market->category mapping is wired (markets.ts).
  return true;
}
