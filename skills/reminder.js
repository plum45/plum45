module.exports = async function handleReminder({ ctx, data, userId, logToTerminal }) {
    try {
        const message = data.message || data.text || data.title || 'เตือนความจำ';
        const delayMinutes = parseInt(data.minutes || data.delay || data.time || '5');

        if (isNaN(delayMinutes) || delayMinutes < 1 || delayMinutes > 1440) {
            return ctx.reply('❌ กรุณาระบุเวลาระหว่าง 1-1440 นาที (24 ชม.) ค่ะ');
        }

        const fireAt = new Date(Date.now() + delayMinutes * 60000);
        const pad = (n) => String(n).padStart(2, '0');
        const fireTimeStr = `${pad(fireAt.getHours())}:${pad(fireAt.getMinutes())}`;

        await ctx.reply(
            `⏰ **ตั้งเตือนเรียบร้อยค่ะ!**\n\n` +
            `📝 **ข้อความ:** ${message}\n` +
            `⏱️ **อีก:** ${delayMinutes} นาที\n` +
            `🔔 **จะเตือนเวลา:** ${fireTimeStr} น.\n\n` +
            `💡 *หนูจะส่งข้อความเตือนตอนถึงเวลานะคะ!*`
        );

        // Set timeout for reminder
        setTimeout(async () => {
            try {
                await ctx.reply(
                    `🔔🔔🔔 **เตือนความจำค่ะเจ้านาย!** 🔔🔔🔔\n\n` +
                    `📝 ${message}\n\n` +
                    `⏰ ตั้งไว้เมื่อ ${delayMinutes} นาทีก่อนค่ะ\n` +
                    `💪 *อย่าลืมนะคะเจ้านาย!*`
                );
            } catch (e) { console.error('Reminder Send Error:', e); }
        }, delayMinutes * 60000);

        await logToTerminal(userId, 'REMINDER', `Set: "${message}" in ${delayMinutes}min`);
    } catch (err) {
        console.error('Reminder Error:', err);
        ctx.reply(`❌ ตั้งเตือนไม่สำเร็จค่ะ: ${err.message}`);
    }
};
