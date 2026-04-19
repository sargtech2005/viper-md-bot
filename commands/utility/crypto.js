/**
 * Crypto Command - Live crypto prices via CoinGecko (VIPER BOT MD)
 */
const axios = require('axios');
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');

// Map common tickers/names to CoinGecko IDs
const COIN_MAP = {
  btc: 'bitcoin', bitcoin: 'bitcoin',
  eth: 'ethereum', ethereum: 'ethereum',
  bnb: 'binancecoin', binance: 'binancecoin',
  sol: 'solana', solana: 'solana',
  xrp: 'ripple', ripple: 'ripple',
  ada: 'cardano', cardano: 'cardano',
  doge: 'dogecoin', dogecoin: 'dogecoin',
  dot: 'polkadot', polkadot: 'polkadot',
  matic: 'matic-network', polygon: 'matic-network',
  ltc: 'litecoin', litecoin: 'litecoin',
  shib: 'shiba-inu', shiba: 'shiba-inu',
  avax: 'avalanche-2', avalanche: 'avalanche-2',
  link: 'chainlink', chainlink: 'chainlink',
  uni: 'uniswap', uniswap: 'uniswap',
  atom: 'cosmos', cosmos: 'cosmos',
  trx: 'tron', tron: 'tron',
  xlm: 'stellar', stellar: 'stellar',
  near: 'near', 'near-protocol': 'near',
  pepe: 'pepe', floki: 'floki',
};

function formatNum(n) {
  if (n === null || n === undefined) return 'N/A';
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1) return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${n.toFixed(6)}`;
}

function changeEmoji(pct) {
  if (pct === null || pct === undefined) return '➖';
  return pct >= 0 ? '🟢' : '🔴';
}

module.exports = {
  name: 'crypto',
  aliases: ['coin', 'price', 'btc', 'eth', 'crypto'],
  category: 'utility',
  description: 'Get live cryptocurrency price and stats',
  usage: '.crypto <coin> | .crypto top',

  async execute(sock, msg, args, extra) {
    try {
      const input = (args[0] || '').toLowerCase().trim();

      // .crypto top — show top 10
      if (!input || input === 'top') {
        const { data } = await axios.get(
          'https://api.coingecko.com/api/v3/coins/markets',
          {
            params: { vs_currency: 'usd', order: 'market_cap_desc', per_page: 10, page: 1 },
            timeout: 10000,
          }
        );

        let t = `┏❐ 《 *💰 ${sc('top 10 crypto')}* 》 ❐\n┃\n`;
        data.forEach((c, i) => {
          const chg = c.price_change_percentage_24h;
          t += `┣◆ ${i + 1}. *${c.symbol.toUpperCase()}* — ${formatNum(c.current_price)} ${changeEmoji(chg)} ${chg !== null ? chg.toFixed(2) + '%' : ''}\n`;
        });
        t += `┗❐\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
        return await extra.reply(t);
      }

      // Resolve coin ID
      const coinId = COIN_MAP[input] || input;

      const { data } = await axios.get(
        `https://api.coingecko.com/api/v3/coins/${coinId}`,
        {
          params: { localization: false, tickers: false, community_data: false, developer_data: false },
          timeout: 10000,
        }
      );

      const m = data.market_data;
      const price = m.current_price.usd;
      const high24 = m.high_24h.usd;
      const low24 = m.low_24h.usd;
      const chg24 = m.price_change_percentage_24h;
      const chg7 = m.price_change_percentage_7d;
      const cap = m.market_cap.usd;
      const vol = m.total_volume.usd;
      const rank = data.market_cap_rank;
      const supply = m.circulating_supply;

      let t = `┏❐ 《 *💰 ${sc('crypto price')}* 》 ❐\n`;
      t += `┃\n`;
      t += `┣◆ 🪙 *Coin:* ${data.name} (${data.symbol.toUpperCase()})\n`;
      t += `┣◆ 🏅 *Rank:* #${rank}\n`;
      t += `┃\n`;
      t += `┣◆ 💵 *Price:* ${formatNum(price)}\n`;
      t += `┣◆ 📈 *24h High:* ${formatNum(high24)}\n`;
      t += `┣◆ 📉 *24h Low:* ${formatNum(low24)}\n`;
      t += `┃\n`;
      t += `┣◆ ${changeEmoji(chg24)} *24h Change:* ${chg24 !== null ? chg24.toFixed(2) + '%' : 'N/A'}\n`;
      t += `┣◆ ${changeEmoji(chg7)} *7d Change:* ${chg7 !== null ? chg7.toFixed(2) + '%' : 'N/A'}\n`;
      t += `┃\n`;
      t += `┣◆ 📊 *Market Cap:* ${formatNum(cap)}\n`;
      t += `┣◆ 💹 *24h Volume:* ${formatNum(vol)}\n`;
      t += `┣◆ 🔄 *Circulating:* ${supply ? supply.toLocaleString() + ' ' + data.symbol.toUpperCase() : 'N/A'}\n`;
      t += `┗❐\n\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;

      await extra.reply(t);
    } catch (e) {
      if (e.response && e.response.status === 404) {
        return extra.reply(
          '❌ Coin not found. Try:\n*.crypto btc* | *.crypto eth* | *.crypto doge*\n*.crypto top* — for top 10'
        );
      }
      await extra.reply(`❌ Error: ${e.message}`);
    }
  },
};
