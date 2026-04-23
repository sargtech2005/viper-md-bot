/**
 * .predict — AI-powered football match prediction
 *
 * Usage:
 *   .predict Arsenal vs Chelsea
 *   .predict Man City vs Liverpool
 *
 * Uses TheSportsDB for team stats + form, generates prediction
 */
const axios  = require('axios');
const { sc } = require('../../utils/categoryMenu');
const config = require('../../config');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// ── Fetch team search ─────────────────────────────────────────────────────────
async function searchTeam(name) {
  try {
    const { data } = await axios.get(
      `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(name)}`,
      { timeout: 10000, headers: { 'User-Agent': UA } }
    );
    return data?.teams?.[0] || null;
  } catch (_) { return null; }
}

// ── Fetch last 5 results for a team ──────────────────────────────────────────
async function getLastResults(teamId) {
  try {
    const { data } = await axios.get(
      `https://www.thesportsdb.com/api/v1/json/3/eventslast.php?id=${teamId}`,
      { timeout: 10000, headers: { 'User-Agent': UA } }
    );
    return data?.results || [];
  } catch (_) { return []; }
}

// ── Calculate form from recent results ───────────────────────────────────────
function calcForm(events, teamId) {
  let w = 0, d = 0, l = 0;
  const formStr = [];
  for (const e of events.slice(0, 5)) {
    const homeId = e.idHomeTeam;
    const hs = parseInt(e.intHomeScore || 0);
    const as = parseInt(e.intAwayScore || 0);
    const isHome = homeId === teamId;
    const scored   = isHome ? hs : as;
    const conceded = isHome ? as : hs;
    if (scored > conceded)        { w++; formStr.push('W'); }
    else if (scored === conceded) { d++; formStr.push('D'); }
    else                          { l++; formStr.push('L'); }
  }
  return { w, d, l, form: formStr.join('-'), points: w * 3 + d };
}

// ── Generate prediction ───────────────────────────────────────────────────────
function generatePrediction(homeTeam, awayTeam, homeForm, awayForm, homeData, awayData) {
  const homePts = homeForm.points + 2; // home advantage
  const awayPts = awayForm.points;

  let homeProb, drawProb, awayProb;

  const total = homePts + awayPts + 4;
  homeProb = Math.round(((homePts + 2) / total) * 100);
  awayProb = Math.round((awayPts / total) * 100);
  drawProb = 100 - homeProb - awayProb;
  if (drawProb < 10) { drawProb = 10; homeProb -= 5; awayProb -= 5; }

  // Clamp
  homeProb = Math.max(15, Math.min(75, homeProb));
  awayProb = Math.max(10, Math.min(70, awayProb));
  drawProb = Math.max(10, Math.min(35, drawProb));

  // Normalise to 100
  const sum = homeProb + awayProb + drawProb;
  homeProb = Math.round(homeProb / sum * 100);
  awayProb = Math.round(awayProb / sum * 100);
  drawProb = 100 - homeProb - awayProb;

  // Score prediction
  const homeGoals = homeForm.w >= 3 ? 2 : homeForm.w >= 1 ? 1 : 0;
  const awayGoals = awayForm.w >= 3 ? 2 : awayForm.w >= 1 ? 1 : 0;

  // Most likely outcome
  let outcome, confidence;
  if (homeProb > awayProb + 15) {
    outcome = `${homeTeam} Win`;
    confidence = homeProb;
  } else if (awayProb > homeProb + 10) {
    outcome = `${awayTeam} Win`;
    confidence = awayProb;
  } else {
    outcome = 'Draw';
    confidence = drawProb + 10;
  }

  // Confidence label
  const confLabel = confidence >= 65 ? '🔥 High' : confidence >= 50 ? '⚡ Medium' : '⚠️ Low';

  return { homeProb, awayProb, drawProb, outcome, confidence, confLabel, homeGoals, awayGoals };
}

function bar(pct, len = 10) {
  const filled = Math.round(pct / 100 * len);
  return '█'.repeat(filled) + '░'.repeat(len - filled);
}

module.exports = {
  name: 'predict',
  aliases: ['prediction', 'fp', 'footballpredict'],
  category: 'sports',
  description: 'AI football match prediction based on form & stats',
  usage: '.predict <home team> vs <away team>',

  async execute(sock, msg, args, extra) {
    try {
      const input = args.join(' ');
      const vsSplit = input.split(/\s+vs\.?\s+/i);
      if (vsSplit.length < 2) {
        return extra.reply(
          `⚽ *${sc('football prediction')}*\n\n` +
          `Usage: *.predict <home> vs <away>*\n\n` +
          `Examples:\n` +
          `• *.predict Arsenal vs Chelsea*\n` +
          `• *.predict Real Madrid vs Barcelona*\n` +
          `• *.predict Nigeria vs Ghana*`
        );
      }

      const homeName = vsSplit[0].trim();
      const awayName = vsSplit[1].trim();

      await extra.reply(`🔍 Analysing *${homeName}* vs *${awayName}*...`);

      // Fetch team data in parallel
      const [homeData, awayData] = await Promise.all([
        searchTeam(homeName),
        searchTeam(awayName),
      ]);

      // Fetch form in parallel
      const [homeEvents, awayEvents] = await Promise.all([
        homeData ? getLastResults(homeData.idTeam) : Promise.resolve([]),
        awayData ? getLastResults(awayData?.idTeam) : Promise.resolve([]),
      ]);

      const homeForm = calcForm(homeEvents, homeData?.idTeam);
      const awayForm = calcForm(awayEvents, awayData?.idTeam);

      const pred = generatePrediction(homeName, awayName, homeForm, awayForm, homeData, awayData);

      const homeLeague = homeData?.strLeague || 'Unknown League';
      const awayLeague = awayData?.strLeague || homeLeague;

      let t = `┏❐ 《 *⚽ ${sc('match prediction')}* 》 ❐\n┃\n`;
      t += `┣◆ 🏟️ *${homeName}* vs *${awayName}*\n`;
      if (homeData || awayData) t += `┣◆ 🏆 *${homeLeague}*\n`;
      t += `┃\n`;

      // Form
      if (homeEvents.length || awayEvents.length) {
        t += `┣◆ 📊 *${sc('recent form')} (last 5):*\n`;
        if (homeForm.form) t += `┃  🏠 ${homeName}: *${homeForm.form}* (${homeForm.w}W ${homeForm.d}D ${homeForm.l}L)\n`;
        if (awayForm.form) t += `┃  ✈️ ${awayName}: *${awayForm.form}* (${awayForm.w}W ${awayForm.d}D ${awayForm.l}L)\n`;
        t += `┃\n`;
      }

      // Win probabilities
      t += `┣◆ 📈 *${sc('win probabilities')}:*\n`;
      t += `┃  🏠 ${homeName}:  [${bar(pred.homeProb)}] ${pred.homeProb}%\n`;
      t += `┃  🤝 Draw:${' '.repeat(Math.max(1, homeName.length - 3))}[${bar(pred.drawProb)}] ${pred.drawProb}%\n`;
      t += `┃  ✈️ ${awayName}: [${bar(pred.awayProb)}] ${pred.awayProb}%\n`;
      t += `┃\n`;

      // Prediction
      t += `┣◆ 🎯 *${sc('prediction')}:*\n`;
      t += `┃  Result: *${pred.outcome}*\n`;
      t += `┃  Score:  *${pred.homeGoals} - ${pred.awayGoals}*\n`;
      t += `┃  Confidence: ${pred.confLabel} (${pred.confidence}%)\n`;
      t += `┃\n`;
      t += `┣◆ ⚠️ _For entertainment only. Not financial advice._\n`;
      t += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;

      await extra.reply(t);

    } catch (e) {
      await extra.reply(`❌ Prediction failed: ${e.message}`);
    }
  }
};
