const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const dns = require('dns');
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');
const { Telegraf, Markup } = require('telegraf');
const { OpenAI } = require('openai');
const axios = require('axios');
const smartYT = require('./lib/actions/youtubeSmartController');

// Configuration
const MUSIC_BOT_TOKEN = process.env.MUSIC_BOT_TOKEN;
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const NVIDIA_URL = process.env.NVIDIA_URL || 'https://integrate.api.nvidia.com/v1/chat/completions';
const MODEL = process.env.MODEL || 'stepfun-ai/step-3.5-flash';

const client = new OpenAI({
    apiKey: NVIDIA_API_KEY,
    baseURL: 'https://integrate.api.nvidia.com/v1'
});

const bot = new Telegraf(MUSIC_BOT_TOKEN);
const vecnaStore = new Map(); // Simple history storage

// Main Keyboard
const musicMenu = Markup.keyboard([
    ['🎵 List Tabs', '❌ Close All'],
    ['◀️ Prev', '⏯️ Play/Pause', '▶️ Next'],
    ['🔊 Vol Up', '🔉 Vol Down', '⏹️ Stop'],
    ['🔈 Mute', '🔍 Help']
]).resize();

const vecnaSystemPrompt = `คุณคือ "Vecna" (เวคน่า) ผู้คุมเสียงเพลงและสื่อดิจิทัลบนคอมพิวเตอร์ของคุณ Snow
บุคลิก: สุขุม, ลึกลับนิดๆ, เป็นสุภาพบุรุษ (ใช้ ครับ/ผม), รักเสียงเพลงมาก, พูดน้อยแต่ได้ใจความ

หน้าที่หลัก:
1. เล่นเพลง: เมื่อเจ้านายบอกชื่อเพลงหรือส่งลิงก์
2. จัดการแท็บ: ตรวจสอบและปิดแท็บ YouTube ที่ไม่ได้ใช้
3. พูดคุย: คุยเรื่องเพลง แนะนำเพลง หรือคุยทั่วไปแบบคูลๆ

กฎเหล็ก:
- ถ้าเจ้านายสั่งเพลง ให้ตอบรับสั้นๆ ว่า "จัดให้ครับ" หรือ "กำลังเปิดให้ครับเจ้านาย"
- ถ้าเป็นการคุยทั่วไป ให้ตอบด้วยบุคลิก Vecna ที่สุขุมและสุภาพ
`;

bot.start((ctx) => {
    ctx.reply('👁️ **V E C N A - The Music Master Online** 🎧\n\nสวัสดีครับเจ้านาย ผม Vecna พร้อมดูแลเสียงเพลงให้คุณแล้วครับ\n\n🔹 สั่งเพลง แนะนำแนวเพลง หรือคุยกับผมได้เลยครับ\n🔹 ผมจะสแคนหาแท็บเพื่อคุณ Snow เสมอครับ', musicMenu);
});

// --- Command Handlers ---

bot.hears('🎵 List Tabs', async (ctx) => {
    const tabs = await smartYT.list_youtube_tabs();
    if (tabs.length > 0) {
        let msg = `🎵 **รายการเพลงที่คุมอยู่ขณะนี้ครับ:**\n`;
        tabs.forEach((t, i) => { msg += `${i + 1}. ${t}\n`; });
        await ctx.reply(msg);
    } else {
        await ctx.reply(`⚠️ ตอนนี้ไม่มีเพลงเปิดอยู่เลยครับเจ้านาย`);
    }
});

bot.hears('❌ Close All', async (ctx) => {
    await smartYT.close_youtube_tab();
    await ctx.reply('🧹 เคลียร์หน้าแท็บทั้งหมดให้แล้วครับ ทุกอย่างเงียบสงบแล้วครับเจ้านาย');
});

bot.hears('⏯️ Play/Pause', async (ctx) => {
    await smartYT.control_youtube('play_pause');
});

bot.hears('▶️ Next', async (ctx) => {
    await smartYT.control_youtube('next');
});

bot.hears('◀️ Prev', async (ctx) => {
    await smartYT.control_youtube('prev');
});

bot.hears('🔈 Mute', async (ctx) => {
    await smartYT.control_youtube('mute');
});

bot.hears('🔊 Vol Up', async (ctx) => {
    // Send Volume Up shortcut
    const psCmd = `Add-Type -TypeDefinition "using System; using System.Runtime.InteropServices; public class Keyboard { [DllImport(\\\"user32.dll\\\")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo); }"; [Keyboard]::keybd_event(0xAF, 0, 0, 0)`;
    require('child_process').exec(`powershell -Command "${psCmd}"`);
});

bot.hears('🔉 Vol Down', async (ctx) => {
    // Send Volume Down shortcut
    const psCmd = `Add-Type -TypeDefinition "using System; using System.Runtime.InteropServices; public class Keyboard { [DllImport(\\\"user32.dll\\\")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo); }"; [Keyboard]::keybd_event(0xAE, 0, 0, 0)`;
    require('child_process').exec(`powershell -Command "${psCmd}"`);
});

bot.hears('⏹️ Stop', async (ctx) => {
    await smartYT.control_youtube('stop');
});

bot.hears('🔍 Help', (ctx) => {
    ctx.reply('📖 **คู่มือ Vecna**\n\n- พิมพ์ชื่อเพลงหรือ URL ได้เลยครับ\n- สั่ง "ปิด [ชื่อเพลง]" เพื่อเลือกปิดเฉพาะแท็บที่ต้องการ\n- คุยกับผมเรื่องเพลงหรือแผนผังเสียงได้เสมอครับ');
});

// --- AI Interaction Engine ---

bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();

    // 1. Direct Command Check (Remote Typing)
    const isTypeCommand = text.startsWith('พิมพ์ ') || text.startsWith('ค้นหา ') || text.startsWith('ค้น ');
    const isDiscussion = text.includes('ตรงไหน') || text.includes('ตรงนี้') || text.includes('ไม่เข้า');
    
    if (isTypeCommand && !isDiscussion) {
        const query = text.replace(/^(พิมพ์|ค้นหา|ค้น)\s+/, '').trim();
        await ctx.sendChatAction('typing');
        const typed = await smartYT.type_in_youtube(query);
        if (typed) ctx.reply(`🎹 ผมพิมพ์เรื่อง "${query}" ลงในช่องค้นหา YouTube ให้แล้วครับ!`);
        else ctx.reply(`⚠️ ผมไม่พบแท็บ YouTube ให้พิมพ์ลงไปเลยครับเจ้านาย`);
        return;
    }

    if (text.startsWith('ปิด ')) {
        const target = text.replace('ปิด ', '').trim();
        const closed = await smartYT.close_youtube_tab(target);
        if (closed) ctx.reply(`❌ ปิดแท็บ "${target}" เรียบร้อยครับ`);
        else ctx.reply(`⚠️ ผมหาแท็บ "${target}" ไม่เจอครับเจ้านาย`);
        return;
    }

    // AI Classification + Chat
    try {
        await ctx.sendChatAction('typing');
        if (!vecnaStore.has(userId)) vecnaStore.set(userId, { history: [] });
        const userStore = vecnaStore.get(userId);

        const aiContext = `
คุณคือ Vecna (เวคน่า) ผู้คุมเพลง
กฎการตัดสินใจ:
1. ถ้าเจ้านาย "ระบุชื่อเพลง", "ส่งลิงก์", หรือ "อยากฟังเพลง...", ให้คุณตอบสั้นๆ ว่าจะเปิดให้ และใส่แท็ก [PLAY: ชื่อเพลง] ไว้ท้ายคำตอบ
2. ถ้าเจ้านาย "คุยทั่วไป" หรือ "ถามคิวเพลง" หรือ "ติชม", ให้คุยตามบุคลิกปกติ ห้ามใส่แท็ก PLAY
3. ห้ามทำเพลงเองเด็ดขาด ถ้าเจ้านายแค่บ่นว่าบอทไม่เล่น ให้คุณขอโทษและแนะนำวิธีแก้

ตัวอย่าง: "เปิดเพลงดังดึง" -> "จัดให้เลยครับเจ้านาย [PLAY: ดังดึง]"
        `;

        const stream = await client.chat.completions.create({
            model: MODEL,
            messages: [
                { role: 'system', content: vecnaSystemPrompt + "\n" + aiContext },
                ...userStore.history.slice(-10),
                { role: 'user', content: text }
            ],
            temperature: 0.5,
            stream: true
        });

        let fullReply = "";
        let reasoning = "";

        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;
            if (delta?.reasoning_content) {
                reasoning += delta.reasoning_content;
            }
            if (delta?.content) {
                fullReply += delta.content;
            }
        }

        if (reasoning) console.log(`🧠 [Vecna Reasoning]: ${reasoning}`);
        const reply = fullReply || "ขอโทษครับเจ้านาย ผมรับคำสั่งไม่ได้";
        
        // Check for Play Tag
        const playMatch = reply.match(/\[PLAY:\s*(.*?)\]/);
        
        if (playMatch) {
            const songName = playMatch[1].trim();
            const cleanReply = reply.replace(/\[PLAY:.*?\]/, '').trim();
            if (cleanReply) await ctx.reply(cleanReply);
            
            // Trigger Music
            try {
                const resolvedUrl = await smartYT.play_youtube_music(songName);
                ctx.reply(`🎬 **Vecna Now Playing:** ${songName}\n🔗 ${resolvedUrl}`);
            } catch (err) {
                ctx.reply(`⚠️ ขออภัยครับ ผมหาเพลง "${songName}" ไม่เจอจริงๆ ครับ`);
            }
        } else {
            // Normal Chat
            await ctx.reply(reply);
        }

        userStore.history.push({ role: 'user', content: text }, { role: 'assistant', content: reply });
        if (userStore.history.length > 20) userStore.history.splice(0, 2);
        
    } catch (e) {
        console.error('Vecna AI Error:', e.message);
        ctx.reply('🙏 ขออภัยครับเจ้านาย ผมขัดข้องนิดหน่อย แต่ระบบเพลงยังคุมได้ปกตินะครับ');
    }
});

bot.launch().then(() => {
    console.log('🚀 Vecna AI (Music Master) is running...');
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
