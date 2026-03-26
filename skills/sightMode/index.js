const screenshot = require('screenshot-desktop');
const fs = require('fs');
const path = require('path');

module.exports = {
    actions: ['VIEW_SCREEN'],
    execute: async (type, data, ctx, userId, options) => {
        try {
            await ctx.reply('📸 **[Sight Mode]** กำลังถ่ายภาพหน้าจอคอมพิวเตอร์ปัจจุบันค่ะ...');
            const imgPath = path.join(__dirname, 'temp_screen.png');
            await screenshot({ filename: imgPath });
            await ctx.replyWithPhoto({ source: imgPath }, { caption: '🖥️ นี่คือหน้าจอของเครื่อง Host ตอนนี้ค่ะเจ้านาย' });
            fs.unlinkSync(imgPath);
        } catch (e) {
            console.error('Sight Mode Error:', e);
            await ctx.reply(`❌ ถ่ายภาพหน้าจอไม่สำเร็จค่ะ: ${e.message}`);
        }
    }
};
