const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const crypto = require('crypto');

const SANDBOX_DIR = path.join(__dirname, '../../workspace/sandbox');

module.exports = {
    actions: ['RUN_CODE'],
    execute: async (type, data, ctx, userId, options) => {
        const { language, code } = data;
        
        if (!code) {
            await ctx.reply('⚠️ โค้ดว่างเปล่า รันไม่ได้ค่ะ');
            return;
        }

        if (!fs.existsSync(SANDBOX_DIR)) {
            fs.mkdirSync(SANDBOX_DIR, { recursive: true });
        }

        const ext = language === 'python' ? 'py' : 'js';
        const runner = language === 'python' ? 'python' : 'node';
        const fileId = crypto.randomBytes(4).toString('hex');
        const filePath = path.join(SANDBOX_DIR, `script_${fileId}.${ext}`);

        fs.writeFileSync(filePath, code);
        
        await ctx.reply(`👨‍💻 **[Developer Mode]** กำลังรันโค้ด ${language} ใน Sandbox... ⏳`);

        exec(`${runner} "${filePath}"`, { timeout: 15000, cwd: SANDBOX_DIR }, async (error, stdout, stderr) => {
            // Clean up file immediately
            try { fs.unlinkSync(filePath); } catch(e) {}

            let responseText = ``;
            if (error) {
                if (error.killed) {
                    responseText = `❌ **[TIME OUT]** โค้ดรันนานเกิน 15 วินาทีและถูกหยุดอัตโนมัติค่ะ`;
                } else {
                    responseText = `⚠️ **[EXECUTION ERROR]**\n\`\`\`\n${stderr || error.message}\n\`\`\``;
                }
            } else {
                responseText = `✅ **[OUTPUT]**\n\`\`\`\n${stdout.trim() || 'No output'}\n\`\`\``;
            }

            // Truncate if too long for Telegram
            if (responseText.length > 3900) {
                responseText = responseText.substring(0, 3900) + '\n...[TRUNCATED]';
            }

            await ctx.reply(responseText);
        });
    }
};
