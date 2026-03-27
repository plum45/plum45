const { Telegraf, Markup } = require('telegraf');
const { getBotMemory } = require('./database');
const { handleAgentActions } = require('./actions');

function setupBot(token, config, options) {
    console.log("🤖 Initializing Bot Instance...");
    if (!token) {
        console.error("❌ No Telegram Token provided!");
        return null;
    }
    const bot = new Telegraf(token);
    console.log("🤖 Bot created. Registering menus...");

    const mainMenu = Markup.keyboard([
        ['⚡ Shortcuts', '📊 Status'],
        ['🛠️ Skills', '🧠 Who Am I?'],
        ['📅 Dashboard', '🆔 My ID']
    ]).resize();

    bot.start((ctx) => {
        ctx.reply(`✨ **Stacy Premium v${config.VERSION}**\n\nสวัสดีค่ะเจ้านาย! หนูคือ Stacy เลขาคนเก่ง พร้อมดูแลงานเอกสาร และระบบอัตโนมัติแล้วนะคะ`, mainMenu);
    });

    bot.help((ctx) => {
        ctx.reply(`📖 **คู่มือการใช้งาน Stacy (เลขาอัจฉริยะ)**\n\n1. **การสั่งงาน:** พิมพ์คุยปกติได้เลยจ๊ะ\n2. **นัดหมาย:** บันทึกปุ๊บ จะเด้งไปที่ Google Calendar ทันทีค่ะ!\n3. **สกิลพิเศษ:** ใช้ Code Architect เพื่อสร้างระบบใหม่ๆ ให้หนูได้นะคะ`);
    });

    bot.hears('📊 Status', (ctx) => {
        ctx.reply(`📡 **Stacy System Status** (Type /status for detail)\n━━━━━━━━━━━━━━━━━━━━\n🟢 **Backend:** Online\n🚀 **Engine:** ${config.MODEL}\n✨ **Version:** ${config.VERSION}\n━━━━━━━━━━━━━━━━━━━━`, Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Refresh Status', 'refresh_status')],
            [Markup.button.callback('🖥️ PC Stats', 'pc_stats'), Markup.button.callback('📸 Screen Capture', 'screen_capture')]
        ]));
    });

    bot.hears('⚡ Shortcuts', (ctx) => {
        ctx.reply(`⚡ **Quick Actions: เจ้านายอยากให้หนูช่วยทำอะไรดีคะ?**`, Markup.inlineKeyboard([
            [Markup.button.callback('🎞️ Create Slide', 'action_slide')],
            [Markup.button.callback('🔍 Search Web', 'action_search')],
            [Markup.button.callback('💻 PC Stats', 'pc_stats')]
        ]));
    });

    bot.action('pc_stats', async (ctx) => {
        await ctx.answerCbQuery('กำลังดึงข้อมูลระบบ...');
        await handleAgentActions(ctx, 'GET_PC_STATS', {}, ctx.from.id, options);
    });

    bot.action('screen_capture', async (ctx) => {
        await ctx.answerCbQuery('กำลังแคปหน้าจอ...');
        await handleAgentActions(ctx, 'SCREEN_CAPTURE', {}, ctx.from.id, options);
    });

    bot.hears('🧠 Who Am I?', async (ctx) => {
        const memory = await getBotMemory(ctx.from.id);
        ctx.reply(`🧠 **ตัวตนปัจจุบันของหนู:**\n"${memory.identity}"`);
    });

    bot.hears('🛠️ Skills', async (ctx) => {
        const { db } = options;
        const snap = await db.collection('userActivities').doc(String(ctx.from.id)).collection('skills').get();
        if (snap.empty) return ctx.reply('🛠️ **ยังไม่มีสกิลเพิ่มเติมค่ะ**');
        let text = "🛠️ **คลังสกิลที่หนูจำได้:**\n";
        snap.forEach(doc => text += `🔹 **${doc.id}**: ${doc.data().description}\n`);
        ctx.reply(text);
    });

    bot.hears('🆔 My ID', (ctx) => ctx.reply(`🆔 **ID ของเจ้านายคือ:** \`${ctx.from.id}\``));

    bot.hears('📅 Dashboard', (ctx) => {
        ctx.reply(`🌐 **เข้าสู่หน้า Dashboard**`, Markup.inlineKeyboard([
            [Markup.button.url('Open Dashboard', 'https://plum45.onrender.com')]
        ]));
    });

    bot.catch((err, ctx) => {
        console.error(`🚨 [Telegraf Error] for ${ctx.updateType}:`, err);
        ctx.reply(`🙏 **ขออภัยค่ะเจ้านาย บอทสดุดนิดหน่อยแต่ยังสู้อยู่นะคะ!**\nError: ${err.message.substring(0, 50)}`).catch(() => {});
    });

    return bot;
}

module.exports = { setupBot };
