/**
 * .codes — Football match finder for Nigerian betting platforms
 *
 * ⚠️  IMPORTANT DESIGN NOTE:
 * Sportybet, BetNaija, 1xBet and Betway do NOT have public APIs for booking
 * codes. The previous version generated FAKE codes using math formulas —
 * those codes are not real and would lose users money if they tried to use
 * them. This version is honest: it gives users the real match details they
 * need to FIND the game themselves on the platform, instead of fake codes.
 *
 * Usage:
 *   .codes Arsenal vs Chelsea
 *   .codes today
 */
const axios  = require('axios');
const { sc } = require('../../utils/categoryMenu');
const config = require('../../config');

const UA       = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const SPORTSDB = 'https://www.thesportsdb.com/api/v1/json/3';

// Properly capitalise: "man city" → "Man City"
function titleCase(str) {
  return str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

async function searchTeam(name) {
  try {
    const { data } = await axios.get(
      `${SPORTSDB}/searchteams.php?t=${encodeURIComponent(name)}`,
      { timeout: 10000, headers: { 'User-Agent': UA } }
    );
    return data?.teams?.[0] || null;
  } catch { return null; }
}

async function getUpcoming(teamId) {
  try {
    const { data } = await axios.get(
      `${SPORTSDB}/eventsnext.php?id=${teamId}`,
      { timeout: 10000, headers: { 'User-Agent': UA } }
    );
    return data?.events || [];
  } catch { return []; }
}

async function getTodayMatches() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await axios.get(
      `${SPORTSDB}/eventsday.php?d=${today}&s=Soccer`,
      { timeout: 12000, headers: { 'User-Agent': UA } }
    );
    return data?.events || [];
  } catch { return []; }
}

// Convert UTC time to WAT (UTC+1)
function toWAT(timeStr) {
  if (!timeStr) return '—';
  try {
    const [h, m] = timeStr.split(':').map(Number);
    const watH = (h + 1) % 24;
    return `${String(watH).padStart(2, '0')}:${String(m).padStart(2, '0')} WAT`;
  } catch { return timeStr; }
}

// Format match info block
function matchBlock(e, extra = '') {
  const home   = e.strHomeTeam || '?';
  const away   = e.strAwayTeam || '?';
  const league = e.strLeague   || 'Football';
  const date   = e.dateEvent   || '—';
  const time   = toWAT(e.strTime);
  const venue  = e.strVenue    || '—';
  const sid    = e.idEvent     || '—'; // TheSportsDB event ID — useful for reference

  let t = '';
  t += `┣◆ ⚽ *${home}* vs *${away}*\n`;
  t += `┣◆ 🏆 *${league}*\n`;
  t += `┣◆ ⏰ ${date} | ${time}\n`;
  if (venue && venue !== '—') t += `┣◆ 🏟️ ${venue}\n`;
  t += `┃\n`;
  t += `┣◆ 🔍 *How to find on betting sites:*\n`;
  t += `┃  Search: *"${home} vs ${away}"*\n`;
  t += `┃  Filter by: *${league}* | Date: *${date}*\n`;
  t += `┃\n`;
  t += `┣◆ 🟢 *Sportybet NG* → sportybet.com → Search Matches\n`;
  t += `┣◆ 🔵 *BetNaija*    → betnaija.com → Search\n`;
  t += `┣◆ 🔴 *1xBet NG*    → 1xbet.ng → Live → Soccer\n`;
  t += `┣◆ ⚫ *Betway NG*    → betway.com.ng → Football\n`;
  if (extra) t += extra;
  return t;
}

module.exports = {
  name: 'codes',
  aliases: ['betcodes', 'footballcodes', 'bettingcodes', 'code'],
  category: 'sports',
  description: 'Find football matches on Nigerian betting platforms',
  usage: '.codes <home> vs <away>  |  .codes today',

  async execute(sock, msg, args, extra) {
    try {
      const input = args.join(' ').trim();
      const B     = config.botName;

      if (!input) {
        return extra.reply(
          `🎟️ *${sc('betting codes')}*\n\n` +
          `*Usage:*\n` +
          `• *.codes Arsenal vs Chelsea*\n` +
          `• *.codes today* — all today's matches\n\n` +
          `*Platforms:* Sportybet 🟢 | BetNaija 🔵 | 1xBet 🔴 | Betway ⚫\n\n` +
          `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`
        );
      }

      // ── Mode 1: today's matches ──────────────────────────────────────────
      if (input.toLowerCase().startsWith('today') || input.toLowerCase() === 'all') {
        const leagueFilter = args.slice(1).join(' ').toLowerCase().trim();
        await extra.reply('🔍 Fetching today\'s matches...');

        const events = await getTodayMatches();
        if (!events.length) return extra.reply('📭 No matches found for today.');

        const filtered = leagueFilter
          ? events.filter(e => e.strLeague?.toLowerCase().includes(leagueFilter))
          : events;

        if (!filtered.length)
          return extra.reply(`📭 No matches found today matching *${leagueFilter}*.`);

        const show  = filtered.slice(0, 10);
        const today = new Date().toISOString().split('T')[0];

        // Group by league
        const grouped = {};
        for (const e of show) {
          const k = e.strLeague || 'Other';
          if (!grouped[k]) grouped[k] = [];
          grouped[k].push(e);
        }

        let t = `┏❐ 《 *🎟️ ${sc('matches')} — Today* 》 ❐\n`;
        t += `┃ 📅 *${today}* | ${show.length} matches\n┃\n`;

        for (const [league, ms] of Object.entries(grouped)) {
          t += `┣◆ 🏆 *${league}*\n`;
          for (const e of ms) {
            const time = toWAT(e.strTime);
            t += `┃  ⚽ *${e.strHomeTeam}* vs *${e.strAwayTeam}*\n`;
            t += `┃  ⏰ ${time}\n`;
            t += `┃  🔍 Search this match by name on betting sites\n┃\n`;
          }
        }

        if (filtered.length > 10) t += `┣◆ ... +${filtered.length - 10} more (use *.codes today <league>* to filter)\n┃\n`;
        t += `┣◆ 💡 *.codes <home> vs <away>* for full platform guide\n`;
        t += `┣◆ ⚠️ _Bet responsibly. 18+ only._\n`;
        t += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;
        return await extra.reply(t);
      }

      // ── Mode 2: specific match ────────────────────────────────────────────
      const vsSplit = input.split(/\s+vs\.?\s+/i);
      if (vsSplit.length < 2) {
        return extra.reply(`❌ Format: *.codes <home> vs <away>*\nOr: *.codes today*`);
      }

      const homeName = titleCase(vsSplit[0].trim());
      const awayName = titleCase(vsSplit[1].trim());

      await extra.reply(`🔍 Looking up *${homeName}* vs *${awayName}*...`);

      const [homeTeam, awayTeam] = await Promise.all([
        searchTeam(homeName),
        searchTeam(awayName),
      ]);

      // Find the exact fixture — ONLY accept if BOTH teams match, never fall back to wrong game
      let fixture = null;
      if (homeTeam) {
        const upcoming = await getUpcoming(homeTeam.idTeam);
        // Strict match: away team name must contain what user typed (or vice versa)
        fixture = upcoming.find(e => {
          const fixtureAway = (e.strAwayTeam || '').toLowerCase();
          const fixtureHome = (e.strHomeTeam || '').toLowerCase();
          const searchAway  = awayName.toLowerCase();
          const searchHome  = homeName.toLowerCase();
          return (
            (fixtureAway.includes(searchAway) || searchAway.includes(fixtureAway.split(' ')[0])) &&
            (fixtureHome.includes(searchHome) || searchHome.includes(fixtureHome.split(' ')[0]))
          );
        });
        // Also check if home/away are reversed
        if (!fixture) {
          fixture = upcoming.find(e => {
            const fixtureAway = (e.strAwayTeam || '').toLowerCase();
            const fixtureHome = (e.strHomeTeam || '').toLowerCase();
            const searchAway  = awayName.toLowerCase();
            const searchHome  = homeName.toLowerCase();
            return (
              fixtureHome.includes(searchAway) &&
              fixtureAway.includes(searchHome)
            );
          });
        }
      }

      // Build response
      const league = fixture?.strLeague || homeTeam?.strLeague || awayTeam?.strLeague || 'Football';
      const date   = fixture?.dateEvent || '—';
      const time   = toWAT(fixture?.strTime);
      const venue  = fixture?.strVenue  || homeTeam?.strStadium || '—';

      let t = `┏❐ 《 *🎟️ ${sc('betting codes')}* 》 ❐\n┃\n`;
      t += `┣◆ ⚽ *${homeName}* vs *${awayName}*\n`;
      t += `┣◆ 🏆 *${league}*\n`;
      if (date !== '—') t += `┣◆ ⏰ ${date} | ${time}\n`;
      if (venue && venue !== '—') t += `┣◆ 🏟️ ${venue}\n`;
      t += `┃\n`;

      if (!fixture) {
        // Fixture not found — be honest, don't show wrong info
        t += `┣◆ ⚠️ *Exact fixture not found in database*\n`;
        t += `┃  This match may not be scheduled yet, or\n`;
        t += `┃  the team names may be spelled differently.\n┃\n`;
      }

      t += `┣◆ 🔍 *How to find this match on betting sites:*\n`;
      t += `┃\n`;
      t += `┃  1️⃣ Search: *"${homeName} ${awayName}"* or *"${homeName} vs ${awayName}"*\n`;
      t += `┃  2️⃣ Filter by: *${league}*\n`;
      if (date !== '—') t += `┃  3️⃣ Date: *${date}*\n`;
      t += `┃\n`;
      t += `┣◆ 🟢 *Sportybet NG* → sportybet.com → 🔍 Search Matches\n`;
      t += `┣◆ 🔵 *BetNaija*    → betnaija.com → 🔍 Search\n`;
      t += `┣◆ 🔴 *1xBet NG*    → 1xbet.ng → Football → ${league.includes('Serie') ? 'Italy' : league.includes('Premier') ? 'England' : 'Search'}\n`;
      t += `┣◆ ⚫ *Betway NG*    → betway.com.ng → Football → Today\n`;
      t += `┃\n`;
      t += `┣◆ 💡 *.predict ${homeName} vs ${awayName}* for AI prediction\n`;
      t += `┣◆ ⚠️ _Bet responsibly. 18+ only._\n`;
      t += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${B}* 🐍`;

      await extra.reply(t);

    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};
