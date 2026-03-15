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
const google = require('googlethis');

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
    if (!db) return { facts: [], identity: "Stacy AI Agent" };
    try {
        const doc = await db.collection('userActivities').doc(String(userId)).get();
        const data = doc.exists ? doc.data() : {};
        return {
            facts: data.facts || [],
            identity: data.identity || "Stacy AI Agent"
        };
    } catch (e) { return { facts: [], identity: "Stacy AI Agent" }; }
}

async function saveBotMemory(userId, userMsg, botReply) {
    if (!db) return;
    try {
        const userRef = db.collection('userActivities').doc(String(userId));
        const facts = [];
        
        // Simple extraction for now - could be upgraded to AI extraction later
        if (userMsg.includes('ชื่อ')) facts.push(`ผู้ใช้คนนี้ชื่อ: ${userMsg.split('ชื่อ').pop().trim()}`);
        if (userMsg.includes('ชอบ')) facts.push(`สิ่งที่ชอบ: ${userMsg.split('ชอบ').pop().trim()}`);
        if (userMsg.includes('ทำงานที่')) facts.push(`สถานที่ทำงาน: ${userMsg.split('ทำงานที่').pop().trim()}`);
        
        if (facts.length > 0) {
            await userRef.set({ facts: admin.firestore.FieldValue.arrayUnion(...facts) }, { merge: true });
        }
    } catch (e) { console.error('Memory Save Error:', e); }
}

function extractActions(text) {
    const actions = [];
    // More robust regex to catch actions even with multiline JSON or varied spacing
    const regex = /\[ACTION:\s*(\w+)\s*({[\s\S]*?})\]/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        try {
            actions.push({ type: match[1], data: JSON.parse(match[2]) });
        } catch (e) { 
            console.error('Action Parse Error:', e, 'Raw JSON:', match[2]); 
        }
    }
    const cleanText = text.replace(/\[ACTION:[\s\S]*?\]/g, '').trim();
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
            // Pillar 7: Improved Visual Creation with Logging
            try {
                const cleanPrompt = (data.prompt || "highly detailed digital art").substring(0, 500).replace(/[^\w\s\u0E00-\u0E7F,]/g, '');
                const seed = Math.floor(Math.random() * 1000000);
                const imageUrl = `https://pollinations.ai/p/${encodeURIComponent(cleanPrompt)}?width=1024&height=1024&seed=${seed}&model=flux&nologo=true`;
                
                console.log(`🖼️ Generating Image: ${imageUrl}`);
                
                const response = await axios.get(imageUrl, { 
                    responseType: 'arraybuffer',
                    timeout: 45000 // Extended timeout for generation
                });
                
                await ctx.replyWithPhoto({ source: Buffer.from(response.data) }, { 
                    caption: `🎨 วาดเสร็จแล้วครับเจ้านาย!\n📌 คำสั่ง: ${cleanPrompt}` 
                });
                console.log(`✅ Image sent successfully to user ${userId}`);
            } catch (err) {
                console.error('❌ IMAGE_GEN Detail Error:', err.response ? `${err.response.status} - ${err.response.statusText}` : err.message);
                ctx.reply(`❌ วาดรูปไม่สำเร็จ (ระบบแม่ข่ายมีปัญหาชั่วคราว): ${err.message}\nเจ้านายลองสั่งใหม่อีกครั้ง หรือใช้คำสั่งที่สั้นลงดูนะครับ`);
            }
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
        case 'SET_IDENTITY':
            // Permanent Role Learning
            await userRef.set({ identity: data.roleDescription }, { merge: true });
            await ctx.reply(`🧠 รับทราบครับ! ผมได้บันทึกตัวตนใหม่ของผมแล้ว: **"${data.roleDescription}"**\nผมจะจำสิ่งนี้ไว้ตลอดไปและปรับการทำงานให้ตรงตามบทบาทนี้ครับ`);
            break;
        case 'WEB_SEARCH':
            try {
                const results = await performSearch(data.query);
                await ctx.reply(`🔍 เจ้านายครับ ผมไปหาข้อมูลเรื่อง **"${data.query}"** มาให้แล้วครับ:\n\n${results.substring(0, 1000)}...`);
            } catch (err) { ctx.reply(`❌ ค้นหาข้อมูลไม่สำเร็จ: ${err.message}`); }
            break;
    }
}

async function performSearch(query) {
    try {
        const options = { page: 0, safe: false, parse_ads: false, additional_params: { hl: 'th' } };
        const response = await google.search(query, options);
        return response.results.map(r => `• ${r.title}: ${r.description}`).join('\n');
    } catch (e) {
        console.error('Search Error:', e);
        return "ไม่สามารถดึงข้อมูลจากอินเทอร์เน็ตได้ในขณะนี้";
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
        const [memory, userSkills] = await Promise.all([
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

        const systemPrompt = `คุณคือ ${memory.identity} (7-Pillar AI Agent)

        [CORE RULES]:
        1. IDENTITY: You are currently acting as: ${memory.identity}.
        2. BEHAVIOR: ปรับสไตล์การพูด น้ำเสียง และคำลงท้าย (ครับ/ค่ะ/จ๊ะ) ให้ตรงตามบทบาท ${memory.identity} ที่เจ้านายสั่งไว้โดยเคร่งครัด
        3. MEMORY: สิ่งที่เรารู้เกี่ยวกับเจ้านาย: ${memory.facts.join(' | ') || "ยังไม่มีรายละเอียดพิเศษ"}
        
        [TECHNICAL SKILLS & FUNCTION CALLING]:
        ${userSkills || "No custom skills installed yet."}

        [ACTION CAPABILITIES]:
        คุณต้องใช้รูปแบบนี้ท้ายข้อความเสมอเพื่อสั่งงาน:
        - [ACTION: SAVE_TASK {"title": "...", "time": "..."}]
        - [ACTION: WORK_LOG {"note": "...", "type": "..."}]
        - [ACTION: ADD_CALENDAR_EVENT {"title": "...", "startTime": "ISO_DATE", "description": "..."}]
        - [ACTION: IMAGE_GEN {"prompt": "English descriptive prompt"}]
        - [ACTION: CREATE_SKILL {"name": "...", "description": "...", "schema": {}, "instructions": "..."}]
        - [ACTION: SET_IDENTITY {"roleDescription": "..."}]
        - [ACTION: WEB_SEARCH {"query": "..."}]

        [REASONING GUIDELINES]:
        - หากเจ้านายสั่งให้ "วาดรูป" หรือ "เจนภาพ" คุณต้องใช้ [ACTION: IMAGE_GEN] เท่านั้น
        - ในฟิลด์ prompt ของ IMAGE_GEN ให้เขียนบรรยายภาพเป็นภาษาอังกฤษที่ละเอียดเพื่อให้ได้ภาพที่สวยงาม
        - หากเจ้านายถามเรื่องที่คุณไม่รู้ ให้ใช้ WEB_SEARCH ทันที
        - เมื่อได้รับไฟล์ (PDF/Text) ให้วิเคราะห์ตามบทบาทที่คุณเป็นอยู่`;

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

    bot.command('whoami', async (ctx) => {
        const memory = await getBotMemory(ctx.from.id);
        ctx.reply(`🧠 **ตัวตนปัจจุบันของผม:**\n"${memory.identity}"\n\n(หากต้องการให้ผมเป็นอย่างอื่น สั่งผมได้เลยครับ เช่น "ต่อจากนี้ให้คุณเป็น...")`);
    });

    bot.on('document', async (ctx) => {
        const doc = ctx.message.document;
        const userId = ctx.from.id;
        try {
            await ctx.sendChatAction('typing');
            const link = await ctx.telegram.getFileLink(doc.file_id);
            const res = await axios.get(link.href, { 
                responseType: 'arraybuffer',
                timeout: 30000 // Increase timeout for large PDFs
            });
            
            let content = "";
            let parseSuccess = false;
            
            try {
                if (doc.mime_type === 'application/pdf') {
                    const data = await pdf(Buffer.from(res.data));
                    content = data.text;
                    parseSuccess = true;
                } else {
                    content = Buffer.from(res.data).toString('utf8');
                    parseSuccess = true;
                }
            } catch (parseErr) {
                console.error('PDF Parse Error:', parseErr);
            }

            const fileNameContext = `[FILE RECEIVED: ${doc.file_name}]`;
            const finalContext = parseSuccess ? `${fileNameContext}\n${content.substring(0, 7000)}` : `${fileNameContext} (หมายเหตุ: ไฟล์นี้อ่านเนื้อหาข้างในไม่สำเร็จ แต่อาจเดาบริบทจากชื่อไฟล์ได้ครับ)`;
            
            await processStacyAI(ctx, ctx.message.caption || "", finalContext);
        } catch (e) {
            console.error('Global Document Error:', e);
            ctx.reply(`❌ ขออภัยครับเจ้านาย ผมพยายามดึงไฟล์ "${doc.file_name}" แล้วแต่เกิดขัดข้องที่ระบบการรับส่งไฟล์ครับ`);
        }
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
