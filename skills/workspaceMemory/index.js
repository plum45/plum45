const fs = require('fs');
const path = require('path');

const WORKSPACE_DIR = path.join(__dirname, '../../workspace');

module.exports = {
    actions: ['WRITE_WORKSPACE_MEMORY'],
    execute: async (type, data, ctx, userId, options) => {
        const userWorkspace = path.join(WORKSPACE_DIR, String(userId));
        if (!fs.existsSync(userWorkspace)) fs.mkdirSync(userWorkspace, { recursive: true });
        
        const memoryFile = path.join(userWorkspace, 'MEMORY.md');
        const operation = data.operation || 'append';
        const content = data.content;

        if (!content) {
            await ctx.reply(`⚠️ หนูบันทึกความจำไม่ได้ค่ะ เพราะเจ้านายไม่ได้ระบุเนื้อหา (content)`);
            return;
        }

        try {
            if (operation === 'append') {
                fs.appendFileSync(memoryFile, `\n- [${new Date().toISOString()}] ${content}`);
            } else {
                fs.writeFileSync(memoryFile, content);
            }
            console.log(`[Workspace Memory] Updated for user ${userId}.`);
            await ctx.reply(`🧠 **Stacy จำเรื่องนี้ลงใน Workspace RAM แล้วค่ะ!**\n_"${content.substring(0, 100)}..."_`);
        } catch (e) {
            console.error('Workspace Memory Error:', e);
            await ctx.reply(`❌ บันทึกความจำลง Workspace ไม่สำเร็จค่ะ: ${e.message}`);
        }
    }
};
