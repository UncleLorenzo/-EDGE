import { config } from './config.js';
import { buildServer } from './api/server.js';
import { buildBot } from './bot/bot.js';

/**
 * Service bootstrap. One always-on process hosting the API, the Telegram bot, and
 * (at go-live) the copy keeper + buy-burn worker. Token-decoupled and venue-segmented.
 *
 * What boots TODAY (no external creds): the API (incl. the live US referral router +
 * fee quotes) and the bot skeleton. What activates at GO-LIVE by injecting the four
 * partner-provided credentials (see GO-LIVE.md): the managed IntlVenue (custody vendor
 * + live CLOB book), the keeper (DATABASE_URL + arm), and the Telegram token.
 */
async function main() {
  // The managed (intl) venue is injected at go-live (needs custody vendor + book source).
  // Until then the API serves the US referral path live and 503s the managed path.
  const app = buildServer(/* { intl } at go-live */);

  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(
    `$EDGE backend up on :${config.port} · ` +
      `venues[us=${config.venue.usEnabled} intl=${config.venue.intlEnabled}] · ` +
      `tokenomics=${config.tokenomics.enabled ? 'ON' : 'OFF'} · ` +
      `keeper=${config.safety.keeperDryRun ? 'dry-run' : 'armed'}`,
  );

  if (config.telegram.botToken) {
    const bot = buildBot();
    if (config.env === 'development') {
      void bot.start();
      app.log.info('Telegram bot: long-poll (dev)');
    } else {
      app.log.info('Telegram bot: webhook mode — set TELEGRAM_WEBHOOK_URL');
    }
  } else {
    app.log.warn('TELEGRAM_BOT_TOKEN unset — bot disabled (set at go-live)');
  }

  // CopyKeeper (copy/wire.ts buildKeeper) starts here once the managed venue + custody
  // vendor are injected and KEEPER_DRY_RUN=false. It is INTL-only and venue-guarded.
  if (!config.safety.keeperDryRun && config.venue.intlEnabled) {
    app.log.warn('Keeper armed flag set but managed venue not injected — wire buildKeeper() at go-live.');
  }
}

main().catch((err) => {
  console.error('fatal boot error', err);
  process.exit(1);
});
