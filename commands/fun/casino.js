/**
 * 🎰 VIPER CASINO — Full Economy + 17 Games
 *
 * ECONOMY:
 *   wallet  — spending money (earned from daily, wins, etc)
 *   bank    — savings (safe, earns no interest but can't be stolen)
 *
 * BANKING:
 *   .casino balance               — wallet & bank overview
 *   .casino deposit <amt|all>     — wallet → bank
 *   .casino withdraw <amt|all>    — bank → wallet
 *   .casino gift @user <amt>      — send wallet coins to someone
 *   .casino loan @user <amt>      — lend wallet coins (10% interest, 24h)
 *   .casino loan repay            — pay back your debt
 *   .casino loan status           — check your debt
 *
 * GAMES (all use wallet):
 *   slots · dice · flip · blackjack · roulette · crash
 *   wheel · mine · rob · invest · steal · lottery · heist · daily
 */

const database = require('../../database');
const config   = require('../../config');

// ── Economy constants ─────────────────────────────────────────────────────────
const DAILY_BONUS   = 500;
const START_WALLET  = 1000;
const MIN_BET       = 10;
const MAX_BET       = 10000;
const DAILY_MS      = 24 * 60 * 60 * 1000;
const STEAL_CD      = 5  * 60 * 1000;
const ROB_CD        = 10 * 60 * 1000;

const HEIST_ROOMS = new Map();
const COOLDOWNS   = new Map();

// ── Economy helpers ───────────────────────────────────────────────────────────
function getEconomy(id) {
  const u = database.getUser(id) || {};
  return {
    wallet: typeof u.wallet === 'number' ? u.wallet : (typeof u.coins === 'number' ? u.coins : START_WALLET),
    bank:   typeof u.bank   === 'number' ? u.bank   : 0,
  };
}
function setWallet(id, n) { database.updateUser(id, { wallet: Math.max(0, Math.floor(n)) }); }
function setBank(id, n)   { database.updateUser(id, { bank:   Math.max(0, Math.floor(n)) }); }
function addWallet(id, n) { const e = getEconomy(id); setWallet(id, e.wallet + n); }

function fmt(n) { return Number(n).toLocaleString(); }
function parseBet(raw, wallet) {
  if (!raw) return MIN_BET;
  if (raw === 'all' || raw === 'max') return Math.min(wallet, MAX_BET);
  const n = parseInt(raw, 10);
  return isNaN(n) ? MIN_BET : Math.max(MIN_BET, Math.min(n, MAX_BET));
}
function tag(jid) { return `@${jid.split('@')[0]}`; }
function onCooldown(uid, act, ms) { const k=`${uid}:${act}`,l=COOLDOWNS.get(k)||0,r=ms-(Date.now()-l); return r>0?r:0; }
function setCooldown(uid, act) { COOLDOWNS.set(`${uid}:${act}`, Date.now()); }

// ── Slots ─────────────────────────────────────────────────────────────────────
const REELS = ['🍒','🍋','🍊','🍇','⭐','💎','7️⃣','🎰'];
function spin() { return [0,1,2].map(() => REELS[Math.floor(Math.random()*REELS.length)]); }
function slotsMulti([a,b,c]) {
  if (a===b&&b===c) { if(a==='💎')return 50; if(a==='7️⃣')return 20; if(a==='⭐')return 10; return 5; }
  if (a===b||b===c||a===c) return 1.5;
  return 0;
}

// ── Blackjack ─────────────────────────────────────────────────────────────────
const SUITS=['♠','♥','♦','♣'], RANKS=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
function newDeck() { const d=[]; for(const s of SUITS)for(const r of RANKS)d.push(r+s); return d.sort(()=>Math.random()-0.5); }
function cardVal(c) { const r=c.slice(0,-1); if(r==='A')return 11; const n=parseInt(r,10); return isNaN(n)?10:n; }
function handTotal(hand) { let t=hand.reduce((s,c)=>s+cardVal(c),0),a=hand.filter(c=>c.startsWith('A')).length; while(t>21&&a-->0)t-=10; return t; }
function dealerPlay(deck,hand) { while(handTotal(hand)<17)hand.push(deck.pop()); return hand; }

// ── Roulette ──────────────────────────────────────────────────────────────────
const RED_NUMS=[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
function rouletteResult() { const num=Math.floor(Math.random()*37),col=num===0?'green':RED_NUMS.includes(num)?'red':'black'; return{num,col}; }

// ── Wheel ─────────────────────────────────────────────────────────────────────
const WHEEL=[{label:'💀 BANKRUPT',multi:0},{label:'🎉 2×',multi:2},{label:'😐 0.5×',multi:0.5},{label:'🔥 3×',multi:3},{label:'💸 Lose',multi:0},{label:'✅ 1.5×',multi:1.5},{label:'🚀 5×',multi:5},{label:'🎁 1×',multi:1}];

// ── Mine ──────────────────────────────────────────────────────────────────────
function buildMineGrid() { const c=[false,false,false,false,false,false,false,false,false]; let p=0; while(p<2){const i=Math.floor(Math.random()*9);if(!c[i]){c[i]=true;p++;}} return c; }

// ── Crash ─────────────────────────────────────────────────────────────────────
function crashPoint() { const r=Math.random(); if(r<0.05)return 1.0; return parseFloat(Math.max(1,99/(100*Math.random())).toFixed(2)); }

module.exports = {
  name: 'casino',
  aliases: ['gamble', 'slots', 'bet', 'bj'],
  category: 'fun',
  description: '🎰 Casino — wallet, bank, 17 games (.casino menu)',
  usage: '.casino [game/action] [amount]',

  async execute(sock, msg, args, extra) {
    try {
      const userId  = extra.sender.split('@')[0];
      const sub     = (args[0] || 'menu').toLowerCase();
      const econ    = getEconomy(userId);
      const B       = config.botName;
      const ctx     = msg.message?.extendedTextMessage?.contextInfo || msg.message?.contextInfo || {};
      const mentions = ctx.mentionedJid || [];

      // ── MENU ──────────────────────────────────────────────────────────────
      const ALL = ['menu','balance','deposit','withdraw','gift','loan','daily','slots','dice','flip',
                   'blackjack','bj','roulette','crash','wheel','mine','rob','invest','steal','lottery','heist'];
      const _casinoMenuText = () =>
        `┏❐ 《 *🎰 VIPER CASINO* 》 ❐\n┃\n` +
        `┣◆ 💵 *Wallet:* ${fmt(econ.wallet)} coins\n┃\n` +
        `┣◆ 📊 *ECONOMY*\n` +
        `┣◆ 💳 *.casino balance*\n` +
        `┣◆ 🏦 *.casino deposit <amount|all>*\n` +
        `┣◆ 💵 *.casino withdraw <amount|all>*\n` +
        `┣◆ 🎁 *.casino daily* (+${fmt(500)} coins)\n` +
        `┣◆ 🎁 *.casino gift @user <amount>*\n` +
        `┣◆ 💸 *.casino loan @user <amount>*\n┃\n` +
        `┣◆ 🎮 *GAMES*\n` +
        `┣◆ 🎰 *.casino slots <bet>*\n` +
        `┣◆ 🎲 *.casino dice <bet>*\n` +
        `┣◆ 🪙 *.casino flip <bet> heads/tails*\n` +
        `┣◆ 🃏 *.casino blackjack <bet>*\n` +
        `┣◆ 🔴 *.casino roulette <bet> red/black/0-36*\n` +
        `┣◆ 🚀 *.casino crash <bet> <1.5-50>*\n` +
        `┣◆ 🎡 *.casino wheel <bet>*\n` +
        `┣◆ 💣 *.casino mine <bet> <1-9>*\n` +
        `┣◆ 🥷 *.casino steal @user*\n` +
        `┣◆ 🔫 *.casino rob <bet>*\n` +
        `┣◆ 📈 *.casino invest <bet> safe/risky/yolo*\n` +
        `┣◆ 🎟️ *.casino lottery* (100 coins/ticket)\n` +
        `┣◆ 👥 *.casino heist <bet>* (group game)\n┃\n` +
        `┣◆ ⚠️ _Virtual coins only — no real money_\n` +
        `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;

      if (!ALL.includes(sub)) {
        // Unknown sub — show full casino menu
        return extra.reply(_casinoMenuText());
      }

      // ── MENU (explicit .casino menu) ─────────────────────────────────────
      if (sub === 'menu') {
        return extra.reply(_casinoMenuText());
      }

      // ── BALANCE ───────────────────────────────────────────────────────────
      if (sub === 'balance') {
        const u   = database.getUser(userId) || {};
        const debt = u.loanDebt || 0;
        let t  = `┏❐ 《 *💰 YOUR ECONOMY* 》 ❐\n┃\n`;
        t += `┣◆ 💵 *Wallet:* ${fmt(econ.wallet)} coins\n`;
        t += `┣◆ 🏦 *Bank:*   ${fmt(econ.bank)} coins\n`;
        t += `┣◆ 💎 *Total:*  ${fmt(econ.wallet + econ.bank)} coins\n`;
        if (debt > 0) t += `┣◆ ⚠️ *Debt:*   ${fmt(debt)} coins (loan)\n`;
        t += `┃\n┣◆ _Deposit coins to keep them safe in the bank_\n`;
        t += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
        return extra.reply(t);
      }

      // ── DEPOSIT (wallet → bank) ────────────────────────────────────────────
      if (sub === 'deposit') {
        const raw = args[1];
        if (!raw) return extra.reply(`🏦 Usage: *.casino deposit <amount|all>*\n💵 Wallet: *${fmt(econ.wallet)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        const amt = raw === 'all' ? econ.wallet : Math.max(1, Math.min(parseInt(raw, 10) || 0, econ.wallet));
        if (amt < 1 || econ.wallet < amt) return extra.reply(`❌ Not enough in wallet!\n💵 Wallet: *${fmt(econ.wallet)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        setWallet(userId, econ.wallet - amt);
        setBank(userId, econ.bank + amt);
        return extra.reply(`🏦 *Deposit Successful!*\n\n📤 Moved: *${fmt(amt)}* coins\n💵 Wallet: *${fmt(econ.wallet - amt)}*\n🏦 Bank:   *${fmt(econ.bank + amt)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
      }

      // ── WITHDRAW (bank → wallet) ───────────────────────────────────────────
      if (sub === 'withdraw') {
        const raw = args[1];
        if (!raw) return extra.reply(`💵 Usage: *.casino withdraw <amount|all>*\n🏦 Bank: *${fmt(econ.bank)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        const amt = raw === 'all' ? econ.bank : Math.max(1, Math.min(parseInt(raw, 10) || 0, econ.bank));
        if (amt < 1 || econ.bank < amt) return extra.reply(`❌ Not enough in bank!\n🏦 Bank: *${fmt(econ.bank)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        setBank(userId, econ.bank - amt);
        setWallet(userId, econ.wallet + amt);
        return extra.reply(`💵 *Withdrawal Successful!*\n\n📥 Moved: *${fmt(amt)}* coins\n💵 Wallet: *${fmt(econ.wallet + amt)}*\n🏦 Bank:   *${fmt(econ.bank - amt)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
      }

      // ── DAILY ─────────────────────────────────────────────────────────────
      if (sub === 'daily') {
        const u = database.getUser(userId) || {}, last = u.lastDaily || 0, now = Date.now();
        if (now - last < DAILY_MS) {
          const left = DAILY_MS - (now - last), h = Math.floor(left/3600000), m = Math.floor((left%3600000)/60000);
          return extra.reply(`⏳ *Already claimed!*\nCome back in *${h}h ${m}m*\n💵 Wallet: *${fmt(econ.wallet)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        }
        setWallet(userId, econ.wallet + DAILY_BONUS);
        database.updateUser(userId, { lastDaily: now });
        return extra.reply(`🎁 *Daily Bonus!*\n\n+${fmt(DAILY_BONUS)} coins added to wallet!\n💵 Wallet: *${fmt(econ.wallet + DAILY_BONUS)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
      }

      // ── GIFT ──────────────────────────────────────────────────────────────
      if (sub === 'gift') {
        if (!mentions.length || !args[2]) return extra.reply(`🎁 Usage: *.casino gift @user <amount>*\n💵 Wallet: *${fmt(econ.wallet)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        const tJid = mentions[0], tId = tJid.split('@')[0];
        if (tId === userId) return extra.reply(`🤡 Can't gift yourself!\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        const amt = Math.max(10, Math.min(parseInt(args[2], 10) || 0, econ.wallet));
        if (econ.wallet < amt) return extra.reply(`❌ Not enough in wallet!\n💵 Wallet: *${fmt(econ.wallet)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        setWallet(userId, econ.wallet - amt);
        addWallet(tId, amt);
        return sock.sendMessage(extra.from, { text: `🎁 *Gift Sent!*\n\nYou gave ${tag(tJid)} *${fmt(amt)}* coins!\n💵 Your wallet: *${fmt(econ.wallet - amt)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`, mentions: [tJid] }, { quoted: msg });
      }

      // ── LOAN ──────────────────────────────────────────────────────────────
      if (sub === 'loan') {
        const action = (args[1] || '').toLowerCase();

        if (action === 'repay') {
          const u = database.getUser(userId) || {}, debt = u.loanDebt || 0;
          if (!debt) return extra.reply(`✅ No outstanding loan!\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
          if (econ.wallet < debt) return extra.reply(`❌ Need *${fmt(debt)}* in wallet to repay.\n💵 Wallet: *${fmt(econ.wallet)}*\n\nWithdraw from bank if needed!\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
          const lenderId = u.loanLenderId;
          setWallet(userId, econ.wallet - debt);
          if (lenderId) addWallet(lenderId, debt);
          database.updateUser(userId, { loanDebt: 0, loanDue: null, loanLenderId: null });
          return extra.reply(`✅ *Loan Repaid!*\n💸 Paid: *${fmt(debt)}* coins\n💵 Wallet: *${fmt(econ.wallet - debt)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        }

        if (action === 'status') {
          const u = database.getUser(userId) || {}, debt = u.loanDebt || 0;
          if (!debt) return extra.reply(`💸 *Loan Status*\n\nNo active loan ✅\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
          const left = (u.loanDue || 0) - Date.now(), h = Math.max(0, Math.floor(left/3600000)), m2 = Math.max(0, Math.floor((left%3600000)/60000));
          const overdue = left <= 0;
          return extra.reply(`💸 *Your Loan*\n\n💰 Debt: *${fmt(debt)}* coins\n⏰ ${overdue ? '⚠️ *OVERDUE!*' : `Due in: *${h}h ${m2}m*`}\n\nType *.casino loan repay* to pay back.\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        }

        // Give loan
        if (!mentions.length || !args[2]) return extra.reply(`💸 *Loan*\n\n*.casino loan @user <amount>*\n*.casino loan repay*\n*.casino loan status*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        const tJid = mentions[0], tId = tJid.split('@')[0];
        if (tId === userId) return extra.reply(`🤡 Can't loan to yourself!\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        const amt = Math.max(10, Math.min(parseInt(args[2], 10) || 0, 10000));
        if (econ.wallet < amt) return extra.reply(`❌ Not enough in wallet!\n💵 Wallet: *${fmt(econ.wallet)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        const tUser = database.getUser(tId) || {};
        if (tUser.loanDebt > 0) return sock.sendMessage(extra.from, { text: `❌ ${tag(tJid)} already has a loan of *${fmt(tUser.loanDebt)}* coins!\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`, mentions: [tJid] }, { quoted: msg });
        const interest = Math.floor(amt * 0.1), repayAmt = amt + interest;
        setWallet(userId, econ.wallet - amt);
        addWallet(tId, amt);
        database.updateUser(tId, { loanDebt: repayAmt, loanDue: Date.now() + DAILY_MS, loanLenderId: userId });
        return sock.sendMessage(extra.from, { text: `💸 *Loan Issued!*\n\n👤 Lender: *${userId}*\n👤 Borrower: ${tag(tJid)}\n\n💰 Amount: *${fmt(amt)}* coins\n💹 Interest (10%): +*${fmt(interest)}*\n💳 Must repay: *${fmt(repayAmt)}* coins\n⏰ Due in: *24 hours*\n\nType *.casino loan repay* to pay back.\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`, mentions: [tJid] }, { quoted: msg });
      }

      // ── BET-BASED GAMES (all deduct from wallet) ───────────────────────────
      const BET_GAMES = ['slots','dice','flip','blackjack','bj','roulette','crash','wheel','mine','rob','invest'];
      if (BET_GAMES.includes(sub)) {
        const bet = parseBet(args[1], econ.wallet);
        if (econ.wallet < bet) return extra.reply(`❌ *Not enough in wallet!*\n💵 Wallet: *${fmt(econ.wallet)}* | Need: *${fmt(bet)}*\n\n💡 *.casino withdraw <amount>* to move from bank\n💡 *.casino daily* for free coins\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);

        const win_wallet  = (gained) => { setWallet(userId, econ.wallet - bet + gained); return econ.wallet - bet + gained; };
        const lose_wallet = ()       => { setWallet(userId, econ.wallet - bet); return Math.max(0, econ.wallet - bet); };

        // 1. SLOTS
        if (sub === 'slots') {
          const r=spin(), m=slotsMulti(r), won=Math.floor(bet*m);
          const nb = m > 0 ? win_wallet(won) : lose_wallet();
          const lbl = m>=20?'🎊 *MEGA JACKPOT!!!*':m>=10?'💥 *JACKPOT!*':m>=5?'🎉 *BIG WIN!*':m>0?'✅ *Win!*':'❌ *No Match*';
          let t = `🎰 *Slot Machine*\n\n╔══════════════╗\n║  ${r.join('  ')}  ║\n╚══════════════╝\n\n${lbl}\n`;
          t += m>0 ? `💥 ×${m} → +${fmt(won)} coins\n` : `You lost *${fmt(bet)}* coins\n`;
          t += `\n💵 Wallet: *${fmt(nb)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
          return extra.reply(t);
        }

        // 2. DICE
        if (sub === 'dice') {
          const p=Math.ceil(Math.random()*6), b2=Math.ceil(Math.random()*6);
          const FACE=['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣'];
          const draw=p===b2, win=p>b2;
          const nb = draw ? econ.wallet : win ? win_wallet(bet*2) : lose_wallet();
          let t = `🎲 *Dice Roll*\n\n👤 You: ${FACE[p-1]}  vs  🤖 Bot: ${FACE[b2-1]}\n\n`;
          t += draw?`🤝 *Draw!* Bet returned.`:win?`✅ *You win!* +${fmt(bet)} coins`:`❌ *Bot wins.* -${fmt(bet)} coins`;
          t += `\n\n💵 Wallet: *${fmt(nb)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
          return extra.reply(t);
        }

        // 3. FLIP
        if (sub === 'flip') {
          const pick=(args[2]||'heads').toLowerCase().startsWith('t')?'tails':'heads';
          const result=Math.random()<0.5?'heads':'tails', win=pick===result;
          const nb = win ? win_wallet(bet*2) : lose_wallet();
          let t = `🪙 *Coin Flip*\n\nYour pick: *${pick}*\nResult: *${result}* ${result==='heads'?'🟡':'⚫'}\n\n`;
          t += win?`✅ *You win!* +${fmt(bet)} coins`:`❌ *You lost!* -${fmt(bet)} coins`;
          t += `\n\n💵 Wallet: *${fmt(nb)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
          return extra.reply(t);
        }

        // 4. BLACKJACK
        if (sub === 'blackjack' || sub === 'bj') {
          const deck=newDeck(), pH=[deck.pop(),deck.pop()], dH=[deck.pop(),deck.pop()];
          while(handTotal(pH)<17) pH.push(deck.pop());
          dealerPlay(deck, dH);
          const pF=handTotal(pH), dF=handTotal(dH);
          let nb, lbl;
          if(pF>21)            { nb=lose_wallet();        lbl=`💥 *Bust!* You lose.`; }
          else if(pF===21&&pH.length===2) { nb=win_wallet(Math.floor(bet*2.5)); lbl=`🃏 *BLACKJACK!* ×1.5 payout!`; }
          else if(dF>21)       { nb=win_wallet(bet*2);   lbl=`✅ *Dealer bust! You win!*`; }
          else if(pF>dF)       { nb=win_wallet(bet*2);   lbl=`✅ *You win!*`; }
          else if(pF===dF)     { nb=econ.wallet;         lbl=`🤝 *Push — bet returned.*`; }
          else                 { nb=lose_wallet();        lbl=`❌ *Dealer wins.*`; }
          return extra.reply(`🃏 *Blackjack*\n\n👤 You: *${pH.join(' ')}* (${pF})\n🤖 Dealer: *${dH.join(' ')}* (${dF})\n\n${lbl}\n\n💵 Wallet: *${fmt(nb)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        }

        // 5. ROULETTE
        if (sub === 'roulette') {
          const choice=(args[2]||'red').toLowerCase(), {num,col}=rouletteResult();
          const colE=col==='red'?'🔴':col==='black'?'⚫':'🟢';
          let multi=0;
          if(choice==='red'&&col==='red')multi=2;
          else if(choice==='black'&&col==='black')multi=2;
          else if(choice==='green'&&col==='green')multi=14;
          else if(!isNaN(parseInt(choice,10))&&parseInt(choice,10)===num)multi=36;
          const win=multi>0, nb=win?win_wallet(Math.floor(bet*multi)):lose_wallet();
          let t=`🔴⚫ *Roulette*\n\n🎡 Ball: *${num}* ${colE} ${col.toUpperCase()}\nYour bet: *${choice}*\n\n`;
          t+=win?`✅ *Win!* ×${multi} → +${fmt(Math.floor(bet*multi)-bet)} coins`:`❌ *Lose!* -${fmt(bet)} coins`;
          t+=`\n\n💵 Wallet: *${fmt(nb)}*\n_red/black=×2 · green=×14 · exact number=×36_\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
          return extra.reply(t);
        }

        // 6. CRASH
        if (sub === 'crash') {
          const cashAt=parseFloat(args[2])||2.0, clamp=Math.max(1.01,Math.min(cashAt,50));
          const point=crashPoint(), win=clamp<=point;
          const nb=win?win_wallet(Math.floor(bet*clamp)):lose_wallet();
          let t=`🚀 *Crash Game*\n\n🎯 Cash-out target: *×${clamp}*\n💥 Crashed at: *×${point}*\n\n`;
          t+=win?`✅ *Cashed out!* +${fmt(Math.floor(bet*clamp)-bet)} coins`:`❌ *Crashed!* -${fmt(bet)} coins`;
          t+=`\n\n💵 Wallet: *${fmt(nb)}*\n_Usage: .casino crash 500 3.0_\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
          return extra.reply(t);
        }

        // 7. WHEEL
        if (sub === 'wheel') {
          const idx=Math.floor(Math.random()*WHEEL.length), s=WHEEL[idx];
          const won=Math.floor(bet*s.multi), nb=win_wallet(won);
          const sectors=WHEEL.map((w,i)=>(i===idx?`▶ *${w.label}* ◀`:w.label)).join('\n');
          let t=`🎡 *Prize Wheel*\n\n${sectors}\n\n`;
          t+=s.multi>1?`🎉 *${s.label}!* +${fmt(won-bet)} coins`:s.multi>0?`😐 *${s.label}* — got ${fmt(won)} back`:`💀 *BANKRUPT!* Lost ${fmt(bet)} coins`;
          t+=`\n\n💵 Wallet: *${fmt(nb)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
          return extra.reply(t);
        }

        // 8. MINE
        if (sub === 'mine') {
          const pick=parseInt(args[2],10);
          if(isNaN(pick)||pick<1||pick>9) return extra.reply(`💣 *Minesweeper*\n\nPick a safe cell (1-9) on the 3×3 grid.\nUsage: *.casino mine <bet> <1-9>*\n_Win ×2.5 if safe · 2 mines in 9 cells_\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
          const grid=buildMineGrid(), hit=grid[pick-1];
          const nb=hit?lose_wallet():win_wallet(Math.floor(bet*2.5));
          const reveal=grid.map((m,i)=>m?'💣':(i===pick-1?'✅':'⬜'));
          const rows=[reveal.slice(0,3).join(''),reveal.slice(3,6).join(''),reveal.slice(6,9).join('')];
          let t=`💣 *Minesweeper*\n\n${rows.join('\n')}\nPicked: *Cell ${pick}*\n\n`;
          t+=hit?`💥 *BOOM!* -${fmt(bet)} coins`:`✅ *Safe!* ×2.5 → +${fmt(Math.floor(bet*2.5)-bet)} coins`;
          t+=`\n\n💵 Wallet: *${fmt(nb)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
          return extra.reply(t);
        }

        // 9. ROB
        if (sub === 'rob') {
          const cd=onCooldown(userId,'rob',ROB_CD);
          if(cd) return extra.reply(`🔫 *Rob cooldown!* Wait *${Math.ceil(cd/60000)} min*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
          setCooldown(userId,'rob');
          const success=Math.random()<0.28, loot=Math.floor(300+Math.random()*1700), fine=Math.floor(bet*1.5);
          const nb=success?win_wallet(loot+bet):lose_wallet();
          let t=`🔫 *Viper Bank Heist*\n\n`;
          t+=success?`🎉 Vault cracked!\n💰 Looted *${fmt(loot)}* coins!\n✅ *Big score!*`:`🚨 Caught by security!\n💸 Fine: *-${fmt(fine)}* coins\n❌ *Busted!*`;
          t+=`\n\n💵 Wallet: *${fmt(nb)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
          return extra.reply(t);
        }

        // 10. INVEST
        if (sub === 'invest') {
          const plan=(args[2]||'risky').toLowerCase();
          let lbl, minM, maxM, emoji;
          if(plan==='safe')      { lbl='🏦 Safe Fund';    minM=0.9; maxM=1.4; emoji='📊'; }
          else if(plan==='yolo') { lbl='🎯 YOLO Mode';    minM=0;   maxM=8;   emoji='🤑'; }
          else                   { lbl='📈 Risky Market'; minM=0.4; maxM=3.0; emoji='💹'; }
          const multi=parseFloat((minM+Math.random()*(maxM-minM)).toFixed(2));
          const returned=Math.floor(bet*multi), profit=returned-bet;
          const nb=win_wallet(returned);
          let t=`${emoji} *Investment: ${lbl}*\n\n`;
          t+=`💵 Invested from wallet: *${fmt(bet)}*\n`;
          t+=`📉 Market return: *×${multi}* → *${fmt(returned)}* coins\n\n`;
          t+=profit>=0?`✅ *Profit: +${fmt(profit)} coins*`:`❌ *Loss: ${fmt(Math.abs(profit))} coins*`;
          t+=`\n\n💵 Wallet: *${fmt(nb)}*\n`;
          t+=`🏦 Bank: *${fmt(econ.bank)}* _(safe from market)_\n`;
          t+=`\n_Plans: safe · risky · yolo_\n`;
          t+=`_Tip: *.casino deposit* profits to keep them safe!_\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
          return extra.reply(t);
        }
      }

      // ── STEAL ─────────────────────────────────────────────────────────────
      if (sub === 'steal') {
        if (!mentions.length) return extra.reply(`🥷 Usage: *.casino steal @user*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        const tJid=mentions[0], tId=tJid.split('@')[0];
        if(tId===userId) return extra.reply(`🤡 Can't steal from yourself!\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        const cd=onCooldown(userId,'steal',STEAL_CD);
        if(cd) return extra.reply(`⏳ *Steal cooldown!* Wait *${Math.ceil(cd/60000)} min*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        const tEcon=getEconomy(tId);
        if(tEcon.wallet<50) return sock.sendMessage(extra.from, { text: `💸 ${tag(tJid)}'s wallet is empty! Nothing to steal.\n_Their bank is protected 🏦_\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`, mentions:[tJid] }, { quoted:msg });
        setCooldown(userId,'steal');
        const success=Math.random()<0.45, amt=Math.floor(tEcon.wallet*(0.08+Math.random()*0.12));
        if(success) {
          setWallet(userId, econ.wallet+amt); setWallet(tId, tEcon.wallet-amt);
          return sock.sendMessage(extra.from, { text:`🥷 *Steal Successful!*\n\nStole *${fmt(amt)}* from ${tag(tJid)}'s wallet!\n💵 Your wallet: *${fmt(econ.wallet+amt)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`, mentions:[tJid] }, { quoted:msg });
        } else {
          const pen=Math.floor(amt*0.8); setWallet(userId, Math.max(0,econ.wallet-pen)); setWallet(tId, tEcon.wallet+pen);
          return sock.sendMessage(extra.from, { text:`🚨 *Caught!*\n\n${tag(tJid)} caught you!\n⚖️ Penalty: *-${fmt(pen)}* from your wallet.\n💵 Your wallet: *${fmt(Math.max(0,econ.wallet-pen))}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`, mentions:[tJid] }, { quoted:msg });
        }
      }

      // ── LOTTERY ───────────────────────────────────────────────────────────
      if (sub === 'lottery') {
        const COST=100;
        if(econ.wallet<COST) return extra.reply(`🎟️ *Lottery*\n\nTicket costs *100 coins* from wallet.\n💵 Wallet: *${fmt(econ.wallet)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        const pick=Array.from({length:6},()=>Math.ceil(Math.random()*49)).sort((a,b)=>a-b);
        const draw=Array.from({length:6},()=>Math.ceil(Math.random()*49)).sort((a,b)=>a-b);
        const matches=pick.filter(n=>draw.includes(n)).length;
        let prize=0, result;
        if(matches===6){prize=50000;result='🏆 *JACKPOT!!!* 6/6!';}
        else if(matches===5){prize=5000;result='🎉 *5/6!*';}
        else if(matches===4){prize=500;result='✅ *4/6!*';}
        else if(matches===3){prize=100;result='😊 *3/6*';}
        else if(matches===2){prize=50;result='😐 *2/6*';}
        else{result='❌ No match';}
        const nb=econ.wallet-COST+prize; setWallet(userId, Math.max(0,nb));
        let t=`🎟️ *Viper Lottery*\n\n🎯 Your: *${pick.join(' · ')}*\n🎰 Draw: *${draw.join(' · ')}*\n✨ Matches: *${matches}/6*\n\n${result}\n`;
        if(prize>0) t+=`💵 +*${fmt(prize)}* added to wallet!\n`;
        t+=`\n💵 Wallet: *${fmt(Math.max(0,nb))}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
        return extra.reply(t);
      }

      // ── HEIST ─────────────────────────────────────────────────────────────
      if (sub === 'heist') {
        const bet=parseBet(args[1], econ.wallet);
        if(econ.wallet<bet) return extra.reply(`❌ Not enough in wallet! Have *${fmt(econ.wallet)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        const roomId=extra.from;
        if(HEIST_ROOMS.has(roomId)) {
          const room=HEIST_ROOMS.get(roomId);
          if(room.members.some(m=>m.id===userId)) return extra.reply(`🔫 Already in this heist!\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
          room.members.push({id:userId,bet}); room.pot+=bet; setWallet(userId, econ.wallet-bet);
          return extra.reply(`👊 *${userId}* joined! Crew: *${room.members.length}* | Pot: *${fmt(room.pot)}* coins\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        }
        setWallet(userId, econ.wallet-bet);
        const room={leader:userId, members:[{id:userId,bet}], pot:bet};
        HEIST_ROOMS.set(roomId, room);
        await extra.reply(`🔫 *HEIST STARTED!*\n\n👑 Leader: *${userId}*\n💵 Pot: *${fmt(bet)}* coins\n\nType *.casino heist <bet>* to join!\n⏳ Launching in *30 seconds...*\n_More crew = better odds!_\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        setTimeout(async () => {
          HEIST_ROOMS.delete(roomId);
          const members=room.members, success=Math.random()<Math.min(0.25+members.length*0.12,0.85);
          if(success) {
            const lootM=1.5+Math.random()*2, totalLoot=Math.floor(room.pot*lootM);
            let t=`🎉 *HEIST SUCCESSFUL!*\n\n💰 Looted: *${fmt(totalLoot)}* coins (×${lootM.toFixed(2)})\n\n*Crew Shares (paid to wallet):*\n`;
            for(const m of members) { const share=Math.floor((m.bet/room.pot)*totalLoot); addWallet(m.id, share); t+=`👤 ${m.id}: +*${fmt(share)}*\n`; }
            t+=`\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
            await sock.sendMessage(roomId, { text: t });
          } else {
            let t=`🚨 *HEIST FAILED!*\n\nAll bets lost from wallets!\n\n*Losses:*\n`;
            for(const m of members) t+=`👤 ${m.id}: -${fmt(m.bet)}\n`;
            t+=`\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
            await sock.sendMessage(roomId, { text: t });
          }
        }, 30000);
      }

    } catch (e) {
      await extra.reply(`❌ Casino error: ${e.message}`);
    }
  }
};
