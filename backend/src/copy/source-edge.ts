import type { Signal, SignalSource } from './signal.js';

/**
 * Signal source backed by EDGE's existing intelligence stack (the moat). The sharp
 * feed already exists in production (Smart Money / Sharp Alerts, KV `sharp:feed`);
 * this poller reads it and emits each new sharp trade exactly once, deduped by txHash.
 *
 * v1 reuses the ~4s poll (fine — sharps' markets rarely move in 4s). Phase 6 swaps
 * this for a low-latency Polymarket WS + Alchemy webhook watcher behind the SAME
 * SignalSource interface, so the keeper doesn't change.
 */
export class EdgeFeedSource implements SignalSource {
  private seen = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly feedUrl: string,
    private readonly intervalMs = 4_000,
  ) {}

  async subscribe(onSignal: (s: Signal) => void): Promise<void> {
    const tick = async () => {
      try {
        const res = await fetch(this.feedUrl, { headers: { accept: 'application/json' } });
        if (!res.ok) return;
        const items = normalize(await res.json());
        for (const s of items) {
          const key = s.txHash ?? s.id;
          if (this.seen.has(key)) continue;
          this.seen.add(key);
          onSignal(s);
        }
      } catch {
        // transient feed error — next tick retries
      }
    };
    this.timer = setInterval(() => void tick(), this.intervalMs);
    await tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}

/** Map the EDGE sharp-feed payload → normalized Signal[]. Align keys with the real endpoint. */
function normalize(payload: unknown): Signal[] {
  const arr = Array.isArray(payload)
    ? payload
    : ((payload as { feed?: unknown[]; items?: unknown[] })?.feed ??
       (payload as { items?: unknown[] })?.items ?? []);
  const out: Signal[] = [];
  for (const raw of arr as Record<string, unknown>[]) {
    const tokenId = str(raw.tokenId ?? raw.token_id);
    const sharpWallet = str(raw.wallet ?? raw.sharpWallet ?? raw.address);
    if (!tokenId || !sharpWallet) continue;
    out.push({
      id: str(raw.id ?? raw.txHash ?? `${sharpWallet}:${tokenId}:${raw.ts ?? ''}`),
      sharpWallet,
      sharpName: str(raw.name ?? raw.sharpName ?? sharpWallet.slice(0, 8)),
      credRank: numOpt(raw.rank ?? raw.credRank),
      credPnl: numOpt(raw.pnl ?? raw.credPnl),
      tokenId,
      marketSlug: str(raw.marketSlug ?? raw.slug),
      marketTitle: str(raw.marketTitle ?? raw.title ?? raw.question),
      side: (str(raw.side).toUpperCase() === 'SELL' ? 'SELL' : 'BUY'),
      outcome: str(raw.outcome ?? 'YES'),
      sharpPrice: numOpt(raw.price ?? raw.sharpPrice) ?? 0,
      sharpSizeUsd: numOpt(raw.sizeUsd ?? raw.size ?? raw.usd) ?? 0,
      ts: numOpt(raw.ts ?? raw.timestamp) ?? 0,
      txHash: strOpt(raw.txHash ?? raw.tx),
    });
  }
  return out;
}

const str = (v: unknown): string => (v == null ? '' : String(v));
const strOpt = (v: unknown): string | undefined => (v == null ? undefined : String(v));
const numOpt = (v: unknown): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
