const { Telegraf } = require('telegraf');
require('dotenv').config();

const token = process.env.TELEGRAM_TOKEN;
console.log('Testing bot with token:', token);
const bot = new Telegraf(token);

bot.start((ctx) => ctx.reply('Bot is working!'));
console.log('Launching...');
bot.launch()
  .then(() => {
    console.log('Bot launched!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Launch error:', err);
    process.exit(1);
  });

setTimeout(() => {
    console.log('Launch timed out after 10s');
    process.exit(1);
}, 10000);
