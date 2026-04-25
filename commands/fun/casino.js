/**
 * 🎰 VIPER CASINO — 15 Games
 * slots · dice · flip · blackjack · roulette · crash
 * wheel · mine · steal · rob · invest · lottery · heist · daily · balance
 */
const database = require('../../database');
const config   = require('../../config');

const DAILY_BONUS = 500;
const START_COINS = 1000;
const MIN_BET     = 10;
const MAX_BET     = 5000;
const DAILY_MS    = 24 * 60 * 60 * 1000;
const STEAL_CD    = 5  * 60 * 1000;
const ROB_CD      = 10 * 60 * 1000;

const HEIST_ROOMS = new Map();
const COOLDOWNS   = new Map();

function getCoins(id) { const u=database.getUser(id)||{}; return typeof u.coins==='number'?u.coins:START_COINS; }
function setCoins(id,n){ database.updateUser(id,{coins:Math.max(0,Math.floor(n))}); }
function fmt(n){ return Number(n).toLocaleString(); }
function onCooldown(uid,act,ms){ const k=`${uid}:${act}`,l=COOLDOWNS.get(k)||0,r=ms-(Date.now()-l); return r>0?r:0; }
function setCooldown(uid,act){ COOLDOWNS.set(`${uid}:${act}`,Date.now()); }
function parseBet(raw,coins){ if(!raw)return MIN_BET; if(raw==='all'||raw==='max')return Math.min(coins,MAX_BET); const n=parseInt(raw,10); return isNaN(n)?MIN_BET:Math.max(MIN_BET,Math.min(n,MAX_BET)); }
function tag(jid){ return `@${jid.split('@')[0]}`; }

// Slots
const REELS=['🍒','🍋','🍊','🍇','⭐','💎','7️⃣','🎰'];
function spin(){ return [0,1,2].map(()=>REELS[Math.floor(Math.random()*REELS.length)]); }
function slotsMulti([a,b,c]){ if(a===b&&b===c){if(a==='💎')return 50;if(a==='7️⃣')return 20;if(a==='⭐')return 10;return 5;} if(a===b||b===c||a===c)return 1.5; return 0; }

// Blackjack
const SUITS=['♠','♥','♦','♣'],RANKS=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
function newDeck(){ const d=[]; for(const s of SUITS)for(const r of RANKS)d.push(r+s); return d.sort(()=>Math.random()-0.5); }
function cardVal(c){ const r=c.slice(0,-1); if(r==='A')return 11; const n=parseInt(r,10); return isNaN(n)?10:n; }
function handTotal(hand){ let t=hand.reduce((s,c)=>s+cardVal(c),0),a=hand.filter(c=>c.startsWith('A')).length; while(t>21&&a-->0)t-=10; return t; }
function dealerPlay(deck,hand){ while(handTotal(hand)<17)hand.push(deck.pop()); return hand; }

// Roulette
const RED_NUMS=[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
function rouletteResult(){ const num=Math.floor(Math.random()*37),col=num===0?'green':RED_NUMS.includes(num)?'red':'black'; return{num,col}; }

// Wheel
const WHEEL=[{label:'💀 BANKRUPT',multi:0},{label:'🎉 2×',multi:2},{label:'😐 0.5×',multi:0.5},{label:'🔥 3×',multi:3},{label:'💸 Lose',multi:0},{label:'✅ 1.5×',multi:1.5},{label:'🚀 5×',multi:5},{label:'🎁 1×',multi:1}];

// Mine
function buildMineGrid(mines=2){ const c=[false,false,false,false,false,false,false,false,false]; let p=0; while(p<mines){const i=Math.floor(Math.random()*9);if(!c[i]){c[i]=true;p++;}} return c; }

// Crash
function crashPoint(){ const r=Math.random(); if(r<0.05)return 1.0; return parseFloat(Math.max(1,99/(100*Math.random())).toFixed(2)); }

module.exports = {
  name:'casino',
  aliases:['gamble','slots','bet','bj','roulette','crash','wheel','mine','steal','rob','invest','lottery','heist','loan','gift'],
  category:'fun',
  description:'🎰 17 virtual casino games',
  usage:'.casino [game] [bet]',

  async execute(sock,msg,args,extra){
    try{
      const userId=extra.sender.split('@')[0];
      const sub=(args[0]||'menu').toLowerCase();
      const coins=getCoins(userId);
      const B=config.botName;

      const GAMES=['slots','dice','flip','blackjack','bj','roulette','crash','wheel','mine','rob','invest','steal','lottery','heist','loan','gift','daily','balance'];
      if(!GAMES.includes(sub)){
        let t=`┏❐ 《 *🎰 VIPER CASINO* 》 ❐\n┃\n`;
        t+=`┣◆ 💰 *Balance:* ${fmt(coins)} coins\n┃\n`;
        t+=`┣◆ 🎰 *.casino slots <bet>*\n`;
        t+=`┣◆ 🎲 *.casino dice <bet>*\n`;
        t+=`┣◆ 🪙 *.casino flip <bet> heads/tails*\n`;
        t+=`┣◆ 🃏 *.casino blackjack <bet>*\n`;
        t+=`┣◆ 🔴 *.casino roulette <bet> red/black/0-36*\n`;
        t+=`┣◆ 🚀 *.casino crash <bet> <1.5-50>*\n`;
        t+=`┣◆ 🎡 *.casino wheel <bet>*\n`;
        t+=`┣◆ 💣 *.casino mine <bet> <1-9>*\n`;
        t+=`┣◆ 🥷 *.casino steal @user*\n`;
        t+=`┣◆ 🔫 *.casino rob <bet>*\n`;
        t+=`┣◆ 📈 *.casino invest <bet> safe/risky/yolo*\n`;
        t+=`┣◆ 🎟️ *.casino lottery* (100 coins/ticket)\n`;
        t+=`┣◆ 👥 *.casino heist <bet>* (group game)\n`;
        t+=`┣◆ 💸 *.casino loan @user <amount>* (repay within 24h)\n`;
        t+=`┣◆ 🎁 *.casino gift @user <amount>*\n`;
        t+=`┣◆ 🎁 *.casino daily*\n`;
        t+=`┣◆ 💳 *.casino balance*\n`;
        t+=`┃\n┣◆ ⚠️ _Virtual coins only — no real money_\n`;
        t+=`┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
        return extra.reply(t);
      }

      // BALANCE
      if(sub==='balance') return extra.reply(`💰 *Balance*\n\n🪙 *${fmt(coins)}* virtual coins\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);

      // DAILY
      if(sub==='daily'){
        const u=database.getUser(userId)||{},last=u.lastDaily||0,now=Date.now();
        if(now-last<DAILY_MS){ const left=DAILY_MS-(now-last),h=Math.floor(left/3600000),m=Math.floor((left%3600000)/60000); return extra.reply(`⏳ *Already claimed!*\nCome back in *${h}h ${m}m*\n💰 Balance: *${fmt(coins)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`); }
        const nb=coins+DAILY_BONUS; setCoins(userId,nb); database.updateUser(userId,{lastDaily:now});
        return extra.reply(`🎁 *Daily Bonus!*\n\n+${fmt(DAILY_BONUS)} coins!\n💰 New balance: *${fmt(nb)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
      }

      // BET-BASED GAMES
      const BET_GAMES=['slots','dice','flip','blackjack','bj','roulette','crash','wheel','mine','rob','invest'];
      if(BET_GAMES.includes(sub)){
        const bet=parseBet(args[1],coins);
        if(coins<bet) return extra.reply(`❌ *Not enough coins!*\n💰 Have: *${fmt(coins)}* | Need: *${fmt(bet)}*\nTry *.casino daily*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);

        // 1. SLOTS
        if(sub==='slots'){
          const r=spin(),m=slotsMulti(r),won=Math.floor(bet*m),nb=m>0?coins-bet+won:coins-bet;
          setCoins(userId,nb);
          const lbl=m>=20?'🎊 *MEGA JACKPOT!!!*':m>=10?'💥 *JACKPOT!*':m>=5?'🎉 *BIG WIN!*':m>0?'✅ *Win!*':'❌ *No Match*';
          let t=`🎰 *Slot Machine*\n\n╔══════════════╗\n║  ${r.join('  ')}  ║\n╚══════════════╝\n\n${lbl}\n`;
          t+=m>0?`💥 ×${m} → +${fmt(won)} coins\n`:`You lost *${fmt(bet)}* coins\n`;
          t+=`\n💰 Balance: *${fmt(nb)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
          return extra.reply(t);
        }

        // 2. DICE
        if(sub==='dice'){
          const p=Math.ceil(Math.random()*6),b2=Math.ceil(Math.random()*6);
          const FACE=['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣'];
          const win=p>b2,draw=p===b2,nb=draw?coins:win?coins+bet:coins-bet;
          setCoins(userId,nb);
          let t=`🎲 *Dice Roll*\n\n👤 You: ${FACE[p-1]}  vs  🤖 Bot: ${FACE[b2-1]}\n\n`;
          t+=draw?`🤝 *Draw!* Bet returned.`:win?`✅ *You win!* +${fmt(bet)} coins`:`❌ *Bot wins.* -${fmt(bet)} coins`;
          t+=`\n\n💰 Balance: *${fmt(nb)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
          return extra.reply(t);
        }

        // 3. COIN FLIP
        if(sub==='flip'){
          const pick=(args[2]||'heads').toLowerCase().startsWith('t')?'tails':'heads';
          const result=Math.random()<0.5?'heads':'tails',win=pick===result,nb=win?coins+bet:coins-bet;
          setCoins(userId,nb);
          let t=`🪙 *Coin Flip*\n\nYour pick: *${pick}*\nResult: *${result}* ${result==='heads'?'🟡':'⚫'}\n\n`;
          t+=win?`✅ *You win!* +${fmt(bet)} coins`:`❌ *You lost!* -${fmt(bet)} coins`;
          t+=`\n\n💰 Balance: *${fmt(nb)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
          return extra.reply(t);
        }

        // 4. BLACKJACK
        if(sub==='blackjack'||sub==='bj'){
          const deck=newDeck(),pH=[deck.pop(),deck.pop()],dH=[deck.pop(),deck.pop()];
          while(handTotal(pH)<17) pH.push(deck.pop());
          dealerPlay(deck,dH);
          const pF=handTotal(pH),dF=handTotal(dH);
          const bust=pF>21,bj21=pF===21&&pH.length===2;
          let nb,lbl;
          if(bust){nb=coins-bet;lbl=`💥 *Bust!* You lose.`;}
          else if(bj21){nb=coins+Math.floor(bet*1.5);lbl=`🃏 *BLACKJACK!* ×1.5 payout!`;}
          else if(dF>21){nb=coins+bet;lbl=`✅ *Dealer bust! You win!*`;}
          else if(pF>dF){nb=coins+bet;lbl=`✅ *You win!*`;}
          else if(pF===dF){nb=coins;lbl=`🤝 *Push — bet returned.*`;}
          else{nb=coins-bet;lbl=`❌ *Dealer wins.*`;}
          setCoins(userId,nb);
          let t=`🃏 *Blackjack*\n\n👤 You: *${pH.join(' ')}* (${pF})\n🤖 Dealer: *${dH.join(' ')}* (${dF})\n\n${lbl}\n\n💰 Balance: *${fmt(nb)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
          return extra.reply(t);
        }

        // 5. ROULETTE
        if(sub==='roulette'){
          const choice=(args[2]||'red').toLowerCase(),{num,col}=rouletteResult();
          const colE=col==='red'?'🔴':col==='black'?'⚫':'🟢';
          let multi=0;
          if(choice==='red'&&col==='red')multi=2;
          else if(choice==='black'&&col==='black')multi=2;
          else if(choice==='green'&&col==='green')multi=14;
          else if(!isNaN(parseInt(choice,10))&&parseInt(choice,10)===num)multi=36;
          const win=multi>0,nb=win?coins-bet+Math.floor(bet*multi):coins-bet;
          setCoins(userId,nb);
          let t=`🔴⚫ *Roulette*\n\n🎡 Ball: *${num}* ${colE} ${col.toUpperCase()}\nYour bet: *${choice}*\n\n`;
          t+=win?`✅ *Win!* ×${multi} → +${fmt(Math.floor(bet*multi)-bet)} coins`:`❌ *Lose!* -${fmt(bet)} coins`;
          t+=`\n\n💰 Balance: *${fmt(nb)}*\n_Tip: red/black=×2 · green=×14 · exact number=×36_\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
          return extra.reply(t);
        }

        // 6. CRASH
        if(sub==='crash'){
          const cashAt=parseFloat(args[2])||2.0,clamp=Math.max(1.01,Math.min(cashAt,50));
          const point=crashPoint(),win=clamp<=point,nb=win?coins-bet+Math.floor(bet*clamp):coins-bet;
          setCoins(userId,nb);
          let t=`🚀 *Crash Game*\n\n🎯 Your cash-out: *×${clamp}*\n💥 Crashed at:   *×${point}*\n\n`;
          t+=win?`✅ *Cashed out!* +${fmt(Math.floor(bet*clamp)-bet)} coins`:`❌ *Crashed before target!* -${fmt(bet)} coins`;
          t+=`\n\n💰 Balance: *${fmt(nb)}*\n_Usage: .casino crash 200 3.5 (bet 200, cash at ×3.5)_\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
          return extra.reply(t);
        }

        // 7. WHEEL
        if(sub==='wheel'){
          const idx=Math.floor(Math.random()*WHEEL.length),s=WHEEL[idx];
          const won=Math.floor(bet*s.multi),nb=coins-bet+won;
          setCoins(userId,nb);
          const sectors=WHEEL.map((w,i)=>(i===idx?`▶ *${w.label}* ◀`:w.label)).join('\n');
          let t=`🎡 *Prize Wheel*\n\n${sectors}\n\n`;
          t+=s.multi>1?`🎉 *${s.label}!* +${fmt(won-bet)} coins`:s.multi>0?`😐 *${s.label}* — got ${fmt(won)} back`:`💀 *BANKRUPT!* Lost ${fmt(bet)} coins`;
          t+=`\n\n💰 Balance: *${fmt(Math.max(0,nb))}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
          return extra.reply(t);
        }

        // 8. MINE
        if(sub==='mine'){
          const pick=parseInt(args[2],10);
          if(isNaN(pick)||pick<1||pick>9) return extra.reply(`💣 *Minesweeper*\n\nPick a safe cell (1-9) on the 3×3 grid.\nUsage: *.casino mine <bet> <1-9>*\n\n_2 mines hidden in 9 cells. Win ×2.5_\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
          const grid=buildMineGrid(2),hit=grid[pick-1];
          const nb=hit?coins-bet:coins+Math.floor(bet*2.5);
          setCoins(userId,nb);
          const reveal=grid.map((m,i)=>m?'💣':(i===pick-1?'✅':'⬜'));
          const rows=[reveal.slice(0,3).join(''),reveal.slice(3,6).join(''),reveal.slice(6,9).join('')];
          let t=`💣 *Minesweeper*\n\n${rows.join('\n')}\nPicked: *Cell ${pick}*\n\n`;
          t+=hit?`💥 *BOOM! Mine hit!* -${fmt(bet)} coins`:`✅ *Safe!* ×2.5 → +${fmt(Math.floor(bet*2.5)-bet)} coins`;
          t+=`\n\n💰 Balance: *${fmt(Math.max(0,nb))}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
          return extra.reply(t);
        }

        // 9. ROB
        if(sub==='rob'){
          const cd=onCooldown(userId,'rob',ROB_CD);
          if(cd) return extra.reply(`🔫 *Rob cooldown!*\nWait *${Math.ceil(cd/60000)} min*.\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
          setCooldown(userId,'rob');
          const success=Math.random()<0.28,loot=Math.floor(300+Math.random()*1700),fine=Math.floor(bet*1.5);
          const nb=success?coins+loot:Math.max(0,coins-fine);
          setCoins(userId,nb);
          let t=`🔫 *Viper Bank Heist*\n\n`;
          t+=success?`🎉 Vault cracked!\n💰 Looted *${fmt(loot)}* coins!\n\n✅ *Big score!*`:`🚨 Caught by security!\n💸 Fine: *-${fmt(fine)}* coins\n\n❌ *Busted!*`;
          t+=`\n\n💰 Balance: *${fmt(nb)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
          return extra.reply(t);
        }

        // 10. INVEST
        if(sub==='invest'){
          const plan=(args[2]||'risky').toLowerCase();
          let lbl,minM,maxM,emoji;
          if(plan==='safe'){lbl='🏦 Safe Fund';minM=0.9;maxM=1.4;emoji='📊';}
          else if(plan==='yolo'){lbl='🎯 YOLO Mode';minM=0;maxM=8;emoji='🤑';}
          else{lbl='📈 Risky Market';minM=0.4;maxM=3.0;emoji='💹';}
          const multi=parseFloat((minM+Math.random()*(maxM-minM)).toFixed(2));
          const won=Math.floor(bet*multi),profit=won-bet,nb=Math.max(0,coins-bet+won);
          setCoins(userId,nb);
          let t=`${emoji} *Investment: ${lbl}*\n\n💰 Invested: *${fmt(bet)}*\n📉 Return: *×${multi}* → *${fmt(won)}* coins\n\n`;
          t+=profit>=0?`✅ *Profit: +${fmt(profit)} coins*`:`❌ *Loss: ${fmt(profit)} coins*`;
          t+=`\n\n💰 Balance: *${fmt(nb)}*\n_Plans: safe · risky · yolo_\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
          return extra.reply(t);
        }
      }

      // 11. STEAL
      if(sub==='steal'){
        const ctx=msg.message?.extendedTextMessage?.contextInfo||msg.message?.contextInfo||{};
        const mentions=ctx.mentionedJid||[];
        if(!mentions.length) return extra.reply(`🥷 *Steal*\n\nMention someone to steal from!\nUsage: *.casino steal @user*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        const tJid=mentions[0],tId=tJid.split('@')[0];
        if(tId===userId) return extra.reply(`🤡 Can't steal from yourself!\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        const cd=onCooldown(userId,'steal',STEAL_CD);
        if(cd) return extra.reply(`⏳ *Steal cooldown!* Wait *${Math.ceil(cd/60000)} min*.\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        const tCoins=getCoins(tId);
        if(tCoins<50) return sock.sendMessage(extra.from,{text:`💸 ${tag(tJid)} is broke! Nothing to steal.\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`,mentions:[tJid]},{quoted:msg});
        setCooldown(userId,'steal');
        const success=Math.random()<0.45,amt=Math.floor(tCoins*(0.08+Math.random()*0.12));
        if(success){
          setCoins(userId,coins+amt); setCoins(tId,tCoins-amt);
          let t=`🥷 *Steal Successful!*\n\nYou sneaked into ${tag(tJid)}'s wallet!\n💰 Stole: *${fmt(amt)}* coins\n\n🏠 Your balance: *${fmt(coins+amt)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
          return sock.sendMessage(extra.from,{text:t,mentions:[tJid]},{quoted:msg});
        }else{
          const pen=Math.floor(amt*0.8); setCoins(userId,Math.max(0,coins-pen)); setCoins(tId,tCoins+pen);
          let t=`🚨 *Caught Red-Handed!*\n\n${tag(tJid)} caught you stealing!\n⚖️ Penalty: *-${fmt(pen)}* paid to them.\n\n💰 Balance: *${fmt(Math.max(0,coins-pen))}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
          return sock.sendMessage(extra.from,{text:t,mentions:[tJid]},{quoted:msg});
        }
      }

      // 12. LOTTERY
      if(sub==='lottery'){
        const COST=100;
        if(coins<COST) return extra.reply(`🎟️ *Lottery*\n\nTicket costs *100 coins*.\nYou have: *${fmt(coins)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        const pick=Array.from({length:6},()=>Math.ceil(Math.random()*49)).sort((a,b)=>a-b);
        const draw=Array.from({length:6},()=>Math.ceil(Math.random()*49)).sort((a,b)=>a-b);
        const matches=pick.filter(n=>draw.includes(n)).length;
        let prize=0,result;
        if(matches===6){prize=50000;result='🏆 *JACKPOT!!!* 6/6 matched!';}
        else if(matches===5){prize=5000;result='🎉 *Incredible!* 5/6 matched!';}
        else if(matches===4){prize=500;result='✅ *Nice!* 4/6 matched!';}
        else if(matches===3){prize=100;result='😊 3/6 — got your money back!';}
        else if(matches===2){prize=50;result='😐 2/6 matched.';}
        else{result='❌ No matches. Better luck!';}
        const nb=Math.max(0,coins-COST+prize); setCoins(userId,nb);
        let t=`🎟️ *Viper Lottery*\n\n🎯 Your numbers: *${pick.join(' · ')}*\n🎰 Draw:        *${draw.join(' · ')}*\n✨ Matches: *${matches}/6*\n\n${result}\n`;
        if(prize>0)t+=`💵 Prize: +*${fmt(prize)}* coins\n`;
        t+=`\n💰 Balance: *${fmt(nb)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
        return extra.reply(t);
      }

      // 13. HEIST (group game)
      if(sub==='heist'){
        const bet=parseBet(args[1],coins);
        if(coins<bet) return extra.reply(`❌ Not enough coins! You have *${fmt(coins)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        const roomId=extra.from;
        if(HEIST_ROOMS.has(roomId)){
          const room=HEIST_ROOMS.get(roomId);
          if(room.members.some(m=>m.id===userId)) return extra.reply(`🔫 Already in this heist!\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
          room.members.push({id:userId,bet}); room.pot+=bet; setCoins(userId,coins-bet);
          return extra.reply(`👊 *${userId}* joined! Crew: *${room.members.length}* | Pot: *${fmt(room.pot)}* coins\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        }
        setCoins(userId,coins-bet);
        const room={leader:userId,members:[{id:userId,bet}],pot:bet};
        HEIST_ROOMS.set(roomId,room);
        await extra.reply(`🔫 *HEIST STARTED!*\n\n👑 Leader: *${userId}*\n💰 Pot: *${fmt(bet)}* coins\n\nType *.casino heist <bet>* to join!\n⏳ Launching in *30 seconds...*\n_More crew = better odds!_\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        setTimeout(async()=>{
          HEIST_ROOMS.delete(roomId);
          const members=room.members,success=Math.random()<Math.min(0.25+members.length*0.12,0.85);
          if(success){
            const lootM=1.5+Math.random()*2,totalLoot=Math.floor(room.pot*lootM);
            let t=`🎉 *HEIST SUCCESSFUL!*\n\n💰 Looted: *${fmt(totalLoot)}* coins (×${lootM.toFixed(2)})\n\n*Crew Shares:*\n`;
            for(const m of members){ const share=Math.floor((m.bet/room.pot)*totalLoot); setCoins(m.id,getCoins(m.id)+share); t+=`👤 ${m.id}: +*${fmt(share)}*\n`; }
            t+=`\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
            await sock.sendMessage(roomId,{text:t});
          }else{
            let t=`🚨 *HEIST FAILED! Police ambush!*\n\nAll bets lost!\n\n*Losses:*\n`;
            for(const m of members) t+=`👤 ${m.id}: -${fmt(m.bet)}\n`;
            t+=`\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
            await sock.sendMessage(roomId,{text:t});
          }
        },30000);
      }

      // 14. GIFT
      if(sub==='gift'){
        const ctx=msg.message?.extendedTextMessage?.contextInfo||msg.message?.contextInfo||{};
        const mentions=ctx.mentionedJid||[];
        if(!mentions.length||!args[2]) return extra.reply(`🎁 *Gift*\n\nUsage: *.casino gift @user <amount>*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        const tJid=mentions[0],tId=tJid.split('@')[0];
        if(tId===userId) return extra.reply(`🤡 Can't gift yourself!\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        const amount=Math.max(10,Math.min(parseInt(args[2],10)||0,MAX_BET));
        if(isNaN(amount)||amount<10) return extra.reply(`❌ Minimum gift is *10 coins*.\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        if(coins<amount) return extra.reply(`❌ Not enough coins! You have *${fmt(coins)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        setCoins(userId,coins-amount);
        setCoins(tId,getCoins(tId)+amount);
        let t=`🎁 *Gift Sent!*\n\n💰 You gave ${tag(tJid)} *${fmt(amount)}* coins!\n\n💳 Your balance: *${fmt(coins-amount)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
        return sock.sendMessage(extra.from,{text:t,mentions:[tJid]},{quoted:msg});
      }

      // 15. LOAN
      if(sub==='loan'){
        const ctx=msg.message?.extendedTextMessage?.contextInfo||msg.message?.contextInfo||{};
        const mentions=ctx.mentionedJid||[];

        // Check if repaying: .casino loan repay
        if((args[1]||'').toLowerCase()==='repay'){
          const u=database.getUser(userId)||{};
          const debt=u.loanDebt||0;
          if(!debt) return extra.reply(`✅ You have no outstanding loan!\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
          if(coins<debt) return extra.reply(`❌ You need *${fmt(debt)}* coins to repay but only have *${fmt(coins)}*\nKeep earning!\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
          const lenderJid=u.loanLender;
          const lenderId=lenderJid?lenderJid.split('@')[0]:null;
          setCoins(userId,coins-debt);
          if(lenderId) setCoins(lenderId,getCoins(lenderId)+debt);
          database.updateUser(userId,{loanDebt:0,loanDue:null,loanLender:null});
          let t=`✅ *Loan Repaid!*\n\n💸 Paid back *${fmt(debt)}* coins`;
          if(lenderJid) t+=` to ${tag(lenderJid)}`;
          t+=`\n\n💰 Balance: *${fmt(coins-debt)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
          const m=lenderJid?[lenderJid]:[];
          return sock.sendMessage(extra.from,{text:t,mentions:m},{quoted:msg});
        }

        // Check loan status
        if((args[1]||'').toLowerCase()==='status'||(!mentions.length&&!args[2])){
          const u=database.getUser(userId)||{};
          const debt=u.loanDebt||0;
          if(!debt) return extra.reply(`💸 *Loan Status*\n\nNo active loan.\n\nUsage:\n*.casino loan @user <amount>* — lend to someone\n*.casino loan repay* — repay your debt\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
          const due=new Date(u.loanDue||Date.now()),now=Date.now();
          const timeLeft=u.loanDue-now;
          const h=Math.max(0,Math.floor(timeLeft/3600000)),m2=Math.max(0,Math.floor((timeLeft%3600000)/60000));
          const overdue=timeLeft<=0;
          let t=`💸 *Your Loan*\n\n💰 Debt: *${fmt(debt)}* coins\n⏰ ${overdue?`⚠️ *OVERDUE!*`:`Due in: *${h}h ${m2}m*`}\n\nType *.casino loan repay* to pay back.\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
          return extra.reply(t);
        }

        // Give loan: .casino loan @user <amount>
        if(!mentions.length||!args[2]) return extra.reply(`💸 *Loan*\n\nUsage: *.casino loan @user <amount>*\nOr: *.casino loan repay*\nOr: *.casino loan status*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        const tJid=mentions[0],tId=tJid.split('@')[0];
        if(tId===userId) return extra.reply(`🤡 Can't loan to yourself!\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        const amount=Math.max(10,Math.min(parseInt(args[2],10)||0,10000));
        if(coins<amount) return extra.reply(`❌ Not enough coins! You have *${fmt(coins)}*\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`);
        // Check if target already has a debt
        const tUser=database.getUser(tId)||{};
        if(tUser.loanDebt&&tUser.loanDebt>0) return sock.sendMessage(extra.from,{text:`❌ ${tag(tJid)} already has an unpaid loan of *${fmt(tUser.loanDebt)}* coins!\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`,mentions:[tJid]},{quoted:msg});
        // Interest: 10% due in 24h
        const interest=Math.floor(amount*0.1);
        const repayAmt=amount+interest;
        const dueDate=Date.now()+(24*60*60*1000);
        setCoins(userId,coins-amount);
        setCoins(tId,getCoins(tId)+amount);
        database.updateUser(tId,{loanDebt:repayAmt,loanDue:dueDate,loanLender:tJid.replace(tId,userId)});
        let t=`💸 *Loan Issued!*\n\n👤 Lender: *${userId}*\n👤 Borrower: ${tag(tJid)}\n\n💰 Amount: *${fmt(amount)}* coins\n💹 Interest (10%): *+${fmt(interest)}*\n💳 Must repay: *${fmt(repayAmt)}* coins\n⏰ Due in: *24 hours*\n\nBorrower: type *.casino loan repay* to pay back.\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
        return sock.sendMessage(extra.from,{text:t,mentions:[tJid]},{quoted:msg});
      }


    }catch(e){ await extra.reply(`❌ Casino error: ${e.message}`); }
  }
};
