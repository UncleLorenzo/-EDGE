import { config } from './config.js';
import { buildServer } from './api/server.js';
import { buildBot } from './bot/bot.js';

/**
 * Service bootstrap — one always-on process hosting three things that the static
 * Vercel site cannot: the HTTP API, the Telegram bot, and (wired next) the copy
 * keeper. Token-decoupled: boots and runs with TOKENOMICS_ENABLED=false.
 */
async function main() {
  const app = buildServer();

  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(
    `$EDGE backend up on :${config.port} · tokenomics=${config.tokenomics.enabled ? 'ON' : 'OFF'} · keeper=${config.safety.keeperDryRun ? 'dry-run' : 'armed'}`,
  );

  // Telegram bot (webhook in prod; long-poll only in local dev) — starts when a token is set.
  if (config.telegram.botToken) {
    const bot = buildBot();
    if (config.env === 'development') {
      void bot.start();
      app.log.info('Telegram bot: long-poll (dev)');
    } else {
      app.log.info('Telegram bot: set webhook to TELEGRAM_WEBHOOK_URL');
    }
  } else {
    app.log.warn('TELEGRAM_BOT_TOKEN unset — bot disabled');
  }

  // CopyKeeper is wired once a SignalSource + execution wiring land (Phase 2/4).
  // It starts in dry-run (config.safety.keeperDryRun) until explicitly armed.
}

main().catch((err) => {
  console.error('fatal boot error', err);
  process.exit(1);
});
