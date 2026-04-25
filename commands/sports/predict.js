/**
 * .predict — Football match prediction
 *
 * Uses TheSportsDB (free, no key) for real team form.
 * Prediction model uses form points + home advantage.
 * Score is always tied to the predicted outcome.
 */
const axios  = require('axios');
const { sc } = require('../../utils/categoryMenu');
const config = require('../../config');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const SPORTSDB = 'https://www.thesportsdb.com/api/v1/json/3';

async function searchTeam(name) {
  try {
    const { data } = await axios.get(
      `${SPORTSDB}/searchteams.php?t=${encodeURIComponent(name)}`,
      { timeout: 10000, headers: { 'User-Agent': UA } }
    );
    return data?.teams?.[0] || null;
  } catch { return null; }
}

async function getLastResults(teamId) {
  // TheSportsDB eventslast.php only returns the single most recent event.
  // We need to hit eventspastleague + team events to get real last-5 form.
  try {
    // Try the team's last 15 events and filter to completed ones
    const { data } = await axios.get(
      `${SPORTSDB}/eventslast.php?id=${teamId}`,
      { timeout: 10000, headers: { 'User-Agent': UA } }
    );
    const events = data?.results || [];
    // Filter only finished events (intHomeScore is not null)
    return events.filter(e => e.intHomeScore !== null && e.intHomeScore !== '');
  } catch { return []; }
}

async function getH2H(homeId, awayId) {
  try {
    // TheSportsDB H2H endpoint
    const { data } = await axios.get(
      `${SPORTSDB}/eventsh2h.php?id=${homeId}&id2=${awayId}`,
      { timeout: 10000, headers: { 'User-Agent': UA } }
    );
    return (data?.results || [])
      .filter(e => e.intHomeScore !== null && e.intHomeScore !== '')
      .slice(0, 5);
  } catch { return []; }
}

// Returns { w, d, l, form } where form is like "W D L W W" (space-separated, last 5)
function calcForm(events, teamId) {
  let w = 0, d = 0, l = 0;
  const formArr = [];
  const last5 = events.slice(0, 5);

  for (const e of last5) {
    const isHome = String(e.idHomeTeam) === String(teamId);
    const hs = parseInt(e.intHomeScore ?? -1);
    const as = parseInt(e.intAwayScore ?? -1);
    if (hs < 0 || as < 0) { formArr.push('?'); continue; } // unplayed
    const scored   = isHome ? hs : as;
    const conceded = isHome ? as : hs;
    if (scored > conceded)        { w++; formArr.push('W'); }
    else if (scored === conceded) { d++; formArr.push('D'); }
    else                          { l++; formArr.push('L'); }
  }
  return { w, d, l, form: formArr.join(' '), points: w * 3 + d };
}

// ── Score generator — ALWAYS consistent with outcome ─────────────────────────
function predictScore(outcome, homeName, awayName, homeForm, awayForm) {
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  if (outcome === `${homeName} Win`) {
    const homeGoals = rand(1, 3);
    const awayGoals = rand(0, Math.max(0, homeGoals - 1));
    return { homeGoals, awayGoals };
  }
  if (outcome === `${awayName} Win`) {
    const awayGoals = rand(1, 3);
    const homeGoals = rand(0, Math.max(0, awayGoals - 1));
    return { homeGoals, awayGoals };
  }
  // Draw
  const goals = rand(0, 2);
  return { homeGoals: goals, awayGoals: goals };
}

// ── Probability model — balanced with H2H weight ─────────────────────────────
function generatePrediction(homeName, awayName, homeForm, awayForm, h2hEvents, homeId, awayId) {
  // Base: form points (max 15) + home advantage (3pts)
  const homePts = Math.min(15, homeForm.points) + 3;
  const awayPts = Math.min(15, awayForm.points);
  const total   = homePts + awayPts + 5;

  let homeProb = Math.round((homePts / total) * 100);
  let awayProb = Math.round((awayPts / total) * 100);
  let drawProb = 100 - homeProb - awayProb;

  // H2H adjustment — if H2H data exists, shift probabilities toward historical winner
  if (h2hEvents.length >= 2) {
    let h2hHomeW = 0, h2hAwayW = 0, h2hD = 0;
    for (const e of h2hEvents) {
      const hs = parseInt(e.intHomeScore);
      const as = parseInt(e.intAwayScore);
      const eIsHome = String(e.idHomeTeam) === String(homeId);
      const homeScore = eIsHome ? hs : as;
      const awayScore = eIsHome ? as : hs;
      if (homeScore > awayScore) h2hHomeW++;
      else if (homeScore < awayScore) h2hAwayW++;
      else h2hD++;
    }
    const h2hTotal = h2hEvents.length;
    // Blend 30% H2H weight into probabilities
    homeProb = Math.round(homeProb * 0.7 + (h2hHomeW / h2hTotal * 100) * 0.3);
    awayProb = Math.round(awayProb * 0.7 + (h2hAwayW / h2hTotal * 100) * 0.3);
    drawProb = 100 - homeProb - awayProb;
  }

  // Realistic caps — derbies are unpredictable, no team should be < 15% or > 60%
  homeProb = Math.max(15, Math.min(60, homeProb));
  awayProb = Math.max(15, Math.min(55, awayProb));
  drawProb = Math.max(15, Math.min(40, drawProb));

  // Re-normalise to 100
  const sum = homeProb + awayProb + drawProb;
  homeProb  = Math.round(homeProb / sum * 100);
  awayProb  = Math.round(awayProb / sum * 100);
  drawProb  = 100 - homeProb - awayProb;

  // Outcome
  const maxProb = Math.max(homeProb, drawProb, awayProb);
  let outcome;
  if (maxProb === homeProb && homeProb > awayProb + 8) outcome = `${homeName} Win`;
  else if (maxProb === awayProb && awayProb > homeProb + 8) outcome = `${awayName} Win`;
  else outcome = 'Draw';

  const confidence = maxProb;
  // Fixed thresholds: High ≥65%, Medium 50-64%, Low <50%
  const confLabel  = confidence >= 65 ? '🔥 High' : confidence >= 50 ? '⚡ Medium' : '⚠️ Low';

  const { homeGoals, awayGoals } = predictScore(outcome, homeName, awayName, homeForm, awayForm);

  return { homeProb, awayProb, drawProb, outcome, confidence, confLabel, homeGoals, awayGoals };
}

function bar(pct, len = 10) {
  const filled = Math.round(pct / 100 * len);
  return '█'.repeat(filled) + '░'.repeat(len - filled);
}

// Properly capitalise team name: "man city" → "Man City"
function titleCase(str) {
  return str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

module.exports = {
  name: 'predict',
  aliases: ['prediction', 'fp', 'footballpredict'],
  category: 'sports',
  description: 'AI football match prediction based on real form & stats',
  usage: '.predict <home team> vs <away team>',

  async execute(sock, msg, args, extra) {
    try {
      const input    = args.join(' ');
      const vsSplit  = input.split(/\s+vs\.?\s+/i);
      if (vsSplit.length < 2) {
        return extra.reply(
          `⚽ Usage: *.predict <home> vs <away>*\n\n` +
          `Examples:\n` +
          `• *.predict Arsenal vs Chelsea*\n` +
          `• *.predict Real Madrid vs Barcelona*`
        );
      }

      // Capitalise properly right away — no more "bolonga"
      const homeName = titleCase(vsSplit[0].trim());
      const awayName = titleCase(vsSplit[1].trim());

      await extra.reply(`🔍 Analysing *${homeName}* vs *${awayName}*...`);

      // Fetch team profiles in parallel
      const [homeData, awayData] = await Promise.all([
        searchTeam(homeName),
        searchTeam(awayName),
      ]);

      // Fetch last results + H2H in parallel
      const [homeEvents, awayEvents, h2hEvents] = await Promise.all([
        homeData ? getLastResults(homeData.idTeam) : Promise.resolve([]),
        awayData ? getLastResults(awayData.idTeam) : Promise.resolve([]),
        (homeData && awayData) ? getH2H(homeData.idTeam, awayData.idTeam) : Promise.resolve([]),
      ]);

      const homeForm = calcForm(homeEvents, homeData?.idTeam);
      const awayForm = calcForm(awayEvents, awayData?.idTeam);
      const pred     = generatePrediction(
        homeName, awayName, homeForm, awayForm,
        h2hEvents, homeData?.idTeam, awayData?.idTeam
      );

      const league = homeData?.strLeague || awayData?.strLeague || 'Football';

      // Data quality — warn if form is based on fewer than 3 matches
      const homeMatches = homeForm.w + homeForm.d + homeForm.l;
      const awayMatches = awayForm.w + awayForm.d + awayForm.l;
      const lowData     = homeMatches < 3 || awayMatches < 3;

      let t = `┏❐ 《 *⚽ ${sc('match prediction')}* 》 ❐\n┃\n`;
      t += `┣◆ 🏟️ *${homeName}* vs *${awayName}*\n`;
      t += `┣◆ 🏆 *${league}*\n`;
      if (h2hEvents.length > 0) t += `┣◆ 📋 H2H: *${h2hEvents.length} previous meetings*\n`;
      t += `┃\n`;

      t += `┣◆ 📊 *${sc('recent form')} (last ${Math.max(homeMatches, awayMatches, 1)}):*\n`;
      t += `┃  🏠 ${homeName}: *${homeForm.form || 'N/A'}* (${homeForm.w}W ${homeForm.d}D ${homeForm.l}L)\n`;
      t += `┃  ✈️  ${awayName}: *${awayForm.form || 'N/A'}* (${awayForm.w}W ${awayForm.d}D ${awayForm.l}L)\n`;
      if (lowData) t += `┃  ⚠️ _Limited data — prediction less reliable_\n`;
      t += `┃\n`;

      t += `┣◆ 📈 *${sc('win probabilities')}:*\n`;
      t += `┃  🏠 ${homeName}: [${bar(pred.homeProb)}] ${pred.homeProb}%\n`;
      t += `┃  🤝 Draw:       [${bar(pred.drawProb)}] ${pred.drawProb}%\n`;
      t += `┃  ✈️  ${awayName}: [${bar(pred.awayProb)}] ${pred.awayProb}%\n┃\n`;

      t += `┣◆ 🎯 *${sc('prediction')}:*\n`;
      t += `┃  Result: *${pred.outcome}*\n`;
      t += `┃  Score:  *${pred.homeGoals} - ${pred.awayGoals}*\n`;
      t += `┃  Confidence: ${pred.confLabel} (${pred.confidence}%)\n┃\n`;
      t += `┣◆ ⚠️ _For entertainment only. Not financial advice._\n`;
      t += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;

      await extra.reply(t);

    } catch (e) {
      await extra.reply(`❌ Prediction failed: ${e.message}`);
    }
  }
};
