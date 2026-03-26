const axios = require('axios');
const path = require('path');
const fs = require('fs');

async function googleSearch(query) {
    try {
        let q = typeof query === 'string' ? query : (query?.query || query?.q || "");
        if (!q || String(q).trim() === "") return "ไม่พบข้อมูลเนื่องจากคำค้นหาว่างเปล่าค่ะ";
        
        // STICKY CONTEXT: Always force 2026/2569 and Thailand relevance
        const searchYear = " วันนี้ ล่าสุด ปี พ.ศ. 2569 (2026) ในประเทศไทย";
        const finalQuery = String(q).includes("256") || String(q).includes("202") ? String(q) : String(q) + searchYear;
        
        console.log(`🔍 [Serper Google Search] Finding: ${finalQuery}`);
        
        const serperApiKey = process.env.SERPER_API_KEY || '5d4ed8c8b92c3b8d7bf424e2137041ce1073b916';
        
        const response = await axios.post('https://google.serper.dev/search', {
            q: finalQuery,
            gl: 'th',
            hl: 'th',
            autocorrect: true
        }, {
            headers: { 
                'X-API-KEY': serperApiKey, 
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });

        const data = response.data;
        let summary = `🌐 **ผลการค้นหาจาก Google (Verified via Serper 2569):**\n\n`;
        
        // Answer Box (Direct Answer)
        if (data.answerBox) {
            summary += `💡 **คำตอบโดยตรง:**\n${data.answerBox.title || ""}\n${data.answerBox.answer || data.answerBox.snippet}\n\n`;
        }
        
        // Knowledge Graph
        if (data.knowledgeGraph) {
            summary += `🏛️ **ข้อมูลความรู้:**\n${data.knowledgeGraph.title || ""}\n${data.knowledgeGraph.description}\n\n`;
        }

        // Organic Results
        if (data.organic && data.organic.length > 0) {
            summary += `🔎 **แหล่งข้อมูลอ้างอิง:**\n`;
            summary += data.organic.slice(0, 5).map(r => `• **${r.title}**\n  🔗 ${r.link}\n  📝 ${r.snippet}`).join('\n\n');
        } 
                          
        if (!data.answerBox && !data.knowledgeGraph && (!data.organic || data.organic.length === 0)) {
            console.log("⚠️ Serper returned near-empty results, attempting Tavily fallback...");
            return await performSearch(q);
        }
        
        return summary;
    } catch (e) {
        console.error('Serper Google Search Error:', e.message);
        return await performSearch(query);
    }
}

async function performSearch(query) {
    try {
        let q = typeof query === 'string' ? query : (query?.query || query?.q || "");
        if (!q || String(q).trim() === "") {
            console.error('[performSearch] Query extracted as empty');
            return "ไม่พบข้อมูลเนื่องจากคำค้นหาว่างเปล่าค่ะ";
        }
        
        const tavilyApiKey = process.env.TAVILY_API_KEY || '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';
        const searchYear = " วันนี้ ล่าสุด ปี พ.ศ. 2569 (2026) ในประเทศไทย";
        const finalQuery = String(q).includes("256") || String(q).includes("202") ? String(q) : String(q) + searchYear;
        
        console.log(`[Tavily Search] Query: ${finalQuery}`);
        const response = await axios.post('https://api.tavily.com/search', {
            api_key: tavilyApiKey,
            query: finalQuery,
            search_depth: 'advanced',
            include_answer: true,
            max_results: 10
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000
        });

        const data = response.data;
        let summary = `✨ **สรุปข้อมูลงานวิจัย (Update: 2569/2026):**\n\n`;
        if (data.answer) {
            summary += `💡 **AI Analyst:**\n${data.answer}\n\n`;
        }
        
        if (data.results && data.results.length > 0) {
            summary += `🔎 **แหล่งข้อมูลอ้างอิง:**\n`;
            summary += data.results.map(r => `• **${r.title}**\n  🔗 ${r.url}\n  📝 ${r.content}`).join('\n\n');
        }

        return summary || "ไม่พบข้อมูลที่ต้องการค้นหาค่ะ";
    } catch (e) {
        console.error('Tavily Search Error:', e);
        return "เกิดข้อผิดพลาดในการค้นหาข้อมูลค่ะเจ้านาย";
    }
}

async function handleImageSearch(ctx, query) {
    try {
        await ctx.sendChatAction('upload_photo');
        console.log(`🔍 [IMAGE_SEARCH] Finding real images via Serper for: ${query}`);
        
        const serperApiKey = process.env.SERPER_API_KEY || '5d4ed8c8b92c3b8d7bf424e2137041ce1073b916';
        const response = await axios.post('https://google.serper.dev/images', {
            q: query,
            gl: 'th',
            hl: 'th'
        }, {
            headers: { 'X-API-KEY': serperApiKey, 'Content-Type': 'application/json' }
        });

        const results = response.data.images;
        if (results && results.length > 0) {
            const topResults = results.slice(0, 3);
            for (let i = 0; i < topResults.length; i++) {
                const img = topResults[i];
                await ctx.replyWithPhoto(img.imageUrl, { 
                    caption: `🖼️ **ภาพจากระบบค้นหา (${i+1}):**\n📌 ${img.title}\n🔗 ${img.source}` 
                }).catch(err => {
                    console.warn(`⚠️ Failed to send image ${i+1}:`, err.message);
                });
            }
        } else {
            await ctx.reply(`🔍 หาภาพของจริงเรื่อง "${query}" ไม่พบค่ะเจ้านาย`);
        }
    } catch (e) {
        console.error('Serper Image Search Error:', e.message);
        throw e;
    }
}

async function logToTerminal(userId, action, details) {
    try {
        const now = new Date().toLocaleString('th-TH');
        console.log(`[${now}] User ${userId} | ${action} | ${details}`);
    } catch (e) { console.error('Log Error:', e); }
}

async function smartReply(ctx, text, delay = 0) {
    if (!text) return;
    try {
        let sentMsg;
        if (text.length > 4000) {
            const chunks = text.match(/[\s\S]{1,4000}/g) || [];
            for (const chunk of chunks) {
                sentMsg = await ctx.reply(chunk);
                if (delay > 0 && sentMsg) setTimeout(() => ctx.deleteMessage(sentMsg.message_id).catch(() => {}), delay);
            }
        } else {
            sentMsg = await ctx.reply(text);
            if (delay > 0 && sentMsg) setTimeout(() => ctx.deleteMessage(sentMsg.message_id).catch(() => {}), delay);
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

module.exports = { performSearch, googleSearch, handleImageSearch, logToTerminal, smartReply, sendSmartImage };
