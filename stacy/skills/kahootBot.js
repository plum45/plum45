const path = require('path');
const { exec } = require('child_process');

module.exports = async function handleKahootBot({ ctx, data, userId, logToTerminal }) {
    try {
        const pin = data.pin || '802798';
        const nick = data.nickname || 'StacyMaster';
        await ctx.reply(`🕹️ **Stacy Auto-Pilot:** กำลังส่งบอทเข้าไปที่ระบบ Kahoot (PIN: ${pin}) เพื่อรอทำข้อสอบให้เจ้านายแบบ Real-time นะคะ!`);
        
        // Launch the bot script as a background process
        // Get the root directory instead of lib/actions
        const rootDir = path.join(__dirname, '..', '..');
        const botPath = path.join(rootDir, 'kahoot-master-bot.js');
        exec(`node "${botPath}" ${pin} ${nick}`, (error) => {
            if (error) console.error(`Kahoot Bot Error: ${error.message}`);
        });
        
        await logToTerminal(userId, 'KAHOOT_BOT', `Bot launched for PIN ${pin}`);
    } catch (err) { 
        ctx.reply(`❌ ไม่สามารถรันบอท Kahoot ได้ค่ะ: ${err.message}`); 
    }
};
