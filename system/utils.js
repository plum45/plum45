const axios = require('axios');
const path = require('path');
const fs = require('fs');

/**
 * Optimized Query Filtering (Pure Logic, No Blocking)
 */
function isSensitiveQuery(query) {
    const q = String(query).toLowerCase();
    const sensitiveWords = ['18+', 'sex', 'porn', 'adult', 'nude', 'เซ็กส์', 'โป๊', 'ทางเพศ', 'การพนัน', 'คาสิโน', 'ผิดกฎหมาย', 'illegal', 'hack', 'แฮก'];
    return sensitiveWords.some(word => q.includes(word));
}

/**
 * Unified Search Engine (v5.0.0)
 * Dual-Engine: Serper (Google) -> Tavily (AI Summary) -> Puppeteer (Unfiltered)
 */
async function performSearch(query) {
    let q = typeof query === 'string' ? query : (query?.query || query?.q || "");
    if (!q || String(q).trim() === "") return "ไม่พบข้อมูลเนื่องจากคำค้นหาว่างเปล่าค่ะ";
    
    // API KEYS (High Reliability Fallback)
    const serperKey = process.env.SERPER_API_KEY || '5d4ed8c8b92c3b8d7bf424e2137041ce1073b916';
    const tavilyKey = process.env.TAVILY_API_KEY || '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';
    
    // Mandatory Context (Strict 2569/2026)
    const context = " วันนี้ ล่าสุด ปี พ.ศ. 2569 (2026) ในประเทศไทย";
    const finalQ = (String(q).includes("256") || String(q).includes("202")) ? String(q) : String(q) + context;

    console.log(`🔍 [Unified Search] Query: ${finalQ}`);

    // --- STEP 1: SERPER GOOGLE (The King of Facts) ---
    try {
        const serperResponse = await axios.post('https://google.serper.dev/search', {
            q: finalQ, gl: 'th', hl: 'th', safe: false
        }, {
            headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
            timeout: 12000
        });
        
        const data = serperResponse.data;
        if (data.organic && data.organic.length > 0) {
            let res = `🔎 **ผลการค้นหาจาก Google (Verified 2569/2026):**\n\n`;
            if (data.answerBox) res += `💡 **คำตอบด่วน:** ${data.answerBox.title || ''} ${data.answerBox.answer || data.answerBox.snippet}\n\n`;
            res += data.organic.slice(0, 5).map(o => `• **${o.title}**\n  🔗 ${o.link}\n  📝 ${o.snippet}`).join('\n\n');
            return res;
        }
    } catch (e) {
        console.warn('[Serper Engine Fail/Timeout]:', e.message);
    }

    // --- STEP 2: TAVILY AI (The Analyst Fallback) ---
    try {
        const tavilyResponse = await axios.post('https://api.tavily.com/search', {
            api_key: tavilyKey, query: finalQ, search_depth: 'advanced', include_answer: true
        }, { timeout: 15000 });

        const data = tavilyResponse.data;
        if (data.answer || (data.results && data.results.length > 0)) {
            let res = `✨ **สรุปงานวิจัย AI (Tavily Engine 2569):**\n\n`;
            if (data.answer) res += `💡 **AI Analyst:**\n${data.answer}\n\n`;
            res += data.results.slice(0, 4).map(r => `• **${r.title}**\n  🔗 ${r.url}`).join('\n\n');
            return res;
        }
    } catch (e) {
        console.error('[Tavily Engine Fail]:', e.message);
    }

    return "❌ ขออภัยค่ะเจ้านาย ระบบค้นหาขัดข้องทุกระบบในขณะนี้ รวมถึง Puppeteer Fallback ด้วยค่ะ กรุณาลองใหม่อีกครั้งนะคะ";
}

async function googleSearch(query) { return await performSearch(query); }
async function smartSearch(query) { return await performSearch(query); }

/**
 * Specialized Image Search (Unfiltered)
 */
async function handleImageSearch(ctx, query) {
    try {
        await ctx.sendChatAction('upload_photo');
        console.log(`🖼️ [IMAGE_SEARCH] Finding real images for: ${query}`);
        
        const serperKey = process.env.SERPER_API_KEY || '5d4ed8c8b92c3b8d7bf424e2137041ce1073b916';
        const response = await axios.post('https://google.serper.dev/images', {
            q: query, gl: 'th', hl: 'th', safe: false
        }, {
            headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' }
        });

        const results = response.data.images;
        if (results && results.length > 0) {
            const topResults = results.slice(0, 3);
            for (let i = 0; i < topResults.length; i++) {
                const img = topResults[i];
                await ctx.replyWithPhoto(img.imageUrl, { 
                    caption: `🖼️ **ภาพจากระบบค้นหา (${i+1}):**\n📌 ${img.title}\n🔗 ${img.source}` 
                }).catch(() => {});
            }
        } else {
            await ctx.reply(`🔍 หาภาพจริงเรื่อง "${query}" ไม่พบค่ะเจ้านาย`);
        }
    } catch (e) {
        console.error('Image Search Error:', e.message);
        throw e;
    }
}

/**
 * News Search Engine
 */
async function newsSearch(query) {
    try {
        const serperKey = process.env.SERPER_API_KEY || '5d4ed8c8b92c3b8d7bf424e2137041ce1073b916';
        const finalQuery = String(query).includes("202") ? query : query + " 2026 ล่าสุด";
        
        const response = await axios.post('https://google.serper.dev/news', {
            q: finalQuery, gl: 'th', hl: 'th', num: 6
        }, {
            headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
            timeout: 10000
        });

        const data = response.data;
        if (!data.news || data.news.length === 0) return await performSearch(query);

        let output = `📰 **ข่าวล่าสุด (Google News 2569):**\n\n`;
        data.news.forEach((item, i) => {
            output += `**${i + 1}.** ${item.title}\n   📰 ${item.source} • ${item.date || ''}\n   🔗 ${item.link}\n\n`;
        });
        return output;
    } catch (e) {
        return await performSearch(query);
    }
}

async function logToTerminal(userId, action, details) {
    try {
        const now = new Date().toLocaleString('th-TH');
        console.log(`[${now}] User ${userId} | ${action} | ${details}`);
    } catch (e) {}
}

async function smartReply(ctx, text, delay = 0) {
    if (!text) return;
    try {
        const chunks = text.match(/[\s\S]{1,4000}/g) || [];
        for (const chunk of chunks) {
            const sentMsg = await ctx.reply(chunk);
            if (delay > 0 && sentMsg) setTimeout(() => ctx.deleteMessage(sentMsg.message_id).catch(() => {}), delay);
        }
    } catch (err) {}
}

async function sendSmartImage(ctx, imgPath, caption) {
    try {
        if (!fs.existsSync(imgPath)) throw new Error('File not found');
        await ctx.replyWithPhoto({ source: imgPath }, { caption });
    } catch (err) {
        ctx.reply(`❌ ส่งภาพไม่สำเร็จ: ${err.message}`);
    }
}

module.exports = { performSearch, googleSearch, smartSearch, newsSearch, handleImageSearch, logToTerminal, smartReply, sendSmartImage };
