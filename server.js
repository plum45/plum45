const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const admin = require('firebase-admin');
const fs = require('fs');
const { Telegraf } = require('telegraf');
const pdf = require('pdf-parse');
const cheerio = require('cheerio');

// ========== Configuration & Environment ==========
const PORT = process.env.PORT || 10000;
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || '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';
const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '7435216335:AAEPclIdh6IatC228uK6I2X9m3-O82u_yks';
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || process.env.RENDER_URL;
const IS_RENDER = !!process.env.RENDER;

// ========== Firebase Initialization ==========
let firebaseStatus = "Disconnected";
let db;

try {
    let serviceAccount;
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } else if (process.env.FIREBASE_PRIVATE_KEY) {
        // Handle direct private key string (often used in cloud envs)
        serviceAccount = {
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        };
    } else {
        const keyPath = path.join(__dirname, 'serviceAccountKey.json');
        if (fs.existsSync(keyPath)) {
            serviceAccount = require(keyPath);
        }
    }

    if (serviceAccount && admin.apps.length === 0) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        db = admin.firestore();
        firebaseStatus = "🟢 Connected (Ready)";
        console.log("🔥 Firebase Initialized Successfully");
    }
} catch (e) {
    console.error("❌ Firebase Init Failed:", e.message);
    firebaseStatus = `🔴 Init Failed: ${e.message}`;
}

// ========== Bot & App Setup ==========
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

const bot = TELEGRAM_TOKEN ? new Telegraf(TELEGRAM_TOKEN) : null;
const tgContexts = new Map(); // Store conversation history

// ========== Core Logic Pillars & Actions ==========

async function getBotMemory(userId) {
    if (!db) return ["Firebase disconnected - using temporary memory only"];
    try {
        const doc = await db.collection('userActivities').doc(String(userId)).get();
        return doc.exists && doc.data().facts ? doc.data().facts : [];
    } catch (e) { return []; }
}

async function saveBotMemory(userId, userMsg, botReply) {
    if (!db) return;
    try {
        const userRef = db.collection('userActivities').doc(String(userId));
        // Subtle learning: Extract facts from user message (simplified for this demo)
        const facts = [];
        if (userMsg.includes('ชื่อ')) facts.push(`ผู้ใช้ชื่อ: ${userMsg.split('ชื่อ').pop().trim()}`);
        if (userMsg.includes('ชอบ')) facts.push(`ผู้ใช้ชอบ: ${userMsg.split('ชอบ').pop().trim()}`);
        
        if (facts.length > 0) {
            await userRef.set({ facts: admin.firestore.FieldValue.arrayUnion(...facts) }, { merge: true });
        }
    } catch (e) { console.error('Memory Save Error:', e); }
}

function extractActions(text) {
    const actions = [];
    const regex = /\[ACTION: (\w+) ({.*?})\]/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        try {
            actions.push({ type: match[1], data: JSON.parse(match[2]) });
        } catch (e) { console.error('Action Parse Error:', e); }
    }
    const cleanText = text.replace(/\[ACTION:.*?\]/g, '').trim();
    return { cleanText, actions };
}

async function handleAgentActions(ctx, action, data, userId) {
    if (!db) return;
    const userRef = db.collection('userActivities').doc(String(userId));

    switch (action) {
        case 'SAVE_TASK':
            await userRef.collection('tasks').add({
                title: data.title,
                time: data.time || 'Not specified',
                status: 'pending',
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            await ctx.reply(`✅ จดบันทึกงานให้แล้วครับ: "${data.title}" (${data.time})`);
            break;
        case 'WORK_LOG':
            await userRef.collection('logs').add({
                content: data.note,
                type: data.type || 'general',
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
            await ctx.reply(`📝 บันทึกกิจกรรมให้แล้วครับ: ${data.note}`);
            break;
        case 'ADD_CALENDAR_EVENT':
            const userDoc = await userRef.get();
            const webhookUrl = userDoc.exists ? userDoc.data().webhookUrl : null;
            if (webhookUrl) {
                // Dual sync: Save internally + send to webhook
                await userRef.collection('tasks').add({
                    title: data.title,
                    time: data.startTime,
                    status: 'synced',
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
                await axios.post(webhookUrl, data);
                await ctx.reply(`📅 ลงนัดหมายและซิงค์กับ Google Calendar เรียบร้อย: "${data.title}"`);
            } else {
                await ctx.reply('🔴 ยังไม่ได้เชื่อมต่อ Google Calendar ของคุณ กรุณาส่งลิงก์ Apps Script ผ่านเมนู CONNECT_WEBHOOK ก่อนครับ');
            }
            break;
        case 'IMAGE_GEN':
            try {
                const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(data.prompt)}?seed=${Math.floor(Math.random()*10000)}&width=1024&height=1024&nologo=true`;
                const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
                await ctx.replyWithPhoto({ source: Buffer.from(response.data) }, { caption: `🎨 วาดให้แล้วครับ: ${data.prompt}` });
            } catch (err) { ctx.reply(`❌ วาดรูปไม่สำเร็จ: ${err.message}`); }
            break;
        case 'CREATE_SKILL':
        case 'UPDATE_SKILL':
            // REDEFINED: Technical Skill System (Metadata, Schema, Logic)
            await userRef.collection('skills').doc(data.name).set({
                ...data, // includes name, description, schema, instructions
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                type: data.schema ? 'function' : 'prompt'
            }, { merge: true });
            const verb = action === 'CREATE_SKILL' ? 'ติดตั้ง' : 'ปรับปรุง';
            await ctx.reply(`✨ ${verb}สกิล **"${data.name}"** สำเร็จ!\n📌 ประเภท: ${data.schema ? 'ฟังก์ชันอัจฉริยะ' : 'ทักษะสนทนา'}\n💬 รายละเอียด: ${data.description}`);
            break;
        case 'IMPORT_SKILL_FROM_URL':
            try {
                const res = await axios.get(data.url);
                const $ = cheerio.load(res.data);
                const instructions = $('article, main, .content').text().substring(0, 2000);
                const skillName = data.name || data.url.split('/').pop();
                
                await userRef.collection('skills').doc(skillName).set({
                    name: skillName,
                    description: `นำเข้าจาก ${data.url}`,
                    instructions: instructions,
                    url: data.url,
                    securityStatus: 'checked',
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                await ctx.reply(`📥 นำเข้าสกิลจาก ${data.url} สำเร็จครับ!`);
            } catch (err) { ctx.reply(`❌ นำเข้าไม่สำเร็จ: ${err.message}`); }
            break;
    }
}

// ========== Unified AI Processor ==========

async function processStacyAI(ctx, userMsg, fileContext = null) {
    const userId = ctx.from.id;
    const now = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    
    try {
        await ctx.sendChatAction('typing');
        if (!tgContexts.has(userId)) tgContexts.set(userId, { history: [], state: 'idle' });
        const userStore = tgContexts.get(userId);
        
        // --- GAIN KNOWLEDGE: Memory & Skills ---
        const [personalFacts, userSkills] = await Promise.all([
            getBotMemory(userId),
            (async () => {
                const snap = await db.collection('userActivities').doc(String(userId)).collection('skills').get();
                return snap.docs.map(doc => {
                    const s = doc.data();
                    return `SKILL [${s.name}]: ${s.description}\n- Schema: ${JSON.stringify(s.schema || {})}\n- Instructions: ${s.instructions}`;
                }).join('\n\n');
            })()
        ]);

        const finalInput = fileContext ? `[FILE CONTENT]: ${fileContext}\n\n[USER MESSAGE]: ${userMsg || "Please process this file."}` : userMsg;

        const systemPrompt = `คุณคือ Stacy AI Agent (Pillar Architect Mode)

        [CORE RULES]:
        1. IDENTITY: Proactive, intelligent, and useful. Use "ครับ".
        2. TECHNICAL SKILLS: You have a library of skills. Each has Metadata, Schema (JSON), and Instructions (Logic).
        3. FUNCTION CALLING: If a user command matches a skill's [Metadata] or [Schema], strictly follow its [Instructions].
        4. MULTIMODAL: You can read files (PDF/Text). If a file contains data (like decibel levels or blood types), analyze it using your reasoning.

        [CURRENT TIME]: ${now}
        [USER SKILLS LIBRARY]:
        ${userSkills || "No custom skills installed yet. Suggest user to create one using metadata/schema pattern."}

        [ACTION CAPABILITIES]:
        - SAVE_TASK {"title": "...", "time": "..."}
        - WORK_LOG {"note": "...", "type": "..."}
        - ADD_CALENDAR_EVENT {"title": "...", "startTime": "ISO_DATE", "description": "..."}
        - IMAGE_GEN {"prompt": "English description"}
        - CREATE_SKILL {"name": "...", "description": "...", "schema": {...}, "instructions": "..."}
        - UPDATE_SKILL {"name": "...", "description": "...", "schema": {...}, "instructions": "..."}

        [REASONING GUIDELINES]:
        - If user feedback is given, use UPDATE_SKILL to adapt.
        - Encourage user to define skills with JSON Schema for precision.
        - Example: A 'Blood Test' skill with schema {"rh": "string", "type": "string"}.`;

        const response = await axios.post(NVIDIA_API_URL, {
            model: 'moonshotai/kimi-k2-instruct',
            messages: [
                { role: 'system', content: systemPrompt },
                ...userStore.history.slice(-10),
                { role: 'user', content: finalInput }
            ],
            temperature: 0.6
        }, {
            headers: { 'Authorization': `Bearer ${NVIDIA_API_KEY}`, 'Content-Type': 'application/json' }
        });

        const reply = response.data.choices[0].message.content;
        const { cleanText, actions } = extractActions(reply);
        
        await ctx.reply(cleanText || "ผมกำลังประมวลผลข้อมูลอยู่ครับ...");
        
        for (const action of actions) {
            await handleAgentActions(ctx, action.type, action.data, userId);
        }

        userStore.history.push({ role: 'user', content: finalInput }, { role: 'assistant', content: reply });
        if (userStore.history.length > 20) userStore.history.splice(0, 2);
        saveBotMemory(userId, finalInput, reply);
        
    } catch (e) {
        console.error('AI Error:', e);
        ctx.reply('🙏 ขออภัยครับ ระบบประมวลผลติดขัดเล็กน้อย รบกวนลองใหม่อีกครั้งครับ');
    }
}

// ========== Bot Handlers ==========

if (bot) {
    bot.start((ctx) => ctx.reply('👋 สวัสดีครับ! ผม Stacy 7-Pillar AI พร้อมใช้งานระบบ Skill System อัจฉริยะแล้วครับ\n\nพิมพ์ /help เพื่อดูความสามารถใหม่!'));
    
    bot.command('status', (ctx) => {
        ctx.reply(`📡 **Stacy System Status**\n- Backend: Online\n- Firebase: ${firebaseStatus}\n- Mode: Skill Architect Enabled`);
    });

    bot.command('skills', async (ctx) => {
        const snap = await db.collection('userActivities').doc(String(ctx.from.id)).collection('skills').get();
        if (snap.empty) return ctx.reply('🛠️ ยังไม่มีสกิลที่ติดตั้งครับ ลองติดตั้งด้วยคำแนะนำทางเทคนิคที่คุณส่งมาสิครับ!');
        let text = "🛠️ **คลังสกิลของคุณ:**\n";
        snap.forEach(doc => text += `🔹 **${doc.id}**: ${doc.data().description}\n`);
        ctx.reply(text);
    });

    bot.on('document', async (ctx) => {
        const doc = ctx.message.document;
        try {
            const link = await ctx.telegram.getFileLink(doc.file_id);
            const res = await axios.get(link.href, { responseType: 'arraybuffer' });
            let content = "";
            if (doc.mime_type === 'application/pdf') {
                const data = await pdf(Buffer.from(res.data));
                content = data.text;
            } else {
                content = Buffer.from(res.data).toString('utf8');
            }
            await processStacyAI(ctx, ctx.message.caption || "", content.substring(0, 5000));
        } catch (e) { ctx.reply('❌ อ่านไฟล์ไม่สำเร็จครับ'); }
    });

    bot.on('text', async (ctx) => {
        await processStacyAI(ctx, ctx.message.text);
    });
}

// ========== Web Server Routes ==========

app.get('/', (res) => res.send('Stacy AI is Active'));

app.post('/api/telegram-webhook', async (req, res) => {
    if (bot) {
        try {
            await bot.handleUpdate(req.body, res);
        } catch (err) { console.error('Webhook Error:', err); }
    }
    if (!res.writableEnded) res.status(200).send('OK');
});

// ========== Start Server ==========
app.listen(PORT, () => {
    console.log(`🚀 Stacy running on port ${PORT}`);
    if (bot && !IS_RENDER) {
        bot.launch();
        console.log("🤖 Bot Polling Started (Local)");
    }
});
