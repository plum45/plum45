const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'config/.env') });

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const { OpenAI } = require('openai');
const axios = require('axios');
const { consolidateMemory } = require('./system/memory-consolidator');

// Load System Prompts (OpenClaw Modular Architecture)
const promptsDir = path.join(__dirname, 'system', 'prompts');
const loadPrompt = (name) => {
    try {
        return fs.existsSync(path.join(promptsDir, name)) ? fs.readFileSync(path.join(promptsDir, name), 'utf8') : '';
    } catch(e) { return ''; }
};

// We load these globally so they are fast to access
let PROMPT_SOUL = loadPrompt('SOUL.md');
let PROMPT_AGENTS = loadPrompt('AGENTS.md');
let PROMPT_TOOLS = loadPrompt('TOOLS.md');

const dns = require('dns');
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');
process.on('unhandledRejection', (reason, promise) => console.error('🔴 Unhandled Rejection:', reason));
process.on('uncaughtException', (err) => console.error('🔴 Uncaught Exception:', err.message));

// ========== PID LOCKING (Prevent Duplicates) ==========
const PID_FILE = path.join(__dirname, '.stacy.pid');
if (fs.existsSync(PID_FILE)) {
    const oldPid = fs.readFileSync(PID_FILE, 'utf8');
    try {
        process.kill(oldPid, 0); // Check if process still exists
        console.error(`❌ Duplicate Instance! Stacy is already running with PID ${oldPid}. Exiting...`);
        process.exit(1);
    } catch(e) { 
        console.log(`⚠️ Cleaning up stale lockfile for PID ${oldPid}`);
        fs.unlinkSync(PID_FILE); 
    }
}
fs.writeFileSync(PID_FILE, process.pid.toString());
process.on('exit', () => { if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE); });
process.on('SIGINT', () => { if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE); process.exit(); });

// System Modules
console.log("📦 Loading System Modules...");
console.log("   - loading Database...");
const { getBotMemory, saveBotMemory, getChatHistory, admin, initFirebase } = require('./system/database');
console.log("   - loading Calendar...");
const { getGoogleCalendarEvents } = require('./system/calendar');
console.log("   - loading Actions (Puppeteer might take long intersection)...");
const { extractActions, handleAgentActions } = require('./system/actions');
console.log("   - loading Bot logic...");
const { setupBot } = require('./system/bot');
console.log("   - loading Utils...");
const { smartReply, logToTerminal } = require('./system/utils');
console.log("✅ Modules Loaded.");

// ========== Configuration & Global State ==========
const CONFIG = {
    PORT: process.env.PORT || 10000,
    VERSION: '3.0.0-APEX',
    // Recommendation: Use 70b or 8b for significantly faster responses than 405b
    MODEL: process.env.MODEL || 'meta/llama-3.1-70b-instruct', 
    NVIDIA_URL: 'https://integrate.api.nvidia.com/v1/chat/completions',
    LOCAL_MODE: process.env.LOCAL_MODE === 'true'
};

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const client = new OpenAI({
    apiKey: CONFIG.LOCAL_MODE ? 'ollama' : NVIDIA_API_KEY,
    baseURL: CONFIG.LOCAL_MODE ? 'http://localhost:11434/v1' : 'https://integrate.api.nvidia.com/v1'
});

const TELEGRAM_TOKEN = (process.env.TELEGRAM_TOKEN || "").trim();
const IS_RENDER = !!process.env.RENDER;

// Storage Directories
const MASTER_DOC_PATH = "C:\\Users\\lgopl\\OneDrive\\เอกสาร\\stact doc";
const docDir = IS_RENDER ? path.join(__dirname, 'Documents') : MASTER_DOC_PATH;
const outputDir = path.join(__dirname, 'output');

[docDir, outputDir].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// Initialize System Parts (Cloud Credentials Setup)
const configDir = path.join(__dirname, 'config');
const setupKeyFile = (envVar, filename) => {
    const filePath = path.join(configDir, filename);
    if (!fs.existsSync(filePath) && process.env[envVar]) {
        try {
            console.log(`📡 Recreating config/${filename} from environment variable...`);
            fs.writeFileSync(filePath, process.env[envVar].trim());
        } catch (e) {
            console.error(`❌ Failed to recreate ${filename}:`, e.message);
        }
    }
};

setupKeyFile('GOOGLE_CALENDAR_KEY', 'google-calendar-key.json');
setupKeyFile('FIREBASE_SERVICE_ACCOUNT', 'serviceAccountKey.json');

const { db, firebaseStatus } = initFirebase();
console.log(`📡 Telegram Token: ${TELEGRAM_TOKEN ? TELEGRAM_TOKEN.substring(0, 10) + '...' : 'MISSING'}`);

const bot = setupBot(TELEGRAM_TOKEN, CONFIG, { db, firebaseStatus, docDir, IS_RENDER });

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
    const fullContextTime = now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', hour12: false });
    
    if (!tgContexts.has(userId)) {
        tgContexts.set(userId, { history: [], skills: null, lastSkillFetch: 0, thinkingMode: true });
    }
    const userStore = tgContexts.get(userId);

    try {
        // 🚀 PARALLEL DATA FETCHING (Speed Boost)
        const [memory, cloudHistory, skillsData] = await Promise.all([
            getBotMemory(userId),
            userStore.history.length === 0 ? getChatHistory(userId, 10) : Promise.resolve(null),
            (userStore.skills && (Date.now() - userStore.lastSkillFetch < 300000)) 
                ? Promise.resolve(userStore.skills) 
                : (async () => {
                    if (!db) return '';
                    try {
                        const snap = await db.collection('userActivities').doc(String(userId)).collection('skills').limit(20).get();
                        const skills = snap.empty ? '' : "\n**🛠️ INSTALLED SKILLS:**\n" + snap.docs.map(d => d.data().instructions).join('\n\n') + "\n";
                        userStore.skills = skills;
                        userStore.lastSkillFetch = Date.now();
                        return skills;
                    } catch (e) { return ''; }
                })()
        ]);
        if (cloudHistory) userStore.history = cloudHistory;
        const skillsBlock = skillsData;
        const finalInput = fileContent ? `[ATTACHED DATA: ${fileContent}]\n\nUser: ${userMsg}` : userMsg;

        let systemPrompt = "";
        const lowerMsg = userMsg.toLowerCase();
        let isFastPath = false;

        if (lowerMsg.includes('เช็คคอม') || lowerMsg.includes('สเปกคอม') || lowerMsg.includes('pc stat')) {
            systemPrompt = `หนูคือ Stacy ✨ (ปี 2026) หนูมีเครื่องมือเช็คคอม: [ACTION: GET_PC_STATS {}]`;
            isFastPath = true;
        } else if (lowerMsg.includes('ลงเวลา') || lowerMsg.includes('จด log') || lowerMsg.includes('work log')) {
            systemPrompt = `หนูคือ Stacy ✨ (ปี 2026) หนูมีเครื่องมือลงเวลาทำงาน: [ACTION: WORK_LOG {"task": "...", "duration": "..."}]`;
            isFastPath = true;
        } else if (lowerMsg.includes('ปฏิทิน') || lowerMsg.includes('นัดหมาย') || lowerMsg.includes('นัด') || lowerMsg.includes('calendar')) {
            systemPrompt = `หนูคือ Stacy ✨ (ปี 2026) หนูมีเครื่องมือลงปฏิทิน: [ACTION: ADD_CALENDAR_EVENT {"title": "...", "start": "...", "end": "..."}]`;
            isFastPath = true;
        } else if (userStore.thinkingMode === false || (userMsg.length < 80 && !lowerMsg.includes('ค้นหา') && !lowerMsg.includes('วิจัย') && !lowerMsg.includes('ทอง') && !lowerMsg.includes('ข่าว') && !lowerMsg.includes('ราคา'))) {
            // Very Fast Path for simple chat
            systemPrompt = `หนูคือ Stacy ✨ (ปี 2026) เจ้านายของคุณ Snow ตอบสั้นๆ [🕒 ${fullContextTime}]`;
        } else {
            // Modular Smart Mode (OpenClaw Architecture)
            PROMPT_SOUL = loadPrompt('SOUL.md') || PROMPT_SOUL;
            PROMPT_AGENTS = loadPrompt('AGENTS.md') || PROMPT_AGENTS;
            PROMPT_TOOLS = loadPrompt('TOOLS.md') || PROMPT_TOOLS;
            
            const facts = Array.isArray(memory.facts) ? memory.facts.slice(-5).join('; ') : "";
            
            // Read Workspace Memory (OpenClaw style)
            let workspaceMem = "";
            try {
                const memPath = path.join(__dirname, 'workspace', String(userId), 'MEMORY.md');
                if (fs.existsSync(memPath)) workspaceMem = fs.readFileSync(memPath, 'utf8');
            } catch(e) {}

            systemPrompt = `${PROMPT_SOUL}\n\n${PROMPT_AGENTS}\n\n${PROMPT_TOOLS}\n\n## FIREBASE FACTS (Short-Term):\n${facts}\n\n## WORKSPACE RAM (Long-Term MEMORY.md):\n${workspaceMem}\n\n[🕒 CURRENT TIME: ${fullContextTime}]\n`;
        }

        console.log(`[AI Request] Model: ${CONFIG.MODEL}`);
        const typingInterval = setInterval(() => ctx.sendChatAction('typing').catch(() => {}), 4000);

        try {
            // Sanitize history to prevent hallucinated actions from polluting context
            const cleanHistory = userStore.history.slice(-6).map(msg => ({
                ...msg,
                content: msg.content ? msg.content.replace(/\[ACTION:[\s\S]*?\]/g, '').trim() : ''
            })).filter(msg => msg.content.length > 0);

            const stream = await client.chat.completions.create({
                model: CONFIG.MODEL,
                messages: [
                    { role: 'system', content: "CRITICAL: You ARE Stacy. Always prioritize the user's IMMEDIATELY PRECEDING message for any action data (titles, times). IGNORE mention of obsolete tasks (like gold prices or Julie) unless they are in the user's LATEST message." },
                    { role: 'system', content: systemPrompt },
                    ...cleanHistory,
                    { role: 'user', content: finalInput }
                ],
                temperature: 1.0,
                max_tokens: 8192,
                top_p: 0.95,
                stream: true
            });

            let fullReply = "";
            let reasoning = "";
            let streamText = "";
            let lastEditTime = 0;
            let statusMsg = null;
            let statusTimer = null;

            if (userStore.thinkingMode !== false) {
                statusTimer = setTimeout(async () => {
                   try { statusMsg = await ctx.reply("🧠 **Stacy กำลังประมวลผลความคิดอยู่ค่ะ...**"); } catch(e) {}
                }, 500); // Reduced from 1500ms to 500ms for faster feel
            }

            for await (const chunk of stream) {
                if (statusTimer) { clearTimeout(statusTimer); statusTimer = null; }
                const delta = chunk.choices[0]?.delta;
                
                if (delta?.reasoning_content) reasoning += delta.reasoning_content;
                if (delta?.content) {
                    fullReply += delta.content;
                    streamText += delta.content;
                }

                const nowEdit = Date.now();
                if (statusMsg && (nowEdit - lastEditTime > 1000)) {
                    let displayMsg = streamText
                        .replace(/\[ACTION:[\s\S]*?\]/g, '')
                        .replace(/<think>[\s\S]*?<\/think>/g, '')
                        .replace(/<think>[\s\S]*/g, '')
                        .trim();
                    
                    if (displayMsg.length > 2 || isFastPath) {
                        const finalDisplay = displayMsg.substring(0, 3800) + (displayMsg.length > 3800 ? "..." : "");
                        ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, `📡 **Stacy กำลังตอบกลับ...**\n\n${finalDisplay || "..."}`).catch(() => {});
                        lastEditTime = nowEdit;
                    }
                }
            }
            
            if (reasoning) console.log(`🧠 [Stacy Reasoning]: ${reasoning}`);
            const reply = fullReply || "ขอโทษทีค่ะ หนูคิดอะไรไม่ออกเลย";
            console.log(`[RAW_AI_RESPONSE]:\n${reply}\n-------------------`);
            
            let { cleanText, actions } = extractActions(reply);
            
            if (statusMsg) ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
            
            await smartReply(ctx, cleanText || "หนูกำลังประมวลผลข้อมูลอยู่ค่ะเจ้านาย...");
            
            if (actions.length > 0) {
                for (const action of actions) {
                    console.log(`[Action Execute] Type: ${action.type}, Data:`, JSON.stringify(action.data));
                    await handleAgentActions(ctx, action.type, action.data, userId, { db, docDir, IS_RENDER, bot, client });
                }
            }

            userStore.history.push({ role: 'user', content: finalInput }, { role: 'assistant', content: reply });
            if (userStore.history.length > 40) userStore.history.shift();
            saveBotMemory(userId, finalInput, reply);
            
            if (userStore.history.length >= 20) {
                setImmediate(() => {
                    consolidateMemory(userId, userStore.history, client, db).catch(e => console.warn('[Consolidator] Background task failed:', e.message));
                });
            }
        } finally {
            clearInterval(typingInterval);
        }
    } catch (e) {
        console.error('AI Error:', e.message);
        ctx.reply(`🙏 ขออภัยค่ะเจ้านาย ระบบ AI ขัดข้องชั่วคราว\nError: ${(e.message || 'Unknown').substring(0, 100)}`);
    }
}

if (bot) {
    bot.telegram.getMe().then(me => console.log(`📡 Connected as @${me.username}`)).catch(err => console.error(`❌ getMe Failed: ${err.message}`));

    bot.on('text', async (ctx) => {
        const userId = ctx.from.id;
        const msg = ctx.message.text.trim();
        console.log(`[Telegram Message] From ${userId}: ${msg}`);

        if (msg === '/clear') {
            const userStore = tgContexts.get(userId);
            if (userStore) {
                userStore.history = [];
                userStore.lastSkillFetch = 0;
            }
            if (db) {
                try {
                    await db.collection('userActivities').doc(String(userId)).update({ 'memory.facts': [] });
                } catch(e) {}
            }
            await ctx.reply("🧹 **ล้างสมองและประวัติการคุยให้เรียบร้อยแล้วค่ะ!**\nหนูจำอะไรก่อนหน้านี้ไม่ได้แล้วนะคะ เจ้านายเริ่มสั่งงานใหม่ได้เลยค่ะ ✨");
            return;
        }

        if (msg.startsWith('/think')) {
            if (!tgContexts.has(userId)) tgContexts.set(userId, { history: [], skills: null, lastSkillFetch: 0 });
            const userStore = tgContexts.get(userId);
            
            if (msg === '/think off' || msg === '/think 0' || msg === '/think false') {
                userStore.thinkingMode = false;
                return ctx.reply("✅ **ปิดโหมดคิดเชิงลึกแล้วค่ะ** (โหมดประหยัดเวลา/ตอบไว) ✨");
            } else {
                userStore.thinkingMode = true;
                userStore.lastSkillFetch = 0;
                return ctx.reply("🧠 **เปิดโหมดคิดเชิงลึกแล้วค่ะ** (โหมดวิเคราะห์/ละเอียด/มีระบบ) ✨");
            }
        }

        if (ctx.chat.type === 'private') await processStacyAI(ctx, msg);
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

app.listen(CONFIG.PORT, () => {
    console.log(`📡 Stacy Web Dashboard active on port ${CONFIG.PORT}`);
    console.log(`🔥 Firebase Status: ${firebaseStatus}`);
});

process.once('SIGINT', () => bot && bot.stop('SIGINT'));
process.once('SIGTERM', () => bot && bot.stop('SIGTERM'));
