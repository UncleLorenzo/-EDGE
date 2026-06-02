import { Bot, InlineKeyboard } from 'grammy';
import { config } from '../config.js';
import { feeLabel, computeFee } from '../fees/fee.js';
import type { Signal } from '../copy/signal.js';

/**
 * The Telegram trading bot (doc 03) — the whole suite in a chat. This is the genre
 * that mints money (Banana Gun / Maestro / BONKbot do millions/mo in fees) and
 * nobody has built the good one for Polymarket.
 *
 * Standard for the genre = managed wallet (custody Model B/C): the bot signs on the
 * user's behalf so every action is one tap. Token-decoupled: deposits + fees are
 * USDC; no $EDGE is required to use the bot.
 *
 * This is the command + UX skeleton. Handlers call the same execution + copy engines
 * the web app uses (shared backend). Wire the managed-wallet provider on /start.
 */

export function buildBot(): Bot {
  const bot = new Bot(config.telegram.botToken || 'PLACEHOLDER_TOKEN');

  bot.command('start', async (ctx) => {
    // TODO: create a managed (MPC) wallet via the custody provider; show deposit addr.
    await ctx.reply(
      [
        '🦅 *Welcome to $EDGE* — copy the sharpest wallets in prediction markets.',
        '',
        'Setting up your trading wallet… deposit USDC on Polygon to start.',
        'No token needed. Fees are tiny and shown before every trade.',
        '',
        'Commands: /wallet /follow /following /positions /pnl /trade /leaderboard /settings',
      ].join('\n'),
      { parse_mode: 'Markdown' },
    );
  });

  bot.command('wallet', (ctx) => ctx.reply('Balance + deposit address + /withdraw (allowlist + confirm).'));
  bot.command('following', (ctx) => ctx.reply('Your active follows + each rule’s running PnL.'));
  bot.command('positions', (ctx) => ctx.reply('Open positions + live PnL.'));
  bot.command('pnl', (ctx) => ctx.reply('Realized / unrealized — today + all-time.'));
  bot.command('leaderboard', (ctx) => ctx.reply('The Hall of Fame, in chat — tap a wallet to follow.'));
  bot.command('settings', (ctx) => ctx.reply('Default sizing, risk caps, slippage, alert filters.'));

  // /follow <name|0x> [size] -> opens the rule editor, then auto-copies.
  bot.command('follow', (ctx) => ctx.reply('Opening the auto-copy rule editor… sizing, caps, slippage, categories.'));
  bot.command('trade', (ctx) => ctx.reply('Manual: search market → BUY/SELL → size → confirm.'));

  // Inline-copy callbacks: copy:<signalId>:<amountUsd> and follow:<sharpWallet>
  bot.callbackQuery(/^copy:(.+):(\d+)$/, async (ctx) => {
    const amount = Number(ctx.match[2]);
    // TODO: keeper.executeManualCopy(userId, signalId, amount)
    await ctx.answerCallbackQuery({ text: `Copying $${amount}…` });
  });
  bot.callbackQuery(/^follow:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery({ text: 'Auto-follow set — future trades will mirror.' });
  });

  return bot;
}

/**
 * The killer loop: push every tracked sharp trade as an alert with inline [Copy]
 * buttons. One tap fills from the user's bot wallet — no app, no signing, no gas.
 */
export function alertKeyboard(signal: Signal): InlineKeyboard {
  const fee = (usd: number) => feeLabel(computeFee({ notionalUsd: usd, kind: 'autocopy' }));
  return new InlineKeyboard()
    .text(`Copy $50 (${fee(50)})`, `copy:${signal.id}:50`)
    .text(`Copy $100`, `copy:${signal.id}:100`)
    .row()
    .text('Copy $250', `copy:${signal.id}:250`)
    .text('Custom $', `copy:${signal.id}:0`)
    .row()
    .text(`Auto-follow ${signal.sharpName}`, `follow:${signal.sharpWallet}`)
    .text('Ignore', `copy:${signal.id}:ignore`);
}

export function alertText(s: Signal): string {
  return [
    `🦅  *${s.sharpName}*  ·  #${s.credRank ?? '?'} all-time`,
    `${s.side}  ${s.outcome}  ·  $${s.sharpSizeUsd.toLocaleString()} @ ${Math.round(s.sharpPrice * 100)}¢`,
    `_${s.marketTitle}_`,
  ].join('\n');
}
