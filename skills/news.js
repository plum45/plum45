const axios = require('axios');

module.exports = async function handleNewsHeadlines({ ctx, data, userId, logToTerminal }) {
    try {
        const category = data.category || data.query || 'general';
        const country = data.country || 'th';
        const limit = data.limit || 5;

        // Use GNews API (free tier: 100 req/day)
        // Fallback: use Google News RSS
        let articles = [];

        try {
            const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(category)}&hl=th&gl=TH&ceid=TH:th`;
            const res = await axios.get(rssUrl, { timeout: 10000 });
            const xml = res.data;

            // Simple XML parser for RSS
            const itemRegex = /<item>([\s\S]*?)<\/item>/g;
            const titleRegex = /<title>([\s\S]*?)<\/title>/;
            const linkRegex = /<link>([\s\S]*?)<\/link>/;
            const pubDateRegex = /<pubDate>([\s\S]*?)<\/pubDate>/;
            const sourceRegex = /<source[^>]*>([\s\S]*?)<\/source>/;

            let match;
            let count = 0;
            while ((match = itemRegex.exec(xml)) !== null && count < limit) {
                const item = match[1];
                const title = (titleRegex.exec(item) || [])[1] || 'ไม่มีหัวข้อ';
                const link = (linkRegex.exec(item) || [])[1] || '';
                const pubDate = (pubDateRegex.exec(item) || [])[1] || '';
                const source = (sourceRegex.exec(item) || [])[1] || 'Unknown';

                articles.push({
                    title: title.replace(/<!\[CDATA\[|\]\]>/g, '').trim(),
                    link: link.trim(),
                    pubDate: pubDate.trim(),
                    source: source.replace(/<!\[CDATA\[|\]\]>/g, '').trim()
                });
                count++;
            }
        } catch (rssErr) {
            console.error('RSS Fallback Error:', rssErr.message);
        }

        if (articles.length === 0) {
            return ctx.reply('❌ ไม่พบข่าวในหมวดที่ระบุค่ะ ลองเปลี่ยนคำค้นหาดูนะคะ');
        }

        const categoryEmojis = {
            'general': '📰', 'technology': '💻', 'business': '💼',
            'sports': '⚽', 'entertainment': '🎬', 'health': '🏥',
            'science': '🔬', 'ไทย': '🇹🇭', 'เทคโนโลยี': '💻',
            'กีฬา': '⚽', 'บันเทิง': '🎬', 'การเงิน': '💰'
        };
        const emoji = categoryEmojis[category.toLowerCase()] || '📰';

        let reply = `${emoji} **ข่าวด่วนวันนี้: "${category}"**\n\n`;
        articles.forEach((a, i) => {
            reply += `**${i + 1}.** ${a.title}\n`;
            reply += `   📌 ${a.source} | 🕒 ${a.pubDate}\n`;
            reply += `   🔗 ${a.link}\n\n`;
        });

        reply += `💡 *ลองถาม "ข่าวเทคโนโลยี" หรือ "ข่าว Bitcoin" ดูนะคะ!*`;

        await ctx.reply(reply);
        await logToTerminal(userId, 'NEWS', `Fetched ${articles.length} articles for "${category}"`);
    } catch (err) {
        console.error('News Error:', err);
        ctx.reply(`❌ ไม่สามารถดึงข่าวได้ค่ะ: ${err.message}`);
    }
};
