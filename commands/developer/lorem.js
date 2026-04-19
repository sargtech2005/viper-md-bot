/**
 * .lorem [paragraphs] [words_per_para]  (VIPER BOT MD)
 */
const config = require('../../config');
const { sc } = require('../../utils/categoryMenu');

const WORDS = [
  'lorem','ipsum','dolor','sit','amet','consectetur','adipiscing','elit','sed','do',
  'eiusmod','tempor','incididunt','ut','labore','et','dolore','magna','aliqua','enim',
  'veniam','quis','nostrud','exercitation','ullamco','laboris','nisi','aliquip','ex',
  'commodo','consequat','duis','aute','irure','reprehenderit','voluptate','velit',
  'esse','cillum','fugiat','nulla','pariatur','excepteur','sint','occaecat','cupidatat',
  'proident','sunt','culpa','qui','officia','deserunt','mollit','anim','id','est',
  'perspiciatis','unde','omnis','iste','natus','error','accusantium','doloremque',
  'laudantium','totam','rem','aperiam','eaque','ipsa','quae','ab','illo','inventore',
  'veritatis','quasi','architecto','beatae','vitae','dicta','explicabo','nemo','ipsam',
];

function randomWord() { return WORDS[Math.floor(Math.random() * WORDS.length)]; }
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function genSentence(wordCount) {
  const words = Array.from({ length: wordCount }, randomWord);
  return capitalize(words.join(' ')) + '.';
}

function genParagraph(words = 50) {
  const sentences = [];
  let remaining = words;
  while (remaining > 0) {
    const len = Math.min(remaining, Math.floor(Math.random() * 10) + 5);
    sentences.push(genSentence(len));
    remaining -= len;
  }
  return sentences.join(' ');
}

module.exports = {
  name: 'lorem',
  aliases: ['loremipsum', 'placeholder', 'lipsum'],
  category: 'developer',
  description: 'Generate Lorem Ipsum placeholder text',
  usage: '.lorem [paragraphs] [words_per_para]',

  async execute(sock, msg, args, extra) {
    try {
      const paras = Math.min(Math.max(parseInt(args[0] || '1') || 1, 1), 5);
      const words = Math.min(Math.max(parseInt(args[1] || '50') || 50, 10), 200);

      const paragraphs = Array.from({ length: paras }, () => genParagraph(words));

      let t = `┏❐ 《 *📝 ${sc('lorem ipsum')}* 》 ❐\n`;
      t += `┃  ${paras} paragraph(s) · ~${words} words each\n┃\n`;
      paragraphs.forEach((p, i) => {
        t += `┣◆ *[${i + 1}]*\n┃${p}\n`;
        if (i < paragraphs.length - 1) t += `┃\n`;
      });
      t += `┗❐\n\n`;
      t += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}* 🐍`;
      await extra.reply(t);
    } catch (e) { await extra.reply(`❌ ${e.message}`); }
  },
};
