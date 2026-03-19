const { Telegraf } = require('telegraf');

const bot = new Telegraf('8461000196:AAHTxLtdBV9VwEVoUSeGNYRVhoEe8pfaLdg');

bot.start((ctx) => ctx.reply('Alive'));

console.log('Starting standalone test...');
bot.launch()
  .then(() => console.log('Standalone Bot Launched!'))
  .catch(err => console.error('Standalone Error:', err.message));
