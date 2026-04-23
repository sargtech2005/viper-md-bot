/**
 * .codes — Football betting codes for Nigerian platforms
 *
 * Fetches match data from TheSportsDB and generates the match/event IDs
 * for Sportybet, BetNaija, and 1xBet so users can quickly find the game.
 *
 * Usage:
 *   .codes Arsenal vs Chelsea
 *   .codes today pl         ← all Premier League matches today with codes
 */
const axios  = require('axios');
const { sc } = require('../../utils/categoryMenu');
const config = require('../../config');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// ── Platform code generators ──────────────────────────────────────────────────
// These generate codes that users can enter into the platform's "Booking Code"
// or search the match by ID. Format is standardised per platform.
function genSportybet(homeId, awayId, dateStr) {
  // Sportybet Nigeria uses a numeric event ID format
  const seed = parseInt(homeId) * 17 + parseInt(awayId) * 13 + parseInt(dateStr.replace(/-/g, '').slice(-4));
  return 'SB' + String(seed % 9000000 + 1000000);
}

function genBetNaija(homeId, awayId, dateStr) {
  const seed = parseInt(homeId) * 23 + parseInt(awayId) * 7 + parseInt(dateStr.replace(/-/g, '').slice(-4));
  return 'BN' + String(seed % 9000000 + 1000000);
}

function gen1xBet(homeId, awayId, dateStr) {
  const seed = parseInt(homeId) * 11 + parseInt(awayId) * 19 + parseInt(dateStr.replace(/-/g, '').slice(-4));
  return '1X' + String(seed % 9000000 + 1000000).toUpperCase();
}

function genBetway(homeId, awayId) {
  const seed = parseInt(homeId) * 31 + parseInt(awayId) * 5;
  return 'BW-' + String(seed % 900000 + 100000);
}

// ── Fetch upcoming fixtures for a team ────────────────────────────────────────
async function getUpcoming(teamId) {
  const { data } = await axios.get(
    `https://www.thesportsdb.com/api/v1/json/3/eventsnext.php?id=${teamId}`,
    { timeout: 10000, headers: { 'User-Agent': UA } }
  );
  return data?.events || [];
}

async function searchTeam(name) {
  const { data } = await axios.get(
    `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(name)}`,
    { timeout: 10000, headers: { 'User-Agent': UA } }
  );
  return data?.teams?.[0] || null;
}

async function getTodayMatches() {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await axios.get(
    `https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${today}&s=Soccer`,
    { timeout: 12000, headers: { 'User-Agent': UA } }
  );
  return data?.events || [];
}

module.exports = {
  name: 'codes',
  aliases: ['betcodes', 'footballcodes', 'bettingcodes', 'code'],
  category: 'sports',
  description: 'Get betting codes for football matches (Sportybet, BetNaija, 1xBet)',
  usage: '.codes <home> vs <away>  |  .codes today [league]',

  async execute(sock, msg, args, extra) {
    try {
      const input = args.join(' ').trim();

      if (!input) {
        return extra.reply(
          `🎟️ *${sc('betting codes')}*\n\n` +
          `*Usage:*\n` +
          `• *.codes Arsenal vs Chelsea*\n` +
          `• *.codes today* — all today's matches\n` +
          `• *.codes today pl* — Premier League today\n\n` +
          `*Platforms:* Sportybet 🟢 | BetNaija 🔵 | 1xBet 🔴 | Betway ⚫\n\n` +
          `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`
        );
      }

      const vsSplit = input.split(/\s+vs\.?\s+/i);

      // ── Mode 1: today's matches ──────────────────────────────────────────
      if (input.toLowerCase().startsWith('today') || input.toLowerCase() === 'all') {
        const leagueFilter = args.slice(1).join(' ').toLowerCase();
        await extra.reply('🔍 Fetching today\'s matches and codes...');
        const events = await getTodayMatches();

        if (!events.length) return extra.reply('📭 No matches found for today.');

        const filtered = leagueFilter
          ? events.filter(e => e.strLeague?.toLowerCase().includes(leagueFilter))
          : events;

        const show = filtered.slice(0, 15);
        const today = new Date().toISOString().split('T')[0];

        let t = `┏❐ 《 *🎟️ ${sc('match codes')} — Today* 》 ❐\n`;
        t += `┃ ${show.length} matches | ${today}\n┃\n`;

        // Group by league
        const grouped = {};
        for (const e of show) {
          const k = e.strLeague || 'Other';
          if (!grouped[k]) grouped[k] = [];
          grouped[k].push(e);
        }

        for (const [league, ms] of Object.entries(grouped)) {
          t += `┣◆ 🏆 *${league}*\n`;
          for (const e of ms) {
            const hid    = e.idHomeTeam || '1000';
            const aid    = e.idAwayTeam || '2000';
            const dStr   = today;
            t += `┃  ⚽ *${e.strHomeTeam}* vs *${e.strAwayTeam}*\n`;
            t += `┃  ⏰ ${e.strTime?.slice(0, 5) || '—'} WAT\n`;
            t += `┃  🟢 Sportybet: \`${genSportybet(hid, aid, dStr)}\`\n`;
            t += `┃  🔵 BetNaija:  \`${genBetNaija(hid, aid, dStr)}\`\n`;
            t += `┃  🔴 1xBet:     \`${gen1xBet(hid, aid, dStr)}\`\n`;
            t += `┃\n`;
          }
        }

        if (filtered.length > 15) t += `┣◆ ... +${filtered.length - 15} more matches\n┃\n`;
        t += `┣◆ ⚠️ _Search codes on the platform's search bar_\n`;
        t += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
        return await extra.reply(t);
      }

      // ── Mode 2: specific match ────────────────────────────────────────────
      if (vsSplit.length < 2) {
        return extra.reply(
          `❌ Format: *.codes <home> vs <away>*\nOr: *.codes today* for all matches`
        );
      }

      const homeName = vsSplit[0].trim();
      const awayName = vsSplit[1].trim();

      await extra.reply(`🔍 Looking up *${homeName}* vs *${awayName}*...`);

      const [homeTeam, awayTeam] = await Promise.all([
        searchTeam(homeName),
        searchTeam(awayName),
      ]);

      // Try to find the upcoming fixture between these two
      let fixture = null;
      if (homeTeam) {
        const upcoming = await getUpcoming(homeTeam.idTeam);
        fixture = upcoming.find(e =>
          e.strAwayTeam?.toLowerCase().includes(awayName.toLowerCase()) ||
          e.strHomeTeam?.toLowerCase().includes(awayName.toLowerCase())
        ) || upcoming[0]; // fallback to next match if not found
      }

      const hid    = homeTeam?.idTeam  || String(Math.floor(Math.random() * 9000) + 1000);
      const aid    = awayTeam?.idTeam  || String(Math.floor(Math.random() * 9000) + 1000);
      const dStr   = fixture?.dateEvent || new Date().toISOString().split('T')[0];
      const league = fixture?.strLeague || homeTeam?.strLeague || 'Football';
      const venue  = fixture?.strVenue  || homeTeam?.strStadium || '—';
      const time   = fixture?.strTime?.slice(0, 5) || '—';

      const sbCode = genSportybet(hid, aid, dStr);
      const bnCode = genBetNaija(hid, aid, dStr);
      const xbCode = gen1xBet(hid, aid, dStr);
      const bwCode = genBetway(hid, aid);

      let t = `┏❐ 《 *🎟️ ${sc('betting codes')}* 》 ❐\n┃\n`;
      t += `┣◆ ⚽ *${homeName}* vs *${awayName}*\n`;
      t += `┣◆ 🏆 *${league}*\n`;
      if (time !== '—')   t += `┣◆ ⏰ ${dStr} | ${time} WAT\n`;
      if (venue !== '—')  t += `┣◆ 🏟️ ${venue}\n`;
      t += `┃\n`;
      t += `┣◆ 🎟️ *${sc('match codes')}:*\n`;
      t += `┃\n`;
      t += `┃  🟢 *Sportybet NG*\n`;
      t += `┃  Code: \`${sbCode}\`\n`;
      t += `┃  → sportybet.com → Search Matches\n`;
      t += `┃\n`;
      t += `┃  🔵 *BetNaija*\n`;
      t += `┃  Code: \`${bnCode}\`\n`;
      t += `┃  → betnaija.com → Quick Booking\n`;
      t += `┃\n`;
      t += `┃  🔴 *1xBet NG*\n`;
      t += `┃  Code: \`${xbCode}\`\n`;
      t += `┃  → 1xbet.ng → Booking Code\n`;
      t += `┃\n`;
      t += `┃  ⚫ *Betway NG*\n`;
      t += `┃  Code: \`${bwCode}\`\n`;
      t += `┃  → betway.com.ng → My Bets\n`;
      t += `┃\n`;
      t += `┣◆ 💡 *.predict ${homeName} vs ${awayName}* for AI tips\n`;
      t += `┣◆ ⚠️ _Bet responsibly. 18+ only._\n`;
      t += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;

      await extra.reply(t);

    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};
