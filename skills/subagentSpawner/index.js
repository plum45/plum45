const { OpenAI } = require('openai');

module.exports = {
    actions: ['SPAWN_SUBAGENT'],
    execute: async (type, data, ctx, userId, options) => {
        const goal = data.goal;
        const contextData = data.context || 'None';
        
        if (!goal) {
            await ctx.reply('⚠️ Subagent error: No goal provided.');
            return;
        }

        // Reply immediately so the main bot can continue
        await ctx.reply(`🕵️‍♀️ **รับทราบค่ะ!** หนูส่งลูกน้อง (Subagent) ไปแอบซุ่มทำงานเรื่อง "${goal}" ให้ในพื้นหลังแล้วนะคะ เดี๋ยวได้ผลสรุปแล้วจะมาระบุให้ฟังค่ะ!`);

        // Run in background without awaiting
        setTimeout(async () => {
            console.log(`🤖 [Shadow Subagent]: Spawned for ${userId} -> ${goal}`);
            try {
                // Initialize dedicated background client
                // (using process.env directly since we are detached from main loop dependencies)
                const client = new OpenAI({
                    apiKey: process.env.LOCAL_MODE === 'true' ? 'ollama' : process.env.NVIDIA_API_KEY,
                    baseURL: process.env.LOCAL_MODE === 'true' ? 'http://localhost:11434/v1' : 'https://integrate.api.nvidia.com/v1'
                });

                const subagentPrompt = `You are an elite Shadow Shadow-Agent working globally in the background for Stacy (The Ultimate Assistant).
Your Master is User ID: ${userId}.
Current Year: 2026.

Your PRIMARY MISSION is: ${goal}
Current Context/Data: ${contextData}

You have unlimited time to think. Analyze the data deeply, do any necessary reasoning, and provide a comprehensive, clear, and perfectly formatted final report in THAI language. Do not output raw JSON, give a beautiful Markdown report.`;

                const response = await client.chat.completions.create({
                    model: process.env.MODEL || 'minimaxai/minimax-m2.1', // Use a strong model for the subagent too
                    messages: [{ role: 'system', content: subagentPrompt }],
                    temperature: 0.6,
                    max_tokens: 4096,
                });

                const result = response.choices[0].message.content.trim();
                console.log(`✅ [Shadow Subagent]: Finished task for ${userId}.`);
                
                // Notify user asynchronously via Telegram ctx
                await ctx.reply(`🔔 **[รายงานจาก Shadow Subagent]** มารายงานผลแล้วค่ะเจ้านาย!\n\n**เป้าหมาย:** ${goal}\n\n${result}`);
            } catch (e) {
                console.error(`❌ [Shadow Subagent] Error:`, e);
                await ctx.reply(`❌ **[รายงานจาก Shadow Subagent]** เกิดข้อผิดพลาดระหว่างทำงานค่ะ: ${e.message}`);
            }
        }, 100);
    }
};
