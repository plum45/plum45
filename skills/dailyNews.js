const axios = require('axios');
const cron = require('node-cron');

let scheduledJobs = {};

/**
 * Daily Auto-News Scheduler
 * ส่งข่าวสารอัตโนมัติทุกวันตามเวลาที่ตั้งไว้
 */

function parseRSS(xml, limit = 5) {
    const articles = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const titleRegex = /<title>([\s\S]*?)<\/title>/;
    const linkRegex = /<link>([\s\S]*?)<\/link>/;
    const pubDateRegex = /<pubDate>([\s\S]*?)<\/pubDate>/;
    const sourceRegex = /<source[^>]*>([\s\S]*?)<\/source>/;

    let match;
    let count = 0;
    while ((match = itemRegex.exec(xml)) !== null && count < limit) {
        const item = match[1];
        const title = (titleRegex.exec(item) || [])[1] || '';
        const link = (linkRegex.exec(item) || [])[1] || '';
        const pubDate = (pubDateRegex.exec(item) || [])[1] || '';
        const source = (sourceRegex.exec(item) || [])[1] || '';

        articles.push({
            title: title.replace(/<!\[CDATA\[|\]\]>/g, '').trim(),
            link: link.trim(),
            pubDate: pubDate.trim(),
            source: source.replace(/<!\[CDATA\[|\]\]>/g, '').trim()
        });
        count++;
    }
    return articles;
}

async function fetchNews(categories = ['ข่าวไทยวันนี้', 'technology', 'business']) {
    const allNews = {};
    
    for (const cat of categories) {
        try {
            const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(cat)}&hl=th&gl=TH&ceid=TH:th`;
            const res = await axios.get(rssUrl, { timeout: 10000 });
            allNews[cat] = parseRSS(res.data, 3);
        } catch (err) {
            console.error(`[DailyNews] Failed to fetch "${cat}":`, err.message);
            allNews[cat] = [];
        }
    }
    return allNews;
}

function buildNewsMessage(allNews) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dayNames = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

    let msg = `📰✨ **สวัสดีค่ะเจ้านาย! ข่าวประจำวัน${dayNames[now.getDay()]}**\n`;
    msg += `📅 ${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} | 🕒 ${pad(now.getHours())}:${pad(now.getMinutes())} น.\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    const catEmojis = {
        'ข่าวไทยวันนี้': '🇹🇭 ข่าวไทย',
        'technology': '💻 เทคโนโลยี',
        'business': '💼 ธุรกิจ',
        'entertainment': '🎬 บันเทิง',
        'sports': '⚽ กีฬา',
        'crypto': '₿ คริปโต',
        'AI': '🤖 AI/ปัญญาประดิษฐ์',
        'gaming': '🎮 เกม'
    };

    for (const [cat, articles] of Object.entries(allNews)) {
        const catName = catEmojis[cat] || `📌 ${cat}`;
        msg += `**${catName}**\n`;
        
        if (articles.length === 0) {
            msg += `  ไม่พบข่าวในหมวดนี้ค่ะ\n\n`;
            continue;
        }

        articles.forEach((a, i) => {
            msg += `  ${i + 1}. ${a.title}\n`;
            if (a.source) msg += `     📌 ${a.source}\n`;
        });
        msg += `\n`;
    }

    // Add motivational closing
    const closings = [
        '💪 ขอให้เจ้านายมีวันที่ดีนะคะ!',
        '🌟 วันนี้จะเป็นวันที่ดีแน่นอนค่ะ!',
        '🚀 พร้อมลุยงานกันเลยค่ะเจ้านาย!',
        '☕ อย่าลืมพักดื่มกาแฟด้วยนะคะ!',
        '🎯 โฟกัสกับเป้าหมายวันนี้นะคะ!',
        '💖 หนูพร้อมช่วยเจ้านายเสมอค่ะ!'
    ];
    msg += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += closings[Math.floor(Math.random() * closings.length)] + '\n';
    msg += `🤖 *Stacy Daily News — แจ้งเตือนอัตโนมัติ*`;

    return msg;
}

/**
 * Start daily scheduled news for a specific user/chat
 * @param {Object} bot - Telegraf bot instance
 * @param {string|number} chatId - Telegram chat ID
 * @param {string} cronTime - Cron expression (default: every day at 20:30)
 * @param {string[]} categories - News categories to fetch
 */
function startDailyNews(bot, chatId, cronTime = '30 20 * * *', categories = ['ข่าวไทยวันนี้', 'technology', 'AI']) {
    const jobKey = `news_${chatId}`;

    // Stop existing job if any
    if (scheduledJobs[jobKey]) {
        scheduledJobs[jobKey].stop();
        console.log(`[DailyNews] Stopped existing job for ${chatId}`);
    }

    const job = cron.schedule(cronTime, async () => {
        console.log(`[DailyNews] Sending daily news to ${chatId}...`);
        try {
            const allNews = await fetchNews(categories);
            const message = buildNewsMessage(allNews);
            
            // Split message if too long (Telegram limit: 4096 chars)
            if (message.length > 4000) {
                const parts = message.match(/[\s\S]{1,4000}/g) || [message];
                for (const part of parts) {
                    await bot.telegram.sendMessage(chatId, part, { parse_mode: 'Markdown' }).catch(() => {
                        bot.telegram.sendMessage(chatId, part); // retry without markdown
                    });
                }
            } else {
                await bot.telegram.sendMessage(chatId, message, { parse_mode: 'Markdown' }).catch(() => {
                    bot.telegram.sendMessage(chatId, message);
                });
            }
            console.log(`[DailyNews] ✅ Delivered to ${chatId}`);
        } catch (err) {
            console.error(`[DailyNews] ❌ Failed for ${chatId}:`, err.message);
        }
    }, { timezone: 'Asia/Bangkok' });

    scheduledJobs[jobKey] = job;
    console.log(`[DailyNews] 📰 Scheduled daily news for ${chatId} at cron: ${cronTime} (Asia/Bangkok)`);
    return job;
}

/**
 * Stop daily news for a specific chat
 */
function stopDailyNews(chatId) {
    const jobKey = `news_${chatId}`;
    if (scheduledJobs[jobKey]) {
        scheduledJobs[jobKey].stop();
        delete scheduledJobs[jobKey];
        console.log(`[DailyNews] Stopped for ${chatId}`);
        return true;
    }
    return false;
}

/**
 * Get status of all scheduled jobs
 */
function getScheduledJobs() {
    return Object.keys(scheduledJobs).map(key => ({
        key,
        running: scheduledJobs[key].running || true
    }));
}

/**
 * Handle DAILY_NEWS action from the bot
 */
async function handleDailyNewsAction({ ctx, data, bot, userId, logToTerminal }) {
    try {
        const action = data.action || 'start';
        const chatId = ctx.chat.id;

        if (action === 'stop') {
            const stopped = stopDailyNews(chatId);
            if (stopped) {
                ctx.reply('🔕 **ปิดระบบข่าวอัตโนมัติเรียบร้อยค่ะ!**\n\n💡 *บอกหนู "เปิดข่าวรายวัน" เมื่อต้องการเปิดใหม่นะคะ*');
            } else {
                ctx.reply('❓ ยังไม่ได้เปิดระบบข่าวอัตโนมัติค่ะ');
            }
            return;
        }

        if (action === 'now') {
            // Send immediately
            const categories = data.categories || ['ข่าวไทยวันนี้', 'technology', 'AI'];
            const allNews = await fetchNews(categories);
            const message = buildNewsMessage(allNews);
            await ctx.reply(message, { parse_mode: 'Markdown' }).catch(() => ctx.reply(message));
            await logToTerminal(userId, 'DAILY_NEWS', 'Instant news delivered');
            return;
        }

        // Default: start scheduled
        const cronTime = data.time || '30 20 * * *'; // Default 20:30 every day
        const categories = data.categories || ['ข่าวไทยวันนี้', 'technology', 'AI'];

        startDailyNews(bot, chatId, cronTime, categories);

        const timeMatch = cronTime.match(/^(\d+)\s+(\d+)/);
        const displayTime = timeMatch ? `${timeMatch[2].padStart(2, '0')}:${timeMatch[1].padStart(2, '0')}` : cronTime;

        const catLabels = {
            'ข่าวไทยวันนี้': '🇹🇭 ข่าวไทย', 'technology': '💻 เทคโนโลยี',
            'AI': '🤖 AI', 'business': '💼 ธุรกิจ', 'entertainment': '🎬 บันเทิง',
            'sports': '⚽ กีฬา', 'crypto': '₿ คริปโต', 'gaming': '🎮 เกม'
        };

        let reply = `📰✅ **เปิดระบบข่าวอัตโนมัติเรียบร้อยค่ะ!**\n\n`;
        reply += `⏰ **เวลาส่ง:** ทุกวัน ${displayTime} น.\n`;
        reply += `📌 **หมวดข่าว:**\n`;
        categories.forEach(c => { reply += `  • ${catLabels[c] || c}\n`; });
        reply += `\n💡 *หนูจะส่งข่าวสำคัญมาให้เจ้านายอ่านทุกวันตามเวลานี้นะคะ!*\n`;
        reply += `🔕 *บอก "ปิดข่าวรายวัน" เมื่อต้องการหยุดค่ะ*`;

        await ctx.reply(reply);
        await logToTerminal(userId, 'DAILY_NEWS', `Scheduled at ${displayTime} for ${categories.join(', ')}`);
    } catch (err) {
        console.error('DailyNews Action Error:', err);
        ctx.reply(`❌ ตั้งค่าข่าวรายวันไม่สำเร็จค่ะ: ${err.message}`);
    }
}

module.exports = { startDailyNews, stopDailyNews, getScheduledJobs, handleDailyNewsAction, fetchNews, buildNewsMessage };
