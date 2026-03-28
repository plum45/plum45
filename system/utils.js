const axios = require('axios');
const path = require('path');
const fs = require('fs');

async function googleSearch(query) {
    try {
        let q = typeof query === 'string' ? query : (query?.query || query?.q || "");
        if (!q || String(q).trim() === "") return "ไม่พบข้อมูลเนื่องจากคำค้นหาว่างเปล่าค่ะ";
        
        const searchYear = " วันนี้ ล่าสุด ปี พ.ศ. 2569 (2026) ในประเทศไทย";
        const finalQuery = String(q).includes("256") || String(q).includes("202") ? String(q) : String(q) + searchYear;
        
        const serperApiKey = process.env.SERPER_API_KEY;
        const response = await axios.post('https://google.serper.dev/search', {
            q: finalQuery, gl: 'th', hl: 'th', autocorrect: true
        }, {
            headers: { 'X-API-KEY': serperApiKey, 'Content-Type': 'application/json' },
            timeout: 15000
        });

        const data = response.data;
        let summary = `🌐 **ผลการค้นหาจาก Google (2569):**\n\n`;
        if (data.answerBox) summary += `💡 **คำตอบ:** ${data.answerBox.answer || data.answerBox.snippet}\n\n`;
        if (data.organic && data.organic.length > 0) {
            summary += data.organic.slice(0, 5).map(r => `• **${r.title}**\n  🔗 ${r.link}\n  📝 ${r.snippet}`).join('\n\n');
        } 
        return summary;
    } catch (e) { return await performSearch(query); }
}

async function performSearch(query) {
    try {
        let q = typeof query === 'string' ? query : (query?.query || query?.q || "");
        const tavilyApiKey = process.env.TAVILY_API_KEY;
        const response = await axios.post('https://api.tavily.com/search', {
            api_key: tavilyApiKey, query: q + " 2026", search_depth: 'advanced', include_answer: true, max_results: 10
        }, { timeout: 30000 });

        const data = response.data;
        let summary = `✨ **สรุปข้อมูล (2026):**\n\n`;
        if (data.answer) summary += `💡 **AI:** ${data.answer}\n\n`;
        if (data.results) summary += data.results.map(r => `• **${r.title}**\n  🔗 ${r.url}`).join('\n\n');
        return summary;
    } catch (e) { return "เกิดข้อผิดพลาดในการค้นหาค่ะ"; }
}

async function handleImageSearch(ctx, query) {
    try {
        const serperApiKey = process.env.SERPER_API_KEY;
        const response = await axios.post('https://google.serper.dev/images', { q: query, gl: 'th', hl: 'th' }, {
            headers: { 'X-API-KEY': serperApiKey, 'Content-Type': 'application/json' }
        });
        const results = response.data.images;
        if (results && results.length > 0) {
            for (const img of results.slice(0, 3)) {
                await ctx.replyWithPhoto(img.imageUrl, { caption: `🖼️ **${img.title}**\n🔗 ${img.source}` });
            }
        }
    } catch (e) { throw e; }
}

async function logToTerminal(userId, action, details) {
    console.log(`[${new Date().toLocaleString('th-TH')}] User ${userId} | ${action} | ${details}`);
}

async function smartReply(ctx, text, delay = 0) {
    if (!text) return;
    const sentMsg = await ctx.reply(text);
    if (delay > 0 && sentMsg) setTimeout(() => ctx.deleteMessage(sentMsg.message_id).catch(() => {}), delay);
}

async function sendSmartImage(ctx, imgPath, caption) {
    if (fs.existsSync(imgPath)) await ctx.replyWithPhoto({ source: imgPath }, { caption });
}

async function newsSearch(query) {
    try {
        const serperApiKey = process.env.SERPER_API_KEY;
        const response = await axios.post('https://google.serper.dev/news', { q: query + " 2026", gl: 'th', hl: 'th' }, {
            headers: { 'X-API-KEY': serperApiKey, 'Content-Type': 'application/json' }
        });
        const data = response.data;
        let output = `📰 **ข่าวล่าสุด:**\n\n`;
        data.news.slice(0, 5).forEach(item => output += `• ${item.title}\n  🔗 ${item.link}\n\n`);
        return output;
    } catch (e) { return "ไม่พบข่าวค่ะ"; }
}

module.exports = { performSearch, googleSearch, smartSearch: googleSearch, newsSearch, handleImageSearch, logToTerminal, smartReply, sendSmartImage };
