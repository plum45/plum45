const axios = require('axios');
const path = require('path');
const fs = require('fs');

async function performSearch(query) {
    try {
        console.log(`[Tavily Search] Query: ${query}`);
        const tavilyApiKey = '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';
        
        const response = await axios.post('https://api.tavily.com/search', {
            api_key: tavilyApiKey,
            query: query,
            search_depth: 'basic',
            include_answer: true,
            max_results: 5
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 20000
        });

        const data = response.data;
        
        let summary = '';
        if (data.answer) {
            summary += `💡 **Tavily AI Answer:**\n${data.answer}\n\n`;
        }
        
        if (data.results && data.results.length > 0) {
            summary += `🔎 **Top Search Results:**\n`;
            summary += data.results.map(r => `• **${r.title}**\n  🔗 ${r.url}\n  📝 ${r.content}`).join('\n\n');
        }

        return summary || "ไม่พบข้อมูลที่ต้องการค้นหาค่ะ";
    } catch (e) {
        console.error('Tavily Search Error:', e);
        throw e;
    }
}

async function handleImageSearch(ctx, query) {
    const google = require('googlethis');
    try {
        await ctx.sendChatAction('upload_photo');
        console.log(`🔍 [IMAGE_SEARCH] Finding real images for: ${query}`);
        const results = await google.image(query);
        
        if (results && results.length > 0) {
            const topResults = results.slice(0, 3);
            for (let i = 0; i < topResults.length; i++) {
                const img = topResults[i];
                await ctx.replyWithPhoto(img.url, { 
                    caption: `🖼️ **ภาพจริงจากระบบค้นหา (${i+1}):**\n📌 ${img.origin.title}\n🔗 ${img.url.substring(0, 50)}...` 
                }).catch(err => {
                    console.warn(`⚠️ Failed to send image ${i+1}:`, err.message);
                });
            }
        } else {
            await ctx.reply(`🔍 หนูพยายามหาภาพของจริงเรื่อง "${query}" แล้วแต่ไม่พบผลลัพธ์ที่ชัดเจนเลยค่ะเจ้านาย`);
        }
    } catch (e) {
        console.error('Image Search Error:', e);
        throw e;
    }
}

async function logToTerminal(userId, action, details) {
    try {
        const now = new Date().toLocaleString('th-TH');
        console.log(`[${now}] User ${userId} | ${action} | ${details}`);
    } catch (e) { console.error('Log Error:', e); }
}

async function smartReply(ctx, text) {
    if (!text) return;
    try {
        if (text.length > 4000) {
            const chunks = text.match(/[\s\S]{1,4000}/g) || [];
            for (const chunk of chunks) await ctx.reply(chunk);
        } else {
            await ctx.reply(text);
        }
    } catch (err) { console.error('smartReply Error:', err); }
}

async function sendSmartImage(ctx, imgPath, caption) {
    try {
        if (!fs.existsSync(imgPath)) throw new Error('ไม่พบรูปภาพที่จะส่งค่ะ');
        const stats = fs.statSync(imgPath);
        if (stats.size > 10 * 1024 * 1024) throw new Error('รูปมีขนาดใหญ่เกินไปค่ะ (เกิน 10MB)');
        await ctx.replyWithPhoto({ source: imgPath }, { caption });
    } catch (err) {
        console.error('sendSmartImage Error:', err);
        ctx.reply(`❌ ส่งภาพไม่สำเร็จ: ${err.message}`);
    }
}

module.exports = { performSearch, handleImageSearch, logToTerminal, smartReply, sendSmartImage };
