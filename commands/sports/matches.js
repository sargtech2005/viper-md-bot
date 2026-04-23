/**
 * .matches — List football matches for today or any date
 *
 * Usage:
 *   .matches             → today
 *   .matches tomorrow    → tomorrow
 *   .matches 2025-06-15  → specific date
 *   .matches pl          → Premier League today
 *
 * Uses TheSportsDB (free, no key) + football-data.org (free key optional)
 */
const axios  = require('axios');
const { sc } = require('../../utils/categoryMenu');
const config = require('../../config');

// ── League filters ────────────────────────────────────────────────────────────
const LEAGUE_ALIASES = {
  pl: 'premier league', epl: 'premier league', premierleague: 'premier league',
  laliga: 'la liga', ll: 'la liga',
  ucl: 'champions league', cl: 'champions league',
  serie: 'serie a', seriea: 'serie a',
  bundesliga: 'bundesliga', bl: 'bundesliga',
  ligue1: 'ligue 1', ligue: 'ligue 1',
  npfl: 'npfl', nigeria: 'npfl',
  mls: 'mls', eredivisie: 'eredivisie',
};

function parseDate(arg) {
  if (!arg || arg === 'today') return new Date();
  if (arg === 'tomorrow') { const d = new Date(); d.setDate(d.getDate() + 1); return d; }
  if (arg === 'yesterday') { const d = new Date(); d.setDate(d.getDate() - 1); return d; }
  const d = new Date(arg);
  return isNaN(d.getTime()) ? new Date() : d;
}

function fmtDate(d) {
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

function fmtTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });
  } catch (_) { return iso.slice(11, 16) || '—'; }
}

module.exports = {
  name: 'matches',
  aliases: ['fixtures', 'games', 'schedule', 'footballmatches'],
  category: 'sports',
  description: 'List football matches for today or any date',
  usage: '.matches [date|today|tomorrow] [league]',

  async execute(sock, msg, args, extra) {
    try {
      // Parse args — could be date, league keyword, or both
      let dateArg    = null;
      let leagueFilter = null;

      for (const a of args) {
        const lower = a.toLowerCase();
        if (LEAGUE_ALIASES[lower]) {
          leagueFilter = LEAGUE_ALIASES[lower];
        } else if (lower === 'today' || lower === 'tomorrow' || lower === 'yesterday' || /^\d{4}-\d{2}-\d{2}$/.test(a)) {
          dateArg = a;
        }
      }

      const date    = parseDate(dateArg);
      const dateStr = fmtDate(date);
      const label   = dateArg === 'tomorrow' ? 'Tomorrow' : dateArg === 'yesterday' ? 'Yesterday' : dateStr === fmtDate(new Date()) ? 'Today' : dateStr;

      await extra.reply(`⚽ Fetching ${label}'s matches...`);

      const allMatches = [];

      // ── Source 1: TheSportsDB (free, no key) ─────────────────────────────
      try {
        const { data } = await axios.get(
          `https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${dateStr}&s=Soccer`,
          { timeout: 12000, headers: { 'User-Agent': 'Mozilla/5.0' } }
        );
        const events = data?.events || [];
        for (const e of events) {
          allMatches.push({
            league:   e.strLeague     || 'Unknown',
            home:     e.strHomeTeam   || '?',
            away:     e.strAwayTeam   || '?',
            time:     e.strTime       ? e.strTime.slice(0, 5) : '—',
            homeScore: e.intHomeScore ?? null,
            awayScore: e.intAwayScore ?? null,
            status:   e.strStatus     || 'NS',
            country:  e.strCountry    || '',
            source:   'TSDB',
          });
        }
      } catch (_) {}

      // ── Source 2: football-data.org (free, no key for basic) ─────────────
      try {
        const { data } = await axios.get(
          `https://api.football-data.org/v4/matches?dateFrom=${dateStr}&dateTo=${dateStr}`,
          { timeout: 12000, headers: { 'X-Auth-Token': config.footballApiKey || '', 'User-Agent': 'Mozilla/5.0' } }
        );
        const matches = data?.matches || [];
        for (const m of matches) {
          // Avoid duplicates from TSDB
          const key = `${m.homeTeam?.name}${m.awayTeam?.name}`;
          if (!allMatches.find(x => x.home === m.homeTeam?.name)) {
            allMatches.push({
              league:    m.competition?.name     || 'Unknown',
              home:      m.homeTeam?.name        || '?',
              away:      m.awayTeam?.name        || '?',
              time:      fmtTime(m.utcDate),
              homeScore: m.score?.fullTime?.home ?? null,
              awayScore: m.score?.fullTime?.away ?? null,
              status:    m.status               || 'NS',
              country:   m.area?.name           || '',
              source:    'FD',
            });
          }
        }
      } catch (_) {}

      // ── Source 3: API-Sports free tier ────────────────────────────────────
      try {
        const { data } = await axios.get(
          `https://v3.football.api-sports.io/fixtures?date=${dateStr}`,
          { timeout: 12000, headers: { 'x-rapidapi-key': config.apiSportsKey || '', 'x-rapidapi-host': 'v3.football.api-sports.io' } }
        );
        const fixtures = data?.response || [];
        for (const f of fixtures) {
          if (!allMatches.find(x => x.home === f.teams?.home?.name)) {
            allMatches.push({
              league:    f.league?.name      || 'Unknown',
              home:      f.teams?.home?.name || '?',
              away:      f.teams?.away?.name || '?',
              time:      fmtTime(f.fixture?.date),
              homeScore: f.goals?.home       ?? null,
              awayScore: f.goals?.away       ?? null,
              status:    f.fixture?.status?.short || 'NS',
              country:   f.league?.country  || '',
              source:    'AS',
            });
          }
        }
      } catch (_) {}

      if (!allMatches.length) {
        return extra.reply(
          `⚽ *No matches found for ${label}*\n\nNo football fixtures available from any source.\n\n` +
          `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`
        );
      }

      // Filter by league if specified
      let filtered = leagueFilter
        ? allMatches.filter(m => m.league.toLowerCase().includes(leagueFilter))
        : allMatches;

      if (!filtered.length) filtered = allMatches; // fallback if filter found nothing

      // Group by league
      const grouped = {};
      for (const m of filtered) {
        const k = m.league;
        if (!grouped[k]) grouped[k] = [];
        grouped[k].push(m);
      }

      const leagueCount = Object.keys(grouped).length;
      const matchCount  = filtered.length;

      let t = `┏❐ 《 *⚽ ${sc('football matches')} — ${label}* 》 ❐\n`;
      t += `┃ 📅 *${dateStr}* | ${matchCount} matches | ${leagueCount} competitions\n┃\n`;

      let shown = 0;
      for (const [league, ms] of Object.entries(grouped)) {
        if (shown >= 40) break; // cap to avoid message too long
        t += `┣◆ 🏆 *${league}*\n`;
        for (const m of ms.slice(0, 6)) {
          const score = m.homeScore !== null && m.awayScore !== null
            ? ` *${m.homeScore} - ${m.awayScore}*` : '';
          const status = m.status === 'FT' ? ' ✅' : m.status === 'NS' ? '' : ` (${m.status})`;
          t += `┃  ⏰ ${m.time}  ${m.home} vs ${m.away}${score}${status}\n`;
          shown++;
        }
        t += '┃\n';
      }

      if (matchCount > 40) t += `┣◆ ... and ${matchCount - 40} more matches\n┃\n`;
      t += `┣◆ 💡 *.predict <home> vs <away>* for AI prediction\n`;
      t += `┣◆ 💡 *.codes <home> vs <away>* for betting codes\n`;
      t += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;

      await extra.reply(t);

    } catch (e) {
      await extra.reply(`❌ Error fetching matches: ${e.message}`);
    }
  }
};
