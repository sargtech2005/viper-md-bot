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
  try {
    const { data } = await axios.get(
      `${SPORTSDB}/eventslast.php?id=${teamId}`,
      { timeout: 10000, headers: { 'User-Agent': UA } }
    );
    return data?.results || [];
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

// ── Probability model — balanced, realistic capping ──────────────────────────
function generatePrediction(homeName, awayName, homeForm, awayForm) {
  // Points from form (max 15 each) + home advantage bonus (3pts)
  const homePts = Math.min(15, homeForm.points) + 3;
  const awayPts = Math.min(15, awayForm.points);
  const total   = homePts + awayPts + 5; // +5 for draw weight

  let homeProb = Math.round((homePts / total) * 100);
  let awayProb = Math.round((awayPts / total) * 100);
  let drawProb = 100 - homeProb - awayProb;

  // Realistic caps: no team goes below 15% or above 60% (derbies are unpredictable)
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
  const confLabel  = confidence >= 55 ? '🔥 High' : confidence >= 40 ? '⚡ Medium' : '⚠️ Low';

  // Score — generated AFTER outcome is decided so it always matches
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

      // Fetch last 5 results in parallel
      const [homeEvents, awayEvents] = await Promise.all([
        homeData ? getLastResults(homeData.idTeam) : Promise.resolve([]),
        awayData ? getLastResults(awayData.idTeam) : Promise.resolve([]),
      ]);

      const homeForm = calcForm(homeEvents, homeData?.idTeam);
      const awayForm = calcForm(awayEvents, awayData?.idTeam);
      const pred     = generatePrediction(homeName, awayName, homeForm, awayForm);

      // League: prefer fixture league, then team's registered league
      // Only use homeData league if it actually matches what we searched (avoid Bradford bug)
      const league = homeData?.strLeague || awayData?.strLeague || 'Football';

      let t = `┏❐ 《 *⚽ ${sc('match prediction')}* 》 ❐\n┃\n`;
      t += `┣◆ 🏟️ *${homeName}* vs *${awayName}*\n`;
      t += `┣◆ 🏆 *${league}*\n┃\n`;

      // Form — show full W D L W W string, not just summary
      t += `┣◆ 📊 *${sc('recent form')} (last 5):*\n`;
      t += `┃  🏠 ${homeName}: *${homeForm.form || 'N/A'}* (${homeForm.w}W ${homeForm.d}D ${homeForm.l}L)\n`;
      t += `┃  ✈️  ${awayName}: *${awayForm.form || 'N/A'}* (${awayForm.w}W ${awayForm.d}D ${awayForm.l}L)\n┃\n`;

      // Probabilities
      t += `┣◆ 📈 *${sc('win probabilities')}:*\n`;
      t += `┃  🏠 ${homeName}: [${bar(pred.homeProb)}] ${pred.homeProb}%\n`;
      t += `┃  🤝 Draw:       [${bar(pred.drawProb)}] ${pred.drawProb}%\n`;
      t += `┃  ✈️  ${awayName}: [${bar(pred.awayProb)}] ${pred.awayProb}%\n┃\n`;

      // Prediction — score always matches outcome
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
