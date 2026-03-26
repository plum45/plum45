const axios = require('axios');
const fs = require('fs');
const path = require('path');

module.exports = {
    actions: ['SPEAK'],
    execute: async (type, data, ctx, userId, options) => {
        const text = data.text;
        if (!text) return;

        try {
            // Very simple Google TTS fetch for short texts. Max 200 chars.
            // For longer texts, we would split it, but for a quick voice response this is sufficient.
            const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text.substring(0, 200))}&tl=th&client=tw-ob`;
            const response = await axios({
                url,
                method: 'GET',
                responseType: 'stream'
            });

            const audioPath = path.join(__dirname, 'temp_voice.mp3');
            const writer = fs.createWriteStream(audioPath);
            
            response.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            await ctx.replyWithVoice({ source: audioPath });
            fs.unlinkSync(audioPath);
        } catch (e) {
            console.error('Voice Mode Error:', e);
            await ctx.reply(`❌ ระบบส่งเสียงพูดไม่ได้ค่ะ: ${e.message}`);
        }
    }
};
