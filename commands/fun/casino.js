/**
 * .casino — Virtual casino games 🎰
 * No real money. Just fun with virtual coins stored in user profile.
 *
 * .casino          → show menu + balance
 * .casino slots    → spin the slots
 * .casino dice     → roll dice (bet coins)
 * .casino flip     → coin flip (bet coins)
 * .casino daily    → claim daily bonus coins
 * .casino balance  → check balance
 */
const database = require('../../database');
const { sc }   = require('../../utils/categoryMenu');
const config   = require('../../config');

const DAILY_BONUS  = 500;
const START_COINS  = 1000;
const MIN_BET      = 10;
const MAX_BET      = 5000;
const DAILY_MS     = 24 * 60 * 60 * 1000;

// ── Helpers ──────────────────────────────────────────────────────────────────
function getCoins(userId) {
  const u = database.getUser(userId) || {};
  if (typeof u.coins !== 'number') return START_COINS;
  return u.coins;
}
function setCoins(userId, amount) {
  database.updateUser(userId, { coins: Math.max(0, Math.floor(amount)) });
}
function fmt(n) { return Number(n).toLocaleString(); }

// ── Slots ────────────────────────────────────────────────────────────────────
const REELS = ['🍒', '🍋', '🍊', '🍇', '⭐', '💎', '7️⃣', '🎰'];

function spin() {
  return [0, 1, 2].map(() => REELS[Math.floor(Math.random() * REELS.length)]);
}

function slotsMultiplier(reels) {
  const [a, b, c] = reels;
  if (a === b && b === c) {
    if (a === '💎') return 50;
    if (a === '7️⃣') return 20;
    if (a === '⭐') return 10;
    return 5;
  }
  if (a === b || b === c || a === c) return 1.5;
  return 0;
}

module.exports = {
  name: 'casino',
  aliases: ['gamble', 'slots', 'bet'],
  category: 'fun',
  description: 'Virtual casino games — slots, dice, flip',
  usage: '.casino [slots|dice|flip|daily|balance] [bet]',

  async execute(sock, msg, args, extra) {
    try {
      const userId  = extra.sender.split('@')[0];
      const sub     = (args[0] || 'menu').toLowerCase();
      const betArg  = parseInt(args[1] || args[0], 10);
      const coins   = getCoins(userId);

      // ── MENU ───────────────────────────────────────────────────────────────
      if (sub === 'menu' || isNaN(parseInt(sub))) {
        if (!['slots', 'dice', 'flip', 'daily', 'balance'].includes(sub)) {
          let t = `┏❐ 《 *🎰 ${sc('casino')}* 》 ❐\n┃\n`;
          t += `┣◆ 💰 *${sc('balance')}:* ${fmt(coins)} coins\n┃\n`;
          t += `┣◆ 🎰 *.casino slots <bet>* — Spin the slot machine\n`;
          t += `┣◆ 🎲 *.casino dice <bet>* — Roll dice vs bot\n`;
          t += `┣◆ 🪙 *.casino flip <bet>* — Heads or tails\n`;
          t += `┣◆ 🎁 *.casino daily* — Claim ${fmt(DAILY_BONUS)} daily coins\n`;
          t += `┣◆ 💳 *.casino balance* — Check your coins\n`;
          t += `┃\n┣◆ ⚠️ _Virtual coins only. No real money._\n`;
          t += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
          return extra.reply(t);
        }
      }

      // ── BALANCE ────────────────────────────────────────────────────────────
      if (sub === 'balance') {
        return extra.reply(
          `💰 *${sc('your balance')}*\n\n` +
          `🪙 *${fmt(coins)}* virtual coins\n\n` +
          `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`
        );
      }

      // ── DAILY ──────────────────────────────────────────────────────────────
      if (sub === 'daily') {
        const u       = database.getUser(userId) || {};
        const lastDaily = u.lastDaily || 0;
        const now     = Date.now();
        if (now - lastDaily < DAILY_MS) {
          const left = DAILY_MS - (now - lastDaily);
          const hrs  = Math.floor(left / 3600000);
          const mins = Math.floor((left % 3600000) / 60000);
          return extra.reply(
            `⏳ *Daily already claimed!*\n\nCome back in *${hrs}h ${mins}m*\n\n` +
            `💰 Balance: *${fmt(coins)}* coins\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`
          );
        }
        const newBal = coins + DAILY_BONUS;
        setCoins(userId, newBal);
        database.updateUser(userId, { lastDaily: now });
        return extra.reply(
          `🎁 *Daily Bonus Claimed!*\n\n` +
          `+${fmt(DAILY_BONUS)} coins added!\n` +
          `💰 New balance: *${fmt(newBal)}* coins\n\n` +
          `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`
        );
      }

      // ── BET VALIDATION (shared by slots/dice/flip) ─────────────────────────
      const games = ['slots', 'dice', 'flip'];
      if (!games.includes(sub)) {
        return extra.reply(`❓ Unknown game. Try: *.casino slots|dice|flip|daily|balance*`);
      }
      const bet = isNaN(betArg) || betArg < MIN_BET ? MIN_BET : Math.min(betArg, MAX_BET);
      if (coins < bet) {
        return extra.reply(
          `❌ Not enough coins!\n\n` +
          `💰 Balance: *${fmt(coins)}* | Bet: *${fmt(bet)}*\n` +
          `Try *.casino daily* for free coins.\n\n` +
          `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`
        );
      }

      // ── SLOTS ──────────────────────────────────────────────────────────────
      if (sub === 'slots') {
        const reels = spin();
        const multi = slotsMultiplier(reels);
        const win   = multi > 0;
        const won   = Math.floor(bet * multi);
        const newBal = win ? coins - bet + won : coins - bet;
        setCoins(userId, newBal);

        let result = win
          ? (multi >= 10 ? '🎊 *JACKPOT!!!*' : multi >= 5 ? '🎉 *BIG WIN!*' : multi >= 2 ? '✅ *WIN!*' : '✅ *Small Win*')
          : '❌ *No Match*';

        let t = `🎰 *${sc('slot machine')}*\n\n`;
        t += `╔══════════════╗\n`;
        t += `║  ${reels.join('  ')}  ║\n`;
        t += `╚══════════════╝\n\n`;
        t += `${result}\n`;
        if (win) t += `💥 x${multi} multiplier → +${fmt(won)} coins\n`;
        else     t += `You lost *${fmt(bet)}* coins\n`;
        t += `\n💰 Balance: *${fmt(newBal)}* coins\n\n`;
        t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
        return extra.reply(t);
      }

      // ── DICE ───────────────────────────────────────────────────────────────
      if (sub === 'dice') {
        const p = Math.floor(Math.random() * 6) + 1;
        const b = Math.floor(Math.random() * 6) + 1;
        const win    = p > b;
        const draw   = p === b;
        const newBal = draw ? coins : win ? coins + bet : coins - bet;
        setCoins(userId, newBal);

        const DICE = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣'];
        let t = `🎲 *${sc('dice roll')}*\n\n`;
        t += `👤 You: ${DICE[p-1]}  vs  🤖 Bot: ${DICE[b-1]}\n\n`;
        if (draw)   t += `🤝 *Draw!* Bet returned.\n`;
        else if (win) t += `✅ *You win!* +${fmt(bet)} coins\n`;
        else          t += `❌ *Bot wins.* -${fmt(bet)} coins\n`;
        t += `\n💰 Balance: *${fmt(newBal)}* coins\n\n`;
        t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
        return extra.reply(t);
      }

      // ── COIN FLIP ──────────────────────────────────────────────────────────
      if (sub === 'flip') {
        const choice = (args[2] || 'heads').toLowerCase();
        const valid  = ['heads', 'tails', 'h', 't'];
        if (!valid.includes(choice)) {
          return extra.reply(`🪙 Usage: *.casino flip <bet> heads/tails*`);
        }
        const userPick  = choice.startsWith('h') ? 'heads' : 'tails';
        const result    = Math.random() < 0.5 ? 'heads' : 'tails';
        const win       = userPick === result;
        const newBal    = win ? coins + bet : coins - bet;
        setCoins(userId, newBal);

        let t = `🪙 *${sc('coin flip')}*\n\n`;
        t += `Your pick: *${userPick}*\n`;
        t += `Result: *${result}* ${result === 'heads' ? '🟡' : '⚫'}\n\n`;
        t += win ? `✅ *You win!* +${fmt(bet)} coins\n` : `❌ *You lost!* -${fmt(bet)} coins\n`;
        t += `\n💰 Balance: *${fmt(newBal)}* coins\n\n`;
        t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
        return extra.reply(t);
      }

    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};
