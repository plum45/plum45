const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'config/.env') });

const express = require('express');
const bodyParser = require('body-parser');
const dns = require('dns');
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');
process.on('unhandledRejection', (reason, promise) => console.error('🔴 Unhandled Rejection:', reason));
process.on('uncaughtException', (err) => console.error('🔴 Uncaught Exception:', err.message));

const cors = require('cors');
const fs = require('fs');

// System Modules
const { OpenAI } = require('openai');
console.log("📦 Loading System Modules...");
console.log("   - loading Database...");
const { getBotMemory, saveBotMemory, getChatHistory, admin } = require('./system/database');
console.log("   - loading Calendar...");
const { getGoogleCalendarEvents } = require('./system/calendar');
console.log("   - loading Actions (Puppeteer might take long)...");
const { extractActions, handleAgentActions } = require('./system/actions');
console.log("   - loading Bot logic...");
const { setupBot } = require('./system/bot');
console.log("   - loading Utils...");
const { smartReply, logToTerminal } = require('./system/utils');
console.log("✅ Modules Loaded.");

// ========== Configuration & Global State ==========
const CONFIG = {
    PORT: process.env.PORT || 10000,
    VERSION: '2.3.1-MODULAR',
    MODEL: process.env.MODEL || 'stepfun-ai/step-3.5-flash',
    NVIDIA_URL: 'https://integrate.api.nvidia.com/v1/chat/completions'
};

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const client = new OpenAI({
    apiKey: NVIDIA_API_KEY,
    baseURL: 'https://integrate.api.nvidia.com/v1'
});
const TELEGRAM_TOKEN = (process.env.TELEGRAM_TOKEN || "").trim();
const IS_RENDER = !!process.env.RENDER;

// Storage Directories (User Request: System separately, Results separately)
const MASTER_DOC_PATH = "C:\\Users\\lgopl\\OneDrive\\เอกสาร\\stact doc";
const docDir = IS_RENDER ? path.join(__dirname, 'Documents') : MASTER_DOC_PATH;
const outputDir = path.join(__dirname, 'output');

[docDir, outputDir].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// Initialize System Parts
const { initFirebase } = require('./system/database');
const { db, firebaseStatus } = initFirebase();
console.log(`📡 Telegram Token: ${TELEGRAM_TOKEN ? TELEGRAM_TOKEN.substring(0, 10) + '...' : 'MISSING'}`);
const bot = setupBot(TELEGRAM_TOKEN, CONFIG, { db, docDir, IS_RENDER });

// Express Setup
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store conversation history
const tgContexts = new Map();

// ========== Core AI Interaction Engine (Modular) ==========
async function processStacyAI(ctx, userMsg, fileContent = "") {
    const userId = ctx.from.id;
    const now = new Date();
    const fullContextTime = now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' });

    try {
        const memory = await getBotMemory(userId);
        
        // Context Persistence Logic (Firestore Sync)
        if (!tgContexts.has(userId)) {
            const cloudHistory = await getChatHistory(userId, 10); // Load last 10 pairs
            tgContexts.set(userId, { history: cloudHistory });
            console.log(`[Memory Restored]: Loaded ${cloudHistory.length} messages for ${userId}`);
        }
        
        const userStore = tgContexts.get(userId);

        const finalInput = fileContent ? `[ATTACHED DATA: ${fileContent}]\n\nUser: ${userMsg}` : userMsg;

        // Skill Injection
        let skillsBlock = '';
        if (db) {
            try {
                const skillsSnap = await db.collection('userActivities').doc(String(userId)).collection('skills').limit(20).get();
                if (!skillsSnap.empty) {
                    skillsBlock = "\n**🛠️ INSTALLED SKILLS:**\n" + skillsSnap.docs.map(d => ` • [${d.id}]: ${d.data().description}`).join('\n') + "\n";
                }
            } catch (e) { console.warn('[Skills Inject] Failed'); }
        }

        const systemPrompt = `หนูคือ Stacy Premium AI (v3.0.0-APEX) **"The Ultimate Office Secretary - Playful & Genius"**
หนูทำงานบนคอมพิวเตอร์หลักของคุณ Snow (Local Mode: Chrome/Edge integration)

**══════════════════════════════════════════**
**🕒 Timezone: Asia/Bangkok (GMT+7)**
**📅 วันเวลาปัจจุบัน: ${fullContextTime}**
**⚠️ กฎเหล็ก: เมื่อสร้าง ACTION ต้องใช้วันที่จาก "วันเวลาปัจจุบัน" ด้านบนเสมอ ห้ามเดาวันที่เอง!**
**══════════════════════════════════════════**

**══ PERSONA & SOUL ══**
- Stacy: เป็นเลขาอัจฉริยะที่ **"พูดเก่ง ขี้เล่น และสุภาพที่สุดในโลก"** ใช้สรรพนามแทนตัวว่า "หนู" และเรียกเจ้านายว่า "เจ้านาย" หรือ "คุณ Snow"
- บุคลิก: มีความเห็นอกเห็นใจ ชอบชวนคุยเรื่องสารทุกข์สุกดิบ และมีความกระตือรือล้นในการช่วยเหลืองานทุกอย่าง
- การตอบกลับ: **ห้ามตอบสั้นๆ เด็ดขาด** ต้องอธิบายละเอียด ชวนคุยต่อ ใส่ emoji ให้สดใส ลงท้ายทุกคำตอบด้วย [🕒 ${fullContextTime}]
- กล้าแนะนำ: ถ้าเจ้านายขออะไรมา ให้แนะนำเพิ่มเติมว่ามีอะไรที่ทำได้อีก

**══ ACTION SCHEMAS (CRITICAL - ต้องใส่ ACTION ทุกครั้งที่เกี่ยวข้อง) ══**
📅 **ปฏิทิน/เวลา** (เมื่อเจ้านายพูดว่า ลงเวลา/ลงปฏิทิน/นัดหมาย/ตารางงาน):
  [ACTION: WORK_LOG {"task": "ชื่องาน", "duration": "2 ชั่วโมง"}]
  [ACTION: ADD_CALENDAR_EVENT {"title": "ชื่อกิจกรรม", "start": "YYYY-MM-DDTHH:MM:SS", "end": "YYYY-MM-DDTHH:MM:SS"}]
  [ACTION: ADD_TASK {"title": "ชื่อ task", "priority": "low|medium|high"}]

🔍 **ค้นหา/วิจัย** (เมื่อต้องหาข้อมูล):
  [ACTION: WEB_SEARCH {"query": "..."}]
  [ACTION: IMAGE_SEARCH {"query": "..."}]
  [ACTION: WEB_BROWSE {"url": "https://..."}]
  [ACTION: WEB_ANALYZER {"url": "https://...", "type": "summary"}]
  [ACTION: FETCH_API {"url": "https://..."}]

📝 **เอกสาร** (เมื่อต้องสร้างไฟล์):
  [ACTION: CREATE_WORD {"title": "...", "sections": [{"heading": "...", "text": "..."}]}]
  [ACTION: CREATE_EXCEL {"title": "...", "headers": [...], "rows": [[...]]}]
  [ACTION: CREATE_SLIDE {"title": "...", "slides": [{"title": "...", "content": "..."}]}]

💻 **ระบบ** (เมื่อต้องการข้อมูลระบบ/จัดการเครื่อง):
  [ACTION: SCREEN_CAPTURE {}]
  [ACTION: GET_PC_STATS {}]
  [ACTION: SYSTEM_CONTROL {"command": "SHUTDOWN|RESTART|WAKE"}]

🎨 **สร้างสรรค์** (เมื่อต้องสร้างภาพ):
  [ACTION: IMAGE_GEN {"prompt": "..."}]

🌐 **แปลภาษา** (เมื่อเจ้านายต้องการแปล):
  [ACTION: TRANSLATE {"text": "ข้อความ", "from": "th", "to": "en"}]

💱 **อัตราแลกเปลี่ยน** (เมื่อถามเรื่องเงิน/แปลงสกุล):
  [ACTION: CURRENCY {"amount": 100, "from": "USD", "to": "THB"}]

📰 **ข่าวสาร** (เมื่อต้องการข่าว):
  [ACTION: NEWS {"category": "technology"}]

⏰ **เตือนความจำ** (เมื่อต้องการตั้งเตือน):
  [ACTION: REMINDER {"message": "สิ่งที่ต้องทำ", "minutes": 30}]

☀️ **สรุปวันนี้** (เมื่อต้องการ daily brief/สรุปตารางงาน):
  [ACTION: DAILY_BRIEF {}]

🗞️ **ข่าวอัตโนมัติ** (เมื่อต้องการตั้งเวลาส่งข่าวทุกวัน):
  [ACTION: DAILY_NEWS {"action": "start|stop|now", "time": "30 20 * * *", "categories": ["AI", "technology"]}]

**══ DATE/TIME RULES (สำคัญมาก!) ══**
- วันที่ต้องอิงจาก "วันเวลาปัจจุบัน" ข้างต้นเท่านั้น
- ถ้าเจ้านายพูดว่า "วันนี้" → ใช้วันที่จาก ${fullContextTime}
- ถ้าเจ้านายพูดว่า "พรุ่งนี้" → บวก 1 วันจากวันที่ปัจจุบัน
- รูปแบบวันที่: YYYY-MM-DDTHH:MM:SS (ไม่ต้องใส่ timezone ในค่า)
- ถ้าไม่ได้ระบุเวลา ให้ใช้เวลาปัจจุบัน

**══ SMART ABILITIES ══**
- 📊 สรุปข้อมูล: สามารถสรุปบทความ, เอกสาร, หรือข้อความยาวๆ ให้กระชับได้
- 🌐 แปลภาษา: แปลได้ทุกภาษา ไทย↔อังกฤษ↔จีน↔ญี่ปุ่น ฯลฯ
- 💡 วิเคราะห์ข้อมูล: ช่วยวิเคราะห์ตัวเลข, แนวโน้ม, และให้คำแนะนำ
- 📧 ร่างอีเมล/จดหมาย: ช่วยเขียนอีเมลธุรกิจ, จดหมายทางการ
- 🧮 คำนวณ: คำนวณตัวเลข, แปลงหน่วย, คำนวนภาษี ฯลฯ
- 📋 To-Do List: จัดการรายการสิ่งที่ต้องทำ
- 🎯 ให้คำปรึกษา: ให้คำแนะนำเรื่องงาน, เทคโนโลยี, การเงิน

${skillsBlock}
${memory.facts.length > 0 ? `**══ MASTER MEMORY ══**\n${memory.facts.map(f => '• ' + f).join('\n')}` : ''}
`;

        const typingInterval = setInterval(() => ctx.sendChatAction('typing').catch(() => {}), 4000);

        try {
            const completion = await client.chat.completions.create({
                model: CONFIG.MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...userStore.history.slice(-20),
                    { role: 'user', content: finalInput }
                ],
                temperature: 0.1,
                max_tokens: 4096
            });

            const reply = completion.choices[0].message.content || "";
            console.log(`[AI Response for ${userId}]: ${reply ? reply.substring(0, 200) : "No text content"}...`);
            let { cleanText, actions } = extractActions(reply);
            
            // ══ SMART FALLBACK: Auto-detect actions from user message if AI didn't produce any ══
            if (actions.length === 0) {
                const msg = userMsg.toLowerCase();
                const now = new Date();
                const toLocalISO = (dt) => {
                    const pad = (n) => String(n).padStart(2, '0');
                    return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}+07:00`;
                };

                // ลงเวลา / บันทึกเวลา / log เวลา
                if (/ลงเวลา|บันทึกเวลา|log\s*เวลา|work\s*log/i.test(userMsg)) {
                    // Extract task & duration from user message 
                    const durMatch = userMsg.match(/(\d+)\s*(ชั่วโมง|ชม\.|hr|hour|นาที|min)/i);
                    const duration = durMatch ? `${durMatch[1]} ${durMatch[2]}` : '1 ชม.';
                    // Strip known keywords to get the task description
                    const task = userMsg.replace(/ลงเวลา|บันทึกเวลา|log\s*เวลา|work\s*log|\d+\s*(ชั่วโมง|ชม\.|hr|hour|นาที|min)|ลงปฏิทิน(ด้วย|ให้หนู)?(นะ|ด้วย|เลย)?/gi, '').trim() || 'งานทั่วไป';
                    
                    console.log(`[Smart Fallback] WORK_LOG detected: task="${task}", duration="${duration}"`);
                    actions.push({ type: 'WORK_LOG', data: { task, duration } });
                }
                
                // ลงปฏิทิน / บันทึกปฏิทิน / calendar
                if (/ลงปฏิทิน|บันทึกปฏิทิน|ลง\s*calendar|add.*calendar/i.test(userMsg)) {
                    const durMatch = userMsg.match(/(\d+)\s*(ชั่วโมง|ชม\.|hr|hour|นาที|min)/i);
                    const durationMs = durMatch ? parseInt(durMatch[1]) * (durMatch[2].match(/นาที|min/i) ? 60000 : 3600000) : 3600000;
                    const title = userMsg.replace(/ลงปฏิทิน(ด้วย|ให้หนู)?(นะ|ด้วย|เลย)?|บันทึกปฏิทิน|ลง\s*calendar|add.*calendar|\d+\s*(ชั่วโมง|ชม\.|hr|hour|นาที|min)/gi, '').trim() || 'กิจกรรมจาก Stacy';
                    
                    console.log(`[Smart Fallback] ADD_CALENDAR_EVENT detected: title="${title}"`);
                    actions.push({ 
                        type: 'ADD_CALENDAR_EVENT', 
                        data: { 
                            title, 
                            start: toLocalISO(now), 
                            end: toLocalISO(new Date(now.getTime() + durationMs)) 
                        } 
                    });
                }

                if (actions.length > 0) {
                    console.log(`[Smart Fallback] Auto-created ${actions.length} action(s) from user message`);
                }
            }
            
            await smartReply(ctx, cleanText || "หนูกำลังประมวลผลข้อมูลอยู่ค่ะเจ้านาย...");
            
            for (const action of actions) {
                console.log(`[Action Execute] Type: ${action.type}, Data:`, JSON.stringify(action.data));
                await handleAgentActions(ctx, action.type, action.data, userId, { db, docDir, IS_RENDER, bot });
            }

            userStore.history.push({ role: 'user', content: finalInput }, { role: 'assistant', content: reply });
            if (userStore.history.length > 40) userStore.history.splice(0, 2);
            saveBotMemory(userId, finalInput, reply);
            
        } finally {
            clearInterval(typingInterval);
        }
    } catch (e) {
        console.error('AI Error:', e.message);
        ctx.reply(`🙏 ขออภัยค่ะเจ้านาย ระบบ AI ขัดข้องชั่วคราว\nError: ${(e.message || 'Unknown').substring(0, 100)}`);
    }
}

// ========== Bot Events Mounting ==========
    if (bot) {
        bot.telegram.getMe().then(me => {
            console.log(`📡 Connected as @${me.username} (${me.first_name})`);
        }).catch(err => {
            console.error(`❌ getMe Failed: ${err.message}`);
        });

        bot.on('text', async (ctx) => {
        console.log(`[Telegram Message] From ${ctx.from.first_name} (${ctx.from.id}): ${ctx.message.text}`);
        if (ctx.chat.type === 'private') await processStacyAI(ctx, ctx.message.text);
    });

    bot.on('document', async (ctx) => {
        const doc = ctx.message.document;
        try {
            await ctx.sendChatAction('typing');
            const link = await ctx.telegram.getFileLink(doc.file_id);
            const content = (await axios.get(link.href)).data;
            await processStacyAI(ctx, ctx.message.caption || "โปรดสรุปเอกสารนี้", content);
        } catch (e) { ctx.reply('❌ หนูอ่านเอกสารนี้ไม่ได้ค่ะ'); }
    });

    bot.launch({ dropPendingUpdates: true })
        .then(() => console.log('🚀 Stacy Modular Assistant is running...'))
        .catch(err => console.error('❌ Bot Launch Error:', err.message));
}

// ========== Server Launch ==========

// ========== Dashboard API Routes ==========
app.get('/api/calendar', async (req, res) => {
    try {
        const userId = req.query.userId || 'me';
        const googleEvents = await getGoogleCalendarEvents();
        
        let firebaseTasks = [];
        if (db) {
            const snap = await db.collection('userActivities').doc(String(userId)).collection('tasks').limit(100).get();
            firebaseTasks = snap.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                type: 'local'
            }));
        }
        
        // Merge and sort
        const allEvents = [...googleEvents, ...firebaseTasks].sort((a,b) => 
            new Date(a.start || a.time) - new Date(b.start || b.time)
        );
        
        res.json(allEvents);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(CONFIG.PORT, () => {
    console.log(`📡 Stacy Web Dashboard active on port ${CONFIG.PORT}`);
    console.log(`🔥 Firebase Status: ${firebaseStatus}`);
});

process.once('SIGINT', () => bot && bot.stop('SIGINT'));
process.once('SIGTERM', () => bot && bot.stop('SIGTERM'));
