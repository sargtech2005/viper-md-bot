/**
 * 🎰 VIPER CASINO — Full Economy + 17 Games
 *
 * ECONOMY:
 *   wallet  — spending money (earned from daily, wins, etc)
 *   bank    — savings (safe, earns no interest but can't be stolen)
 */

const database = require('../../database');
const config   = require('../../config');

// ── Economy constants ─────────────────────────────────────────────────────────
const DAILY_BONUS  = 500;
const START_WALLET = 1000;
const MIN_BET      = 10;
const MAX_BET      = 10000;
const DAILY_MS     = 24 * 60 * 60 * 1000;
const STEAL_CD     = 5  * 60 * 1000;
const ROB_CD       = 10 * 60 * 1000;

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

function fmt(n)  { return Number(n).toLocaleString(); }
function parseBet(raw, wallet) {
  if (!raw) return MIN_BET;
  if (raw === 'all' || raw === 'max') return Math.min(wallet, MAX_BET);
  const n = parseInt(raw, 10);
  return isNaN(n) ? MIN_BET : Math.max(MIN_BET, Math.min(n, MAX_BET));
}
function tag(jid)          { return `@${jid.split('@')[0]}`; }
function onCooldown(uid, act, ms) { const k=`${uid}:${act}`,l=COOLDOWNS.get(k)||0,r=ms-(Date.now()-l); return r>0?r:0; }
function setCooldown(uid, act)    { COOLDOWNS.set(`${uid}:${act}`, Date.now()); }

// ── Send game result: image card + text caption, fall back to text only ───────
async function sendGameResult(sock, msg, extra, opts) {
  // opts: { gameName, win, bet, change, newBalance, resultLine, botName, ppBase64 }
  const { makeGameCard, fetchPpBase64 } = require('../../utils/imageCard');
  const username = extra.pushName || extra.sender.split('@')[0];
  try {
    const ppBase64 = await fetchPpBase64(sock, extra.sender).catch(() => null);
    const imgBuf   = await makeGameCard({ ...opts, username, ppBase64 });
    await sock.sendMessage(extra.from, {
      image:    imgBuf,
      mimetype: 'image/png',
      caption:  opts.caption,
    }, { quoted: msg });
  } catch {
    await extra.reply(opts.caption);
  }
}

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
function newDeck()   { const d=[]; for(const s of SUITS)for(const r of RANKS)d.push(r+s); return d.sort(()=>Math.random()-0.5); }
function cardVal(c)  { const r=c.slice(0,-1); if(r==='A')return 11; const n=parseInt(r,10); return isNaN(n)?10:n; }
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
  aliases: ['gamble','slots','bet','bj'],
  category: 'fun',
  description: '🎰 Casino — wallet, bank, 17 games (.casino menu)',
  usage: '.casino [game/action] [amount]',

  async execute(sock, msg, args, extra) {
    try {
      const userId   = extra.sender.split('@')[0];
      const username = extra.pushName || userId;  // ← real name, not just number
      const sub      = (args[0] || 'menu').toLowerCase();
      const econ     = getEconomy(userId);
      const B        = config.botName;
      const ctx      = msg.message?.extendedTextMessage?.contextInfo || msg.message?.contextInfo || {};
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

      if (!ALL.includes(sub)) return extra.reply(_casinoMenuText());
      if (sub === 'menu')     return extra.reply(_casinoMenuText());

      // ── BALANCE ───────────────────────────────────────────────────────────
      if (sub === 'balance') {
        const u = database.getUser(userId) || {}, debt = u.loanDebt || 0;
        let t  = `┏❐ 《 *💰 YOUR ECONOMY* 》 ❐\n┃\n`;
        t += `┣◆ 👤 *${username}*\n`;
        t += `┣◆ 💵 *Wallet:* ${fmt(econ.wallet)} coins\n`;
        t += `┣◆ 🏦 *Bank:*   ${fmt(econ.bank)} coins\n`;
        t += `┣◆ 💎 *Total:*  ${fmt(econ.wallet + econ.bank)} coins\n`;
        if (debt > 0) t += `┣◆ ⚠️ *Debt:*   ${fmt(debt)} coins (loan)\n`;
        t += `┃\n┣◆ _Deposit coins to keep them safe in the bank_\n`;
        t += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
        return extra.reply(t);
      }

      // ── DEPOSIT ───────────────────────────────────────────────────────────
      if (sub === 'deposit') {
        const raw = args[1];
        if (!raw) return extra.reply(`🏦 Usage: *.casino deposit <amount|all>*\n💵 Wallet: *${fmt(econ.wallet)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        const amt = raw === 'all' ? econ.wallet : Math.max(1, Math.min(parseInt(raw,10)||0, econ.wallet));
        if (amt < 1 || econ.wallet < amt) return extra.reply(`❌ Not enough in wallet!\n💵 Wallet: *${fmt(econ.wallet)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        setWallet(userId, econ.wallet - amt); setBank(userId, econ.bank + amt);
        return extra.reply(`🏦 *Deposit Successful!*\n\n📤 Moved: *${fmt(amt)}* coins\n💵 Wallet: *${fmt(econ.wallet-amt)}*\n🏦 Bank: *${fmt(econ.bank+amt)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
      }

      // ── WITHDRAW ──────────────────────────────────────────────────────────
      if (sub === 'withdraw') {
        const raw = args[1];
        if (!raw) return extra.reply(`💵 Usage: *.casino withdraw <amount|all>*\n🏦 Bank: *${fmt(econ.bank)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        const amt = raw === 'all' ? econ.bank : Math.max(1, Math.min(parseInt(raw,10)||0, econ.bank));
        if (amt < 1 || econ.bank < amt) return extra.reply(`❌ Not enough in bank!\n🏦 Bank: *${fmt(econ.bank)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        setBank(userId, econ.bank - amt); setWallet(userId, econ.wallet + amt);
        return extra.reply(`💵 *Withdrawal Successful!*\n\n📥 Moved: *${fmt(amt)}* coins\n💵 Wallet: *${fmt(econ.wallet+amt)}*\n🏦 Bank: *${fmt(econ.bank-amt)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
      }

      // ── DAILY ─────────────────────────────────────────────────────────────
      if (sub === 'daily') {
        const u = database.getUser(userId)||{}, last=u.lastDaily||0, now=Date.now();
        if (now-last < DAILY_MS) {
          const left=DAILY_MS-(now-last), h=Math.floor(left/3600000), m=Math.floor((left%3600000)/60000);
          return extra.reply(`⏳ *Already claimed!*\nCome back in *${h}h ${m}m*\n💵 Wallet: *${fmt(econ.wallet)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        }
        setWallet(userId, econ.wallet + DAILY_BONUS);
        database.updateUser(userId, { lastDaily: now });
        return extra.reply(`🎁 *Daily Bonus, ${username}!*\n\n+${fmt(DAILY_BONUS)} coins added to wallet!\n💵 Wallet: *${fmt(econ.wallet+DAILY_BONUS)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
      }

      // ── GIFT ──────────────────────────────────────────────────────────────
      if (sub === 'gift') {
        if (!mentions.length||!args[2]) return extra.reply(`🎁 Usage: *.casino gift @user <amount>*\n💵 Wallet: *${fmt(econ.wallet)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        const tJid=mentions[0], tId=tJid.split('@')[0];
        if (tId===userId) return extra.reply(`🤡 Can't gift yourself!\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        const amt=Math.max(10, Math.min(parseInt(args[2],10)||0, econ.wallet));
        if (econ.wallet<amt) return extra.reply(`❌ Not enough in wallet!\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        setWallet(userId, econ.wallet-amt); addWallet(tId, amt);
        return sock.sendMessage(extra.from, { text:`🎁 *Gift Sent!*\n\n*${username}* gave ${tag(tJid)} *${fmt(amt)}* coins!\n💵 Your wallet: *${fmt(econ.wallet-amt)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`, mentions:[tJid] }, { quoted:msg });
      }

      // ── LOAN ──────────────────────────────────────────────────────────────
      if (sub === 'loan') {
        const action=(args[1]||'').toLowerCase();
        if (action==='repay') {
          const u=database.getUser(userId)||{}, debt=u.loanDebt||0;
          if (!debt) return extra.reply(`✅ No outstanding loan!\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
          if (econ.wallet<debt) return extra.reply(`❌ Need *${fmt(debt)}* in wallet to repay.\n💵 Wallet: *${fmt(econ.wallet)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
          const lenderId=u.loanLenderId; setWallet(userId, econ.wallet-debt);
          if (lenderId) addWallet(lenderId, debt);
          database.updateUser(userId, { loanDebt:0, loanDue:null, loanLenderId:null });
          return extra.reply(`✅ *Loan Repaid!*\n💸 Paid: *${fmt(debt)}* coins\n💵 Wallet: *${fmt(econ.wallet-debt)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        }
        if (action==='status') {
          const u=database.getUser(userId)||{}, debt=u.loanDebt||0;
          if (!debt) return extra.reply(`💸 *Loan Status*\n\nNo active loan ✅\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
          const left=(u.loanDue||0)-Date.now(), h=Math.max(0,Math.floor(left/3600000)), m2=Math.max(0,Math.floor((left%3600000)/60000));
          return extra.reply(`💸 *Your Loan*\n\n💰 Debt: *${fmt(debt)}* coins\n⏰ ${left<=0?'⚠️ *OVERDUE!*':`Due in: *${h}h ${m2}m*`}\n\nType *.casino loan repay* to pay back.\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        }
        if (!mentions.length||!args[2]) return extra.reply(`💸 *Loan*\n\n*.casino loan @user <amount>*\n*.casino loan repay*\n*.casino loan status*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        const tJid=mentions[0], tId=tJid.split('@')[0];
        if (tId===userId) return extra.reply(`🤡 Can't loan to yourself!\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        const amt=Math.max(10, Math.min(parseInt(args[2],10)||0, 10000));
        if (econ.wallet<amt) return extra.reply(`❌ Not enough in wallet!\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        const tUser=database.getUser(tId)||{};
        if (tUser.loanDebt>0) return sock.sendMessage(extra.from, { text:`❌ ${tag(tJid)} already has a loan of *${fmt(tUser.loanDebt)}* coins!\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`, mentions:[tJid] }, { quoted:msg });
        const interest=Math.floor(amt*0.1), repayAmt=amt+interest;
        setWallet(userId, econ.wallet-amt); addWallet(tId, amt);
        database.updateUser(tId, { loanDebt:repayAmt, loanDue:Date.now()+DAILY_MS, loanLenderId:userId });
        return sock.sendMessage(extra.from, { text:`💸 *Loan Issued!*\n\n👤 Lender: *${username}*\n👤 Borrower: ${tag(tJid)}\n\n💰 Amount: *${fmt(amt)}* coins\n💹 Interest (10%): +*${fmt(interest)}*\n💳 Must repay: *${fmt(repayAmt)}* coins\n⏰ Due in: *24 hours*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`, mentions:[tJid] }, { quoted:msg });
      }

      // ── BET GAMES ─────────────────────────────────────────────────────────
      const BET_GAMES=['slots','dice','flip','blackjack','bj','roulette','crash','wheel','mine','rob','invest'];
      if (BET_GAMES.includes(sub)) {
        const bet=parseBet(args[1], econ.wallet);
        if (econ.wallet<bet) return extra.reply(`❌ *Not enough in wallet!*\n💵 Wallet: *${fmt(econ.wallet)}* | Need: *${fmt(bet)}*\n\n💡 *.casino withdraw <amount>* to move from bank\n💡 *.casino daily* for free coins\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);

        const afterWin  = (gained) => { setWallet(userId, econ.wallet-bet+gained); return econ.wallet-bet+gained; };
        const afterLoss = ()       => { setWallet(userId, econ.wallet-bet);        return Math.max(0,econ.wallet-bet); };

        // 1. SLOTS
        if (sub==='slots') {
          const r=spin(), m=slotsMulti(r), won=Math.floor(bet*m);
          const nb=m>0?afterWin(won):afterLoss(), win=m>0;
          const lbl=m>=20?'🎊 MEGA JACKPOT!!!':m>=10?'💥 JACKPOT!':m>=5?'🎉 BIG WIN!':m>0?'✅ Win!':'❌ No Match';
          const resultLine = `${r.join('  ')} — ${lbl}`;
          const t = `🎰 *Slot Machine*\n\n╔══════════════╗\n║  ${r.join('  ')}  ║\n╚══════════════╝\n\n*${lbl}*\n${win?`×${m} → +${fmt(won)} coins`:`Lost *${fmt(bet)}* coins`}\n\n💵 Wallet: *${fmt(nb)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
          return sendGameResult(sock, msg, extra, { gameName:'🎰 Slots', win, bet, change:win?won-bet:-bet, newBalance:nb, resultLine, botName:B, caption:t });
        }

        // 2. DICE
        if (sub==='dice') {
          const p=Math.ceil(Math.random()*6), b2=Math.ceil(Math.random()*6);
          const FACE=['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣'];
          const draw=p===b2, win=p>b2;
          const nb=draw?econ.wallet:win?afterWin(bet*2):afterLoss();
          const outcome=draw?'🤝 Draw! Bet returned':win?`✅ You win! +${fmt(bet)} coins`:`❌ Bot wins. -${fmt(bet)} coins`;
          const change=draw?0:win?bet:-bet;
          const resultLine=`You: ${FACE[p-1]}  vs  Bot: ${FACE[b2-1]}`;
          const t=`🎲 *Dice Roll*\n\n👤 You: ${FACE[p-1]}  vs  🤖 Bot: ${FACE[b2-1]}\n\n${outcome}\n\n💵 Wallet: *${fmt(nb)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
          return sendGameResult(sock, msg, extra, { gameName:'🎲 Dice', win:win&&!draw, bet, change, newBalance:nb, resultLine, botName:B, caption:t });
        }

        // 3. FLIP
        if (sub==='flip') {
          const pick=(args[2]||'heads').toLowerCase().startsWith('t')?'tails':'heads';
          const result=Math.random()<0.5?'heads':'tails', win=pick===result;
          const nb=win?afterWin(bet*2):afterLoss();
          const resultLine=`Your pick: ${pick} → Result: ${result} ${result==='heads'?'🟡':'⚫'}`;
          const t=`🪙 *Coin Flip*\n\nYour pick: *${pick}*\nResult: *${result}* ${result==='heads'?'🟡':'⚫'}\n\n${win?`✅ *You win!* +${fmt(bet)} coins`:`❌ *You lost!* -${fmt(bet)} coins`}\n\n💵 Wallet: *${fmt(nb)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
          return sendGameResult(sock, msg, extra, { gameName:'🪙 Coin Flip', win, bet, change:win?bet:-bet, newBalance:nb, resultLine, botName:B, caption:t });
        }

        // 4. BLACKJACK
        if (sub==='blackjack'||sub==='bj') {
          const deck=newDeck(), pH=[deck.pop(),deck.pop()], dH=[deck.pop(),deck.pop()];
          while(handTotal(pH)<17) pH.push(deck.pop());
          dealerPlay(deck,dH);
          const pF=handTotal(pH), dF=handTotal(dH);
          let nb, lbl, win, change;
          if(pF>21)                        { nb=afterLoss();              lbl='💥 Bust! You lose.';         win=false; change=-bet; }
          else if(pF===21&&pH.length===2)  { nb=afterWin(Math.floor(bet*2.5)); lbl='🃏 BLACKJACK! ×1.5!'; win=true; change=Math.floor(bet*1.5); }
          else if(dF>21)                   { nb=afterWin(bet*2);          lbl='✅ Dealer bust! You win!';  win=true; change=bet; }
          else if(pF>dF)                   { nb=afterWin(bet*2);          lbl='✅ You win!';              win=true; change=bet; }
          else if(pF===dF)                 { nb=econ.wallet;              lbl='🤝 Push — bet returned.';  win=false; change=0; }
          else                             { nb=afterLoss();              lbl='❌ Dealer wins.';           win=false; change=-bet; }
          const resultLine=`You: ${pH.join(' ')} (${pF}) | Dealer: ${dH.join(' ')} (${dF})`;
          const t=`🃏 *Blackjack*\n\n👤 You: *${pH.join(' ')}* (${pF})\n🤖 Dealer: *${dH.join(' ')}* (${dF})\n\n${lbl}\n\n💵 Wallet: *${fmt(nb)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
          return sendGameResult(sock, msg, extra, { gameName:'🃏 Blackjack', win, bet, change, newBalance:nb, resultLine, botName:B, caption:t });
        }

        // 5. ROULETTE
        if (sub==='roulette') {
          const choice=(args[2]||'red').toLowerCase(), {num,col}=rouletteResult();
          const colE=col==='red'?'🔴':col==='black'?'⚫':'🟢';
          let multi=0;
          if(choice==='red'&&col==='red')multi=2;
          else if(choice==='black'&&col==='black')multi=2;
          else if(choice==='green'&&col==='green')multi=14;
          else if(!isNaN(parseInt(choice,10))&&parseInt(choice,10)===num)multi=36;
          const win=multi>0, nb=win?afterWin(Math.floor(bet*multi)):afterLoss();
          const netGain=win?Math.floor(bet*multi)-bet:-bet;
          const resultLine=`Ball: ${num} ${colE} ${col.toUpperCase()} | Bet: ${choice}`;
          const t=`🔴⚫ *Roulette*\n\n🎡 Ball: *${num}* ${colE} ${col.toUpperCase()}\nYour bet: *${choice}*\n\n${win?`✅ *Win!* ×${multi} → +${fmt(Math.floor(bet*multi)-bet)} coins`:`❌ *Lose!* -${fmt(bet)} coins`}\n\n💵 Wallet: *${fmt(nb)}*\n_red/black=×2 · green=×14 · exact number=×36_\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
          return sendGameResult(sock, msg, extra, { gameName:'🔴 Roulette', win, bet, change:netGain, newBalance:nb, resultLine, botName:B, caption:t });
        }

        // 6. CRASH
        if (sub==='crash') {
          const cashAt=parseFloat(args[2])||2.0, clamp=Math.max(1.01,Math.min(cashAt,50));
          const point=crashPoint(), win=clamp<=point;
          const gained=Math.floor(bet*clamp), nb=win?afterWin(gained):afterLoss();
          const resultLine=`Target: ×${clamp} | Crashed at: ×${point}`;
          const t=`🚀 *Crash Game*\n\n🎯 Cash-out target: *×${clamp}*\n💥 Crashed at: *×${point}*\n\n${win?`✅ *Cashed out!* +${fmt(gained-bet)} coins`:`❌ *Crashed!* -${fmt(bet)} coins`}\n\n💵 Wallet: *${fmt(nb)}*\n_Usage: .casino crash 500 3.0_\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
          return sendGameResult(sock, msg, extra, { gameName:'🚀 Crash', win, bet, change:win?gained-bet:-bet, newBalance:nb, resultLine, botName:B, caption:t });
        }

        // 7. WHEEL
        if (sub==='wheel') {
          const idx=Math.floor(Math.random()*WHEEL.length), s=WHEEL[idx];
          const won=Math.floor(bet*s.multi), nb=afterWin(won), win=s.multi>1;
          const sectors=WHEEL.map((w,i)=>(i===idx?`▶ *${w.label}* ◀`:w.label)).join('\n');
          const resultLine=`Landed on: ${s.label}`;
          const t=`🎡 *Prize Wheel*\n\n${sectors}\n\n${s.multi>1?`🎉 *${s.label}!* +${fmt(won-bet)} coins`:s.multi>0?`😐 *${s.label}* — got ${fmt(won)} back`:`💀 *BANKRUPT!* Lost ${fmt(bet)} coins`}\n\n💵 Wallet: *${fmt(nb)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
          return sendGameResult(sock, msg, extra, { gameName:'🎡 Wheel', win, bet, change:won-bet, newBalance:nb, resultLine, botName:B, caption:t });
        }

        // 8. MINE
        if (sub==='mine') {
          const pick=parseInt(args[2],10);
          if(isNaN(pick)||pick<1||pick>9) return extra.reply(`💣 *Minesweeper*\n\nPick a safe cell (1-9).\nUsage: *.casino mine <bet> <1-9>*\n_Win ×2.5 if safe · 2 mines in 9 cells_\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
          const grid=buildMineGrid(), hit=grid[pick-1];
          const nb=hit?afterLoss():afterWin(Math.floor(bet*2.5)), win=!hit;
          const reveal=grid.map((m,i)=>m?'💣':(i===pick-1?'✅':'⬜'));
          const rows=[reveal.slice(0,3).join(''),reveal.slice(3,6).join(''),reveal.slice(6,9).join('')];
          const resultLine=`${rows.join(' | ')} — Cell ${pick}: ${hit?'MINE!':'SAFE!'}`;
          const t=`💣 *Minesweeper*\n\n${rows.join('\n')}\nPicked: *Cell ${pick}*\n\n${hit?`💥 *BOOM!* -${fmt(bet)} coins`:`✅ *Safe!* ×2.5 → +${fmt(Math.floor(bet*2.5)-bet)} coins`}\n\n💵 Wallet: *${fmt(nb)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
          return sendGameResult(sock, msg, extra, { gameName:'💣 Minesweeper', win, bet, change:win?Math.floor(bet*2.5)-bet:-bet, newBalance:nb, resultLine, botName:B, caption:t });
        }

        // 9. ROB
        if (sub==='rob') {
          const cd=onCooldown(userId,'rob',ROB_CD);
          if(cd) return extra.reply(`🔫 *Rob cooldown!* Wait *${Math.ceil(cd/60000)} min*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
          setCooldown(userId,'rob');
          const success=Math.random()<0.28, loot=Math.floor(300+Math.random()*1700);
          const nb=success?afterWin(loot+bet):afterLoss(), win=success;
          const resultLine=success?`Vault cracked! Looted ${fmt(loot)} coins!`:'Caught by security!';
          const t=`🔫 *Viper Bank Heist*\n\n${success?`🎉 Vault cracked!\n💰 Looted *${fmt(loot)}* coins!\n✅ *Big score!*`:`🚨 Caught by security!\n❌ *Busted!*`}\n\n💵 Wallet: *${fmt(nb)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
          return sendGameResult(sock, msg, extra, { gameName:'🔫 Rob', win, bet, change:success?loot:-bet, newBalance:nb, resultLine, botName:B, caption:t });
        }

        // 10. INVEST
        if (sub==='invest') {
          const plan=(args[2]||'risky').toLowerCase();
          let lbl, minM, maxM, emoji;
          if(plan==='safe')      { lbl='Safe Fund';    minM=0.9; maxM=1.4; emoji='📊'; }
          else if(plan==='yolo') { lbl='YOLO Mode';    minM=0;   maxM=8;   emoji='🤑'; }
          else                   { lbl='Risky Market'; minM=0.4; maxM=3.0; emoji='💹'; }
          const multi=parseFloat((minM+Math.random()*(maxM-minM)).toFixed(2));
          const returned=Math.floor(bet*multi), profit=returned-bet, nb=afterWin(returned), win=profit>=0;
          const resultLine=`${emoji} ${lbl}: ×${multi} → ${fmt(returned)} coins`;
          const t=`${emoji} *Investment: ${lbl}*\n\n💵 Invested: *${fmt(bet)}* coins\n📉 Return: *×${multi}* → *${fmt(returned)}* coins\n\n${win?`✅ *Profit: +${fmt(profit)} coins*`:`❌ *Loss: ${fmt(Math.abs(profit))} coins*`}\n\n💵 Wallet: *${fmt(nb)}*\n🏦 Bank: *${fmt(econ.bank)}* _(safe from market)_\n_Plans: safe · risky · yolo_\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
          return sendGameResult(sock, msg, extra, { gameName:'📈 Invest', win, bet, change:profit, newBalance:nb, resultLine, botName:B, caption:t });
        }
      }

      // ── STEAL ─────────────────────────────────────────────────────────────
      if (sub==='steal') {
        if (!mentions.length) return extra.reply(`🥷 Usage: *.casino steal @user*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        const tJid=mentions[0], tId=tJid.split('@')[0];
        if(tId===userId) return extra.reply(`🤡 Can't steal from yourself!\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        const cd=onCooldown(userId,'steal',STEAL_CD);
        if(cd) return extra.reply(`⏳ *Steal cooldown!* Wait *${Math.ceil(cd/60000)} min*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        const tEcon=getEconomy(tId);
        if(tEcon.wallet<50) return sock.sendMessage(extra.from, { text:`💸 ${tag(tJid)}'s wallet is empty! Nothing to steal.\n_Their bank is protected 🏦_\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`, mentions:[tJid] }, { quoted:msg });
        setCooldown(userId,'steal');
        const success=Math.random()<0.45, amt=Math.floor(tEcon.wallet*(0.08+Math.random()*0.12));
        if(success) {
          setWallet(userId, econ.wallet+amt); setWallet(tId, tEcon.wallet-amt);
          const resultLine=`Stole ${fmt(amt)} coins from ${tId}`;
          const t=`🥷 *Steal Successful!*\n\n*${username}* stole *${fmt(amt)}* from ${tag(tJid)}'s wallet!\n💵 Your wallet: *${fmt(econ.wallet+amt)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
          try {
            const { makeGameCard, fetchPpBase64 } = require('../../utils/imageCard');
            const ppBase64=await fetchPpBase64(sock, extra.sender).catch(()=>null);
            const imgBuf=await makeGameCard({ gameName:'🥷 Steal', win:true, username, bet:0, change:amt, newBalance:econ.wallet+amt, resultLine, botName:B, ppBase64 });
            await sock.sendMessage(extra.from, { image:imgBuf, mimetype:'image/png', caption:t, mentions:[tJid] }, { quoted:msg });
          } catch { await sock.sendMessage(extra.from, { text:t, mentions:[tJid] }, { quoted:msg }); }
        } else {
          const pen=Math.floor(amt*0.8); setWallet(userId, Math.max(0,econ.wallet-pen)); setWallet(tId, tEcon.wallet+pen);
          const t=`🚨 *Caught!*\n\n${tag(tJid)} caught *${username}*!\n⚖️ Penalty: *-${fmt(pen)}* from your wallet.\n💵 Your wallet: *${fmt(Math.max(0,econ.wallet-pen))}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
          try {
            const { makeGameCard, fetchPpBase64 } = require('../../utils/imageCard');
            const ppBase64=await fetchPpBase64(sock, extra.sender).catch(()=>null);
            const imgBuf=await makeGameCard({ gameName:'🥷 Steal', win:false, username, bet:0, change:-pen, newBalance:Math.max(0,econ.wallet-pen), resultLine:`Caught by ${tId}! Penalty: ${fmt(pen)} coins`, botName:B, ppBase64 });
            await sock.sendMessage(extra.from, { image:imgBuf, mimetype:'image/png', caption:t, mentions:[tJid] }, { quoted:msg });
          } catch { await sock.sendMessage(extra.from, { text:t, mentions:[tJid] }, { quoted:msg }); }
        }
      }

      // ── LOTTERY ───────────────────────────────────────────────────────────
      if (sub==='lottery') {
        const COST=100;
        if(econ.wallet<COST) return extra.reply(`🎟️ *Lottery*\n\nTicket costs *100 coins* from wallet.\n💵 Wallet: *${fmt(econ.wallet)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        const pick=Array.from({length:6},()=>Math.ceil(Math.random()*49)).sort((a,b)=>a-b);
        const draw=Array.from({length:6},()=>Math.ceil(Math.random()*49)).sort((a,b)=>a-b);
        const matches=pick.filter(n=>draw.includes(n)).length;
        let prize=0, result;
        if(matches===6){prize=50000;result='🏆 JACKPOT!!! 6/6!';}
        else if(matches===5){prize=5000;result='🎉 5/6!';}
        else if(matches===4){prize=500;result='✅ 4/6!';}
        else if(matches===3){prize=100;result='😊 3/6';}
        else if(matches===2){prize=50;result='😐 2/6';}
        else{result='❌ No match';}
        const nb=econ.wallet-COST+prize; setWallet(userId, Math.max(0,nb));
        const win=prize>0;
        const resultLine=`Your: ${pick.join('-')} | Draw: ${draw.join('-')} | Matches: ${matches}/6`;
        const t=`🎟️ *Viper Lottery*\n\n🎯 Your: *${pick.join(' · ')}*\n🎰 Draw: *${draw.join(' · ')}*\n✨ Matches: *${matches}/6*\n\n${result}\n${prize>0?`💵 +*${fmt(prize)}* added to wallet!\n`:''}\n💵 Wallet: *${fmt(Math.max(0,nb))}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
        return sendGameResult(sock, msg, extra, { gameName:'🎟️ Lottery', win, bet:COST, change:prize-COST, newBalance:Math.max(0,nb), resultLine, botName:B, caption:t });
      }

      // ── HEIST ─────────────────────────────────────────────────────────────
      if (sub==='heist') {
        const bet=parseBet(args[1], econ.wallet);
        if(econ.wallet<bet) return extra.reply(`❌ Not enough in wallet! Have *${fmt(econ.wallet)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        const roomId=extra.from;
        if(HEIST_ROOMS.has(roomId)) {
          const room=HEIST_ROOMS.get(roomId);
          if(room.members.some(m=>m.id===userId)) return extra.reply(`🔫 Already in this heist!\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
          room.members.push({id:userId, name:username, bet}); room.pot+=bet; setWallet(userId, econ.wallet-bet);
          return extra.reply(`👊 *${username}* joined! Crew: *${room.members.length}* | Pot: *${fmt(room.pot)}* coins\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        }
        setWallet(userId, econ.wallet-bet);
        const room={leader:userId, leaderName:username, members:[{id:userId,name:username,bet}], pot:bet};
        HEIST_ROOMS.set(roomId, room);
        await extra.reply(`🔫 *HEIST STARTED!*\n\n👑 Leader: *${username}*\n💵 Pot: *${fmt(bet)}* coins\n\nType *.casino heist <bet>* to join!\n⏳ Launching in *30 seconds...*\n_More crew = better odds!_\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        setTimeout(async () => {
          HEIST_ROOMS.delete(roomId);
          const members=room.members, success=Math.random()<Math.min(0.25+members.length*0.12,0.85);
          const { makeHeistCard, fetchPpBase64 } = require('../../utils/imageCard');
          const date=new Date().toLocaleDateString('en-US');
          const ppBase64=await fetchPpBase64(sock, extra.sender).catch(()=>null);

          if(success) {
            const lootM=1.5+Math.random()*2, totalLoot=Math.floor(room.pot*lootM);
            let t=`🎉 *HEIST SUCCESSFUL!*\n\n💰 Looted: *${fmt(totalLoot)}* coins (×${lootM.toFixed(2)})\n\n*Crew Shares:*\n`;
            for(const m of members) {
              const share=Math.floor((m.bet/room.pot)*totalLoot);
              addWallet(m.id, share);
              t+=`👤 *${m.name}*: +*${fmt(share)}*\n`;
            }
            t+=`\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
            try {
              const imgBuf=await makeHeistCard({ success:true, userId:room.leaderName, date, amount:totalLoot, crewSize:members.length, botName:B, ppBase64 });
              await sock.sendMessage(roomId, { image:imgBuf, mimetype:'image/png', caption:t });
            } catch { await sock.sendMessage(roomId, { text:t }); }
          } else {
            let t=`🚨 *HEIST FAILED!*\n\nAll bets lost!\n\n*Losses:*\n`;
            for(const m of members) t+=`👤 *${m.name}*: -*${fmt(m.bet)}*\n`;
            t+=`\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
            try {
              const imgBuf=await makeHeistCard({ success:false, userId:room.leaderName, date, amount:room.pot, crewSize:members.length, botName:B, ppBase64 });
              await sock.sendMessage(roomId, { image:imgBuf, mimetype:'image/png', caption:t });
            } catch { await sock.sendMessage(roomId, { text:t }); }
          }
        }, 30000);
      }

    } catch (e) {
      await extra.reply(`❌ Casino error: ${e.message}`);
    }
  }
};
