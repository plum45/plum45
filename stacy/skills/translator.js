const axios = require('axios');

module.exports = async function handleTranslate({ ctx, data, userId, logToTerminal }) {
    try {
        const text = data.text || data.query || '';
        const targetLang = data.target || data.to || 'en';
        const sourceLang = data.source || data.from || 'auto';

        if (!text) {
            return ctx.reply('❌ กรุณาระบุข้อความที่ต้องการแปลค่ะ');
        }

        // Use MyMemory Translation API (free, no key needed)
        const res = await axios.get('https://api.mymemory.translated.net/get', {
            params: {
                q: text,
                langpair: `${sourceLang}|${targetLang}`
            }
        });

        const translated = res.data.responseData.translatedText;
        const langNames = {
            'en': '🇬🇧 อังกฤษ', 'th': '🇹🇭 ไทย', 'ja': '🇯🇵 ญี่ปุ่น', 
            'zh': '🇨🇳 จีน', 'ko': '🇰🇷 เกาหลี', 'fr': '🇫🇷 ฝรั่งเศส',
            'de': '🇩🇪 เยอรมัน', 'es': '🇪🇸 สเปน', 'ru': '🇷🇺 รัสเซีย',
            'auto': '🔍 ตรวจจับอัตโนมัติ'
        };

        const fromName = langNames[sourceLang] || sourceLang;
        const toName = langNames[targetLang] || targetLang;

        const reply = `🌐 **แปลภาษาเรียบร้อยค่ะเจ้านาย!**\n\n` +
            `📝 **ต้นฉบับ (${fromName}):**\n${text}\n\n` +
            `✅ **คำแปล (${toName}):**\n${translated}\n\n` +
            `💡 *หมายเหตุ: หนูรองรับ 50+ ภาษา ลองบอก "แปลเป็นญี่ปุ่น" หรือ "translate to Korean" ได้เลยค่ะ!*`;

        await ctx.reply(reply);
        await logToTerminal(userId, 'TRANSLATE', `${sourceLang}→${targetLang}: ${text.substring(0, 50)}`);
    } catch (err) {
        console.error('Translation Error:', err);
        ctx.reply(`❌ แปลภาษาไม่สำเร็จค่ะ: ${err.message}`);
    }
};
