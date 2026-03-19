module.exports = async function handleDailyBrief({ ctx, data, userId, logToTerminal, db }) {
    try {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const todayStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
        const dayNames = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
        const dayName = dayNames[now.getDay()];

        let brief = `☀️ **สวัสดีตอนเช้าค่ะเจ้านาย!**\n`;
        brief += `📅 **วัน${dayName}ที่ ${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()}**\n`;
        brief += `🕒 **เวลา:** ${pad(now.getHours())}:${pad(now.getMinutes())} น.\n\n`;

        // Fetch today's tasks
        if (db) {
            try {
                const tasksSnap = await db.collection('userActivities').doc(String(userId))
                    .collection('tasks')
                    .where('time', '>=', todayStr)
                    .where('time', '<', todayStr + 'T23:59:59')
                    .limit(10).get();

                if (!tasksSnap.empty) {
                    brief += `📋 **งานวันนี้ (${tasksSnap.size} รายการ):**\n`;
                    tasksSnap.docs.forEach((doc, i) => {
                        const t = doc.data();
                        const status = t.status === 'completed' ? '✅' : '⬜';
                        brief += `  ${status} ${i+1}. ${t.title}\n`;
                    });
                    brief += '\n';
                } else {
                    brief += `📋 **งานวันนี้:** ยังไม่มีนัดหมายค่ะ เจ้านายว่างๆ ลุยโปรเจกต์ได้เลย! 🚀\n\n`;
                }

                // Fetch recent work logs
                const logsSnap = await db.collection('userActivities').doc(String(userId))
                    .collection('workLogs')
                    .orderBy('timestamp', 'desc')
                    .limit(3).get();

                if (!logsSnap.empty) {
                    brief += `📊 **ประวัติการทำงานล่าสุด:**\n`;
                    logsSnap.docs.forEach(doc => {
                        const l = doc.data();
                        brief += `  🔹 ${l.task} (${l.duration})\n`;
                    });
                    brief += '\n';
                }
            } catch (dbErr) {
                console.error('DailyBrief DB Error:', dbErr.message);
            }
        }

        // Motivational quote
        const quotes = [
            '💪 "ทุกวันคือโอกาสใหม่ในการสร้างสิ่งดีๆ"',
            '🌟 "สำเร็จได้ เริ่มจากก้าวแรก"',
            '🔥 "อย่าหยุดทำ จนกว่าจะภูมิใจ"',
            '🎯 "โฟกัสคือกุญแจสู่ความสำเร็จ"',
            '💡 "คิดใหญ่ เริ่มเล็ก ลงมือทำ"',
            '🚀 "วันนี้คือวันที่ดีที่สุดในการเริ่มต้น"',
            '🌈 "ทุกปัญหามีทางออก ทุกความฝันมีทางไป"'
        ];
        brief += quotes[Math.floor(Math.random() * quotes.length)] + '\n\n';
        brief += `🤖 *หนูพร้อมช่วยเจ้านายทุกเรื่องค่ะ ว่าสั่งได้เลยนะคะ!*`;

        await ctx.reply(brief);
        await logToTerminal(userId, 'DAILY_BRIEF', 'Morning briefing delivered');
    } catch (err) {
        console.error('DailyBrief Error:', err);
        ctx.reply(`❌ สร้าง Daily Brief ไม่สำเร็จค่ะ: ${err.message}`);
    }
};
