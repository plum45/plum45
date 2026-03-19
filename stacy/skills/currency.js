const axios = require('axios');

module.exports = async function handleCurrencyExchange({ ctx, data, userId, logToTerminal }) {
    try {
        const amount = parseFloat(data.amount) || 1;
        const from = (data.from || 'USD').toUpperCase();
        const to = (data.to || 'THB').toUpperCase();

        // Free exchange rate API
        const res = await axios.get(`https://api.exchangerate-api.com/v4/latest/${from}`);
        const rate = res.data.rates[to];

        if (!rate) {
            return ctx.reply(`❌ ไม่พบอัตราแลกเปลี่ยนสำหรับ ${to} ค่ะ`);
        }

        const result = (amount * rate).toFixed(2);
        const flagMap = {
            'USD': '🇺🇸', 'THB': '🇹🇭', 'EUR': '🇪🇺', 'GBP': '🇬🇧', 'JPY': '🇯🇵',
            'CNY': '🇨🇳', 'KRW': '🇰🇷', 'SGD': '🇸🇬', 'MYR': '🇲🇾', 'AUD': '🇦🇺',
            'CAD': '🇨🇦', 'CHF': '🇨🇭', 'HKD': '🇭🇰', 'TWD': '🇹🇼', 'BTC': '₿'
        };

        const fromFlag = flagMap[from] || '💰';
        const toFlag = flagMap[to] || '💰';

        const reply = `💱 **อัตราแลกเปลี่ยนเรียลไทม์**\n\n` +
            `${fromFlag} ${amount.toLocaleString()} **${from}**\n` +
            `⬇️ แลกเป็น\n` +
            `${toFlag} **${parseFloat(result).toLocaleString()} ${to}**\n\n` +
            `📊 **อัตรา:** 1 ${from} = ${rate.toFixed(4)} ${to}\n` +
            `🕒 **ข้อมูลล่าสุด:** ${res.data.date}\n\n` +
            `💡 *ลองถามหนู "แปลง 1000 บาท เป็น เยน" หรือ "100 USD to THB" ได้เลยค่ะ!*`;

        await ctx.reply(reply);
        await logToTerminal(userId, 'CURRENCY', `${amount} ${from} → ${result} ${to}`);
    } catch (err) {
        console.error('Currency Error:', err);
        ctx.reply(`❌ ไม่สามารถดึงอัตราแลกเปลี่ยนได้ค่ะ: ${err.message}`);
    }
};
