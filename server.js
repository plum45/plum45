require('dotenv').config();
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
const { exec } = require('child_process');
const screenshot = require('screenshot-desktop');
const si = require('systeminformation');
const cron = require('node-cron');
const puppeteer = require('puppeteer');



// ========== Configuration & Global State ==========
const CONFIG = {
    PORT: process.env.PORT || 10000,
    VERSION: '1.2.5-Premium',
    SYS_NAME: 'Stacy 7-Pillar AI',
    NVIDIA_URL: 'https://integrate.api.nvidia.com/v1/chat/completions',
    MODEL: 'moonshotai/kimi-k2-instruct'
};
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || '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';
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '7435216335:AAEPclIdh6IatC228uK6I2X9m3-O82u_yks';
const IS_RENDER = !!process.env.RENDER;
const PORT = CONFIG.PORT;

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
    if (!db) return { facts: [], identity: "Stacy (เลขาขี้เล่น)" };
    try {
        const doc = await db.collection('userActivities').doc(String(userId)).get();
        const data = doc.exists ? doc.data() : {};
        return {
            facts: data.facts || [],
            identity: data.identity || "Stacy (เลขาขี้เล่น)"
        };
    } catch (e) { return { facts: [], identity: "Stacy (เลขาขี้เล่น)" }; }
}

// Utility: Save and Sync functions are defined below for architectural clarity.


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

async function logToTerminal(userId, command, output) {
    if (!db) return;
    try {
        await db.collection('userActivities').doc(String(userId)).collection('terminalLogs').add({
            command,
            output: output.substring(0, 500),
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
    } catch (e) { console.error('Log to Terminal Error:', e); }
}


// OpenClaw-inspired: Intelligent Message Chunking
async function smartReply(ctx, text) {
    if (!text || text.length === 0) return;
    const LIMIT = 4000; // Safe Telegram limit
    if (text.length <= LIMIT) {
        return await ctx.reply(text).catch(e => console.error('Reply Error:', e));
    }

    const sentences = text.match(/[^.!?\n]+[.!?\n]+/g) || [text];
    let chunk = "";
    for (const sentence of sentences) {
        if ((chunk + sentence).length > LIMIT) {
            await ctx.reply(chunk);
            chunk = sentence;
        } else {
            chunk += sentence;
        }
    }
    if (chunk) await ctx.reply(chunk);
}
async function sendSmartImage(ctx, source, caption) {
    try {
        // Try sending as photo first (prettier)
        await ctx.replyWithPhoto({ source }, { caption });
    } catch (err) {
        if (err.description && err.description.includes('PHOTO_INVALID_DIMENSIONS')) {
            console.log('⚠️ Photo dimensions invalid, falling back to document mode...');
            await ctx.replyWithDocument({ source, filename: 'capture.png' }, { 
                caption: caption + '\n\n(หมายเหตุ: ส่งเป็นไฟล์เนื่องจากขนาดภาพไม่รองรับโหมดรูปภาพครับ)' 
            });
        } else {
            throw err;
        }
    }
}


async function handleAgentActions(ctx, action, data, userId) {
    if (!db) return;
    const userRef = db.collection('userActivities').doc(String(userId));

    switch (action) {
        case 'SAVE_TASK':
        case 'ADD_CALENDAR_EVENT':
            // Unified Calendar & Task Protocol
            try {
                const rawTime = data.startTime || data.time || data.date;
                let parsedTime = new Date().toISOString(); // Default to now
                
                if (rawTime) {
                    const d = new Date(rawTime);
                    if (!isNaN(d.getTime())) {
                        parsedTime = d.toISOString();
                    } else {
                        // Attempt fallback for strings like "2026-03-15 10:00"
                        const d2 = new Date(rawTime.replace(' ', 'T') + 'Z');
                        if (!isNaN(d2.getTime())) parsedTime = d2.toISOString();
                    }
                }

                const eventData = {
                    title: (data.title || "Untitled Task").trim(),
                    time: parsedTime,
                    description: (data.description || data.note || '').trim(),
                    status: data.status || 'scheduled',
                    type: action,
                    userId: String(userId), // Traceability
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                };

                // Save to Firestore 'tasks' collection for Web Dashboard
                const taskRef = await userRef.collection('tasks').add(eventData);
                
                // Log to terminal for visual feedback on dashboard
                await logToTerminal(userId, `CALENDAR_SYNC`, `Added: ${eventData.title} at ${eventData.time}`);

                // Sync to External if available
                const userDoc = await userRef.get();
                const webhookUrl = userDoc.data()?.calendarWebhookUrl;
                
                if (webhookUrl) {
                    try {
                        await axios.post(webhookUrl, { action: 'ADD_CALENDAR', title: eventData.title, start: eventData.time, description: eventData.description });
                        await ctx.reply(`📅 บันทึกและซิงค์กับ Google Calendar แล้ว: "${eventData.title}"`);
                    } catch (e) {
                        await ctx.reply(`⚠️ บันทึกในระบบแล้ว แต่ซิงค์ภายนอกล้มเหลว: ${e.message}`);
                    }
                } else {
                    await ctx.reply(`✅ บันทึกนัดหมาย "${eventData.title}" ลงปฏิทินในหน้า Dashboard เรียบร้อยครับ!\n\n💡 **อย่าลืม:** นำ ID \`${userId}\` ไปใส่ในช่อง "Telegram ID Sync" ในหน้า Dashboard เพื่อดูปฏิทินนะครับ`);
                }
            } catch (err) {
                console.error('Calendar Action Error:', err);
                await ctx.reply(`❌ ไม่สามารถบันทึกนัดหมายได้: ${err.message}`);
            }
            break;
        case 'WORK_LOG':
            await userRef.collection('logs').add({
                content: data.note,
                type: data.type || 'general',
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
            await ctx.reply(`📝 บันทึกกิจกรรมให้แล้วครับ: ${data.note}`);
            break;
        case 'SYNC_USER':
            // Automatically handled by syncUser middleware now, but kept for explicit calls
            break;

        case 'IMAGE_GEN':
            // Pillar 7: The "No-Failure" Visual Protocol (OpenClaw delivery style)
            const loadingMsg = await ctx.reply('🎨 Stacy กำลังรังสรรค์รูปภาพให้ครับเจ้านาย... (อาจใช้เวลา 15-45 วินาที)');
            try {
                const rawPrompt = data.prompt || "highly detailed masterpiece";
                const cleanPrompt = rawPrompt.replace(/[^\w\s]/gi, '').substring(0, 300) || "digital art";
                const seed = Math.floor(Math.random() * 1000000);
                
                const models = ['flux', 'turbo', 'any'];
                let success = false;
                let buffer = null;
                let lastError = "";

                // Strategy: Internal fetch only. Do NOT trust Telegram's fetch for redirecting/slow APIs.
                for (const model of models) {
                    try {
                        const targetUrl = `https://pollinations.ai/p/${encodeURIComponent(cleanPrompt)}?width=1024&height=1024&seed=${seed}&model=${model}&nologo=true`;
                        console.log(`🖼️ Stacy Fetch [${model}]: ${targetUrl}`);
                        
                        const response = await axios.get(targetUrl, { 
                            responseType: 'arraybuffer',
                            timeout: 55000, 
                            headers: { 'User-Agent': 'Mozilla/5.0' }
                        });
                        
                        if (response.data && response.data.length > 3000) {
                            buffer = Buffer.from(response.data);
                            success = true;
                            break;
                        }
                    } catch (e) {
                        lastError = e.message;
                        console.warn(`⚠️ IMAGE_GEN Step Failed [${model}]: ${e.message}`);
                    }
                }

                const caption = `✨ วาดเสร็จแล้วครับ!\n📌 คำสั่ง: ${cleanPrompt}`;
                if (success && buffer) {
                    if (data.highRes) {
                        await ctx.replyWithDocument({ source: buffer, filename: `stacy_art_${seed}.png` }, { caption });
                    } else {
                        await ctx.replyWithPhoto({ source: buffer }, { caption });
                    }
                } else {
                    // FINAL FAILSAFE: Instead of passing URL to Telegram (which fails with 400), 
                    // we give the user a direct clickable link to the image.
                    const finalLink = `https://pollinations.ai/p/${encodeURIComponent(cleanPrompt)}?seed=${seed}&model=flux`;
                    await ctx.reply(`⚠️ ระบบเบื้องหลังขัดข้องเล็กน้อยครับ (Error: ${lastError})\n\nเจ้านายสามารถกดดูรูปที่ผมวาดไว้ที่นี่ได้เลยครับ:\n🔗 ${finalLink}`);
                }
            } catch (err) {
                console.error('❌ IMAGE_GEN Fatal:', err.message);
                ctx.reply(`❌ ขออภัยครับเจ้านาย ผมหาทางวาดให้จนสุดทางแล้วแต่ไม่ได้จริงๆ: ${err.message}`);
            } finally {
                await ctx.deleteMessage(loadingMsg.message_id).catch(() => {});
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
        case 'EXECUTE_COMMAND':
            // Pillar 8: Terminal Authority (Personal Agent Mode)
            const lowCmd = data.command.toLowerCase();
            if (lowCmd.includes('screenshot') || lowCmd.includes('screencapture')) {
                await ctx.reply('⚠️ ตรวจพบว่าคุณพยายามใช้คำสั่ง Shell เพื่อแคปจอ ผมจะเปลี่ยนมาใช้ระบบ Internal Capture ที่เสถียรกว่าให้แทนครับ...');
                return handleAgentActions(ctx, 'SCREEN_CAPTURE', {}, userId);
            }
            await ctx.reply(`💻 กำลังรันคำสั่ง: \`${data.command}\``);

            exec(data.command, { timeout: 30000 }, async (error, stdout, stderr) => {
                const output = stdout || stderr || "(ไม่มีข้อมูลส่งกลับ)";
                await logToTerminal(userId, data.command, output);
                if (error) {
                    await ctx.reply(`❌ คำสั่งขัดข้อง:\n\`\`\`\n${error.message}\n\`\`\``);
                    return;
                }
                await smartReply(ctx, `🖥️ ผลลัพธ์จากคอมพิวเตอร์:\n\`\`\`\n${output.substring(0, 3500)}\n\`\`\``);
            });
            break;
        case 'SCREEN_CAPTURE':
            try {
                const imgPath = path.join(__dirname, `screenshot_${Date.now()}.png`);
                await screenshot({ filename: imgPath });
                await sendSmartImage(ctx, imgPath, '📸 จับภาพหน้าจอปัจจุบันให้แล้วครับเจ้านาย');
                if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
                await logToTerminal(userId, 'SCREEN_CAPTURE', 'Captured and sent to Telegram');
            } catch (err) { ctx.reply(`❌ แคปหน้าจอไม่สำเร็จ: ${err.message}`); }
            break;
        case 'GET_PC_STATS':
            try {
                const [cpu, mem, load] = await Promise.all([si.cpu(), si.mem(), si.currentLoad()]);
                const stats = `🖥️ **PC Status Update**\n- CPU: ${cpu.manufacturer} ${cpu.brand}\n- Load: ${load.currentLoad.toFixed(2)}%\n- RAM: ${(mem.used / 1024/1024/1024).toFixed(2)} / ${(mem.total / 1024/1024/1024).toFixed(2)} GB`;
                await ctx.reply(stats);
                await logToTerminal(userId, 'GET_PC_STATS', stats);
            } catch (err) { ctx.reply(`❌ ดึงข้อมูลระบบไม่สำเร็จ: ${err.message}`); }
            break;
        case 'MORNING_BRIEF':
            try {
                await ctx.reply('☀️ กำลังรวบรวม Morning Briefing ให้เจ้านายสักครู่ครับ...');
                const query = data.interests || "ข่าวยอดนิยมวันนี้";
                const news = await performSearch(query);
                const brief = `☀️ **Morning Briefing วันนี้**\n\n📌 **สรุปข่าว:**\n${news.substring(0, 500)}...\n\n🎶 **คำแนะนำวันนี้:**\nลองฟังเพลง "Lo-fi Chill" เพื่อสมาธิที่ดีนะครับ!\n\n📅 **คิวงานวันนี้:**\n(ตรวจสอบได้ที่หน้า Dashboard ตลอดเวลาครับ)`;
                await smartReply(ctx, brief);
                await logToTerminal(userId, 'MORNING_BRIEF', 'Morning briefing delivered');
            } catch (err) { ctx.reply(`❌ Morning Brief ไม่สำเร็จ: ${err.message}`); }
            break;
        case 'WEB_BROWSE':
            let browser = null;
            let screenshotPath = path.join(__dirname, `web_capture_${Date.now()}.png`);
            try {
                await ctx.reply('🌐 กำลังเปิดเบราว์เซอร์เพื่อเข้าถึงข้อมูลและแคปหน้าจอให้ครับ...');
                browser = await puppeteer.launch({ 
                    headless: "new",
                    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
                });
                const page = await browser.newPage();
                await page.setViewport({ width: 1440, height: 900 });
                
                let targetUrl = data.url;
                if (!targetUrl && data.query) {
                    const searchRes = await google.search(data.query);
                    if (searchRes.results && searchRes.results.length > 0) {
                        targetUrl = searchRes.results[0].url;
                    }
                }

                if (!targetUrl) throw new Error("ไม่พบ URL หรือคำค้นหาที่ถูกต้อง");

                await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 50000 });
                
                if (data.selector) {
                    const element = await page.$(data.selector);
                    if (element) {
                        await element.screenshot({ path: screenshotPath });
                    } else {
                        await page.screenshot({ path: screenshotPath });
                    }
                } else {
                    await page.screenshot({ path: screenshotPath, fullPage: data.fullPage || false });
                }

                await sendSmartImage(ctx, screenshotPath, `🌐 แคปภาพจาก: ${targetUrl}\n${data.selector ? `🎯 ส่วนที่เลือก: ${data.selector}` : ''}`);
                
                await logToTerminal(userId, 'WEB_BROWSE', `Captured site: ${targetUrl}`);
            } catch (err) {
                ctx.reply(`❌ ภารกิจเบราว์เซอร์ล้มเหลว: ${err.message}`);
                console.error('Web Browse Error:', err);
            } finally {
                if (browser) await browser.close();
                if (fs.existsSync(screenshotPath)) fs.unlinkSync(screenshotPath);
            }
            break;
        case 'FETCH_API':
            // { url: "...", method: "GET/POST", data: {}, headers: {} }
            try {
                await ctx.reply(`🌐 กำลังเรียกใช้ API: \`${data.url}\`...`);
                const res = await axios({
                    url: data.url,
                    method: data.method || 'GET',
                    data: data.data,
                    headers: data.headers || { 'Content-Type': 'application/json' },
                    timeout: 15000
                });
                const resStr = JSON.stringify(res.data, null, 2);
                await smartReply(ctx, `📡 ตอบกลับจาก API:\n\`\`\`json\n${resStr.substring(0, 3000)}\n\`\`\``);
                await logToTerminal(userId, `FETCH_API ${data.method || 'GET'}`, data.url);
            } catch (err) {
                ctx.reply(`❌ เรียก API ล้มเหลว: ${err.message}`);
                await logToTerminal(userId, 'FETCH_API ERROR', err.message);
            }
            break;
        case 'READ_FILE':



            try {
                const content = fs.readFileSync(data.path, 'utf8');
                await smartReply(ctx, `📄 เนื้อหาไฟล์ \`${data.path}\`:\n\n${content.substring(0, 3500)}`);
            } catch (err) { ctx.reply(`❌ อ่านไฟล์ไม่สำเร็จ: ${err.message}`); }
            break;
        case 'SEARCH_MEMORIES':
            try {
                const snap = await userRef.collection('history').orderBy('timestamp', 'desc').limit(10).get();
                const past = snap.docs.map(doc => `[Past] User: ${doc.data().user} | Bot: ${doc.data().bot}`).join('\n');
                await ctx.reply(`🧠 ย้อนความจำให้แล้วครับ จากประวัติล่าสุด:\n\n${past || "ยังไม่มีประวัติการคุยครับ"}`);
            } catch (err) { ctx.reply(`❌ ดึงความจำไม่สำเร็จ: ${err.message}`); }
            break;
        case 'ADD_MEMORY_FACT':
            try {
                await userRef.update({
                    facts: admin.firestore.FieldValue.arrayUnion(data.fact)
                });
                await ctx.reply(`🧠 จดจำความต้องการใหม่ของเจ้านายแล้วครับ: "${data.fact}"`);
                await logToTerminal(userId, 'MEMORY_UPDATE', `New fact: ${data.fact}`);
            } catch (err) { ctx.reply(`❌ บันทึกความจำไม่สำเร็จ: ${err.message}`); }
            break;
    }
}


async function saveBotMemory(userId, userMsg, botReply) {
    if (!db) return;
    try {
        const userRef = db.collection('userActivities').doc(String(userId));
        
        // Save history
        await userRef.collection('history').add({
            user: userMsg,
            bot: botReply,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        // Heuristic Fact Extraction (can be improved by LLM later)
        const factPatterns = [
            { re: /(?:ฉันชื่อ|ผมชื่อ|เรียกผมว่า)\s*([^\n\s]+)/i, template: "เจ้านายชื่อ: $1" },
            { re: /(?:ชอบกิน|ของโปรดคือ)\s*([^\n\s]+)/i, template: "เจ้านายชอบกิน: $1" },
            { re: /(?:แพ้|ไม่กิน)\s*([^\n\s]+)/i, template: "เจ้านายแพ้/ไม่กิน: $1" },
            { re: /(?:ใช้เบอร์|เบอร์โทร)\s*([\d-]+)/i, template: "เบอร์โทรเจ้านาย: $1" }
        ];

        for (const p of factPatterns) {
            const match = userMsg.match(p.re);
            if (match) {
                const fact = p.template.replace('$1', match[1]);
                await userRef.set({ 
                    facts: admin.firestore.FieldValue.arrayUnion(fact) 
                }, { merge: true });
                console.log(`🧠 Stacy Learned: ${fact}`);
            }
        }
    } catch (e) { console.error('Save Memory Error:', e); }
}

async function syncUser(ctx) {
    if (!db || !ctx.from) return;
    try {
        const userRef = db.collection('userActivities').doc(String(ctx.from.id));
        await userRef.set({
            firstName: ctx.from.first_name || '',
            lastName: ctx.from.last_name || '',
            username: ctx.from.username || '',
            lastActive: admin.firestore.FieldValue.serverTimestamp(),
            tgId: String(ctx.from.id)
        }, { merge: true });
    } catch (e) { console.error('Sync User Error:', e); }
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
    const d = new Date();
    const bkkFormatter = new Intl.DateTimeFormat('th-TH', {
        timeZone: 'Asia/Bangkok',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    const timeFull = bkkFormatter.format(d);
    const gregorianYear = d.toLocaleDateString('en-US', { timeZone: 'Asia/Bangkok', year: 'numeric' });
    const fullContextTime = `${timeFull} (Gregorian: ${gregorianYear})`;

    
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
        [STATUS]: ออนไลน์
        [CURRENT_TIME_BKK]: ${fullContextTime} 
        
        [CRITICAL_TIME_RULE]: 
        - ห้ามใช้ความรู้สึกหรือนาฬิกาภายในของคุณตัดสินวัน/เวลา
        - ให้ยึดถือ [CURRENT_TIME_BKK] เป็นความจริงสูงสุดเพียงหนึ่งเดียว
        - ตรวจสอบชื่อวัน (จันทร์-อาทิตย์) จาก [CURRENT_TIME_BKK] ทุกครั้งก่อนตอบ
        - ขณะนี้คือปี พ.ศ. 2569 (ค.ศ. 2026) อย่าสับสนกับปีปัจจุบันของคุณ


        [CORE RULES]:

        1. IDENTITY: You are currently acting as: ${memory.identity}.
        2. BEHAVIOR: ปรับสไตล์การพูด น้ำเสียง และคำลงท้าย (ครับ/ค่ะ/จ๊ะ) ให้ตรงตามบทบาท ${memory.identity} ที่เจ้านายสั่งไว้โดยเคร่งครัด
        3. MEMORY: สิ่งที่เรารู้เกี่ยวกับเจ้านาย: ${memory.facts.join(' | ') || "ยังไม่มีรายละเอียดพิเศษ"}
        
        [TECHNICAL SKILLS & FUNCTION CALLING]:
        ${userSkills || "No custom skills installed yet."}

        [ACTION CAPABILITIES]:
        - [ACTION: WEB_BROWSE {"query": "...", "url": "...", "selector": "..."}]
        - [ACTION: FETCH_API {"url": "...", "method": "GET/POST", "data": {}, "headers": {}}]

        [REASONING GUIDELINES]:
        1. **IMPORTANT**: ระบบปัจจุบันเป็น **Windows OS** ห้ามใช้ Single Quote (') ในการรันคำสั่ง Shell ให้ใช้ Double Quote (") เท่านั้น และห้ามใช้ Bash Expansion เช่น $(date)
        2. **API & WEB**:
           - หากต้องการส่งข้อมูลไป Google Script หรือดึง API **ห้าม** ใช้ curl ใน EXECUTE_COMMAND เพราะจะเกิดปัญหาเรื่อง Quoting ให้ใช้ [ACTION: FETCH_API] แทน
           - หากต้องการค้นหาข้อมูลตัวอักษร -> [ACTION: WEB_SEARCH]
           - หากต้องการเห็นภาพหน้าเว็บ -> [ACTION: WEB_BROWSE]
        3. **SCREEN & PC**:
           - หากเจ้านายสั่ง "แคปจอ" -> [ACTION: SCREEN_CAPTURE {}] **(ห้ามใช้ Shell command)**
           - หากเจ้านายสั่ง "เช็กแรม/สเปก" -> [ACTION: GET_PC_STATS {}] **(ห้ามใช้ Shell command)**

        4. หากเจ้านายต้องการสรุปช่วงเช้า หรือ "Morning Brief" ให้ใช้ [ACTION: MORNING_BRIEF {"interests": "..."}]
        5. หากเจ้านายสั่งให้ "ทำงานในคอม", "เปิดโปรแกรม" หรือ "เช็คไฟล์" ให้ใช้ [ACTION: EXECUTE_COMMAND {"command": "..."}]
        6. หากเจ้านายสั่งให้ "อ่านไฟล์..." ในเครื่อง ให้ใช้ [ACTION: READ_FILE {"path": "..."}]
        7. หากเจ้านายถามเรื่องที่เคยคุยกันไปแล้ว ให้ใช้ [ACTION: SEARCH_MEMORIES {}]
        8. หากเจ้านายสั่งให้ "วาดรูป" ให้ใช้ [ACTION: IMAGE_GEN {"prompt": "..."}]
        9. หากขั้นตอนซับซ้อน ให้หยุดถามเจ้านายเพื่อยืนยัน (BTW Side Question approach)
        10. **CALENDAR RULE**: ทุกครั้งที่ใช้ SAVE_TASK หรือ ADD_CALENDAR_EVENT ต้องส่งค่า "time" เป็นรูปแบบ **ISO 8601 (YYYY-MM-DDTHH:mm:00)** เท่านั้น เพื่อให้ระบบ Dashboard แสดงผลได้ถูกต้อง และนัดหมายจะไปปรากฏที่หน้าปฏิทินทันทีครับ`;



        const response = await axios.post(CONFIG.NVIDIA_URL, {
            model: CONFIG.MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                ...userStore.history.slice(-10),
                { role: 'user', content: finalInput }
            ],
            temperature: 0.7,
            max_tokens: 32768
        }, {
            headers: { 'Authorization': `Bearer ${NVIDIA_API_KEY}`, 'Content-Type': 'application/json' },
            timeout: 60000 
        });

        const reply = response.data.choices[0].message.content;
        const { cleanText, actions } = extractActions(reply);
        
        // Using smartReply for robust delivery (Chunking support)
        await smartReply(ctx, cleanText || "ผมกำลังประมวลผลข้อมูลอยู่ครับ...");
        
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

const { Markup } = require('telegraf');

if (bot) {
    const mainMenu = Markup.keyboard([
        ['📡 Status', '🧠 Who Am I?'],
        ['🛠️ Skills', '🆔 My ID'],
        ['📅 Dashboard']
    ]).resize();

    bot.start((ctx) => {
        ctx.reply(`✨ **Stacy Premium v1.2.5**\n\nสวัสดีครับเจ้านาย! ผมคือ Stacy 7-Pillar AI พร้อมดูแลทั้งงานเขียนโค้ด, นัดหมาย และระบบอัตโนมัติแล้วครับ\n\n🚀 **เริ่มต้นใช้งาน:**\n- ลองพิมพ์สั่งงานผมได้เลย\n- หรือใช้เมนูด้านล่างเพื่อดูข้อมูลระบบครับ`, mainMenu);
    });

    bot.help((ctx) => {
        ctx.reply(`📖 **คู่มือการใช้งาน Stacy AI**\n\n1. **การสั่งงาน:** พิมพ์คุยได้ปกติเหมือนคุยกับคน\n2. **นัดหมาย:** "เตือนฉันซ้อมวิ่งเย็นนี้ 6 โมง" (จะลิ้งค์ไปที่ Dashboard)\n3. **สกิลอัจฉริยะ:** "จดจำว่าถ้าฉันส่งโค้ด Python ให้คุณช่วยรีแฟคเตอร์ให้คลีนขึ้นด้วย"\n4. **ไฟล์:** ส่ง PDF หรือ Text ไฟล์มาให้สรุปได้\n\n💡 **Tip:** นำ ID ไปใส่ในหน้าเว็บเพื่อซิงค์ข้อมูลนัดหมายครับ`);
    });

    bot.hears('📡 Status', (ctx) => {
        ctx.reply(`📡 **Stacy System Status**\n━━━━━━━━━━━━━━━━━━━━\n🟢 **Backend:** Online\n🔥 **Firebase:** ${firebaseStatus}\n🚀 **Engine:** moonshotai/kimi-k2\n✨ **Version:** 1.2.5-Premium\n━━━━━━━━━━━━━━━━━━━━`, Markup.inlineKeyboard([
            [Markup.button.callback('Check Again', 'refresh_status')]
        ]));
    });

    bot.hears('🧠 Who Am I?', async (ctx) => {
        const memory = await getBotMemory(ctx.from.id);
        ctx.reply(`🧠 **ตัวตนปัจจุบันของผม:**\n━━━━━━━━━━━━━━━━━━━━\n"${memory.identity}"\n━━━━━━━━━━━━━━━━━━━━\n\n*(หากต้องการปรับเปลี่ยน บุคลิก สั่งผมได้เลยครับ)*`);
    });

    bot.hears('🛠️ Skills', async (ctx) => {
        const snap = await db.collection('userActivities').doc(String(ctx.from.id)).collection('skills').get();
        if (snap.empty) return ctx.reply('🛠️ **ยังไม่มีสกิลที่ติดตั้งครับ**\nลองส่งชุดคำสั่งที่อยากให้ผมทำเป็นประจำมาสิครับ!');
        let text = "🛠️ **คลังสกิลของคุณ:**\n━━━━━━━━━━━━━━━━━━━━\n";
        snap.forEach(doc => text += `🔹 **${doc.id}**: ${doc.data().description}\n`);
        ctx.reply(text);
    });

    bot.hears('🆔 My ID', (ctx) => {
        ctx.reply(`🆔 **ID ของเจ้านายคือ:**\n\n\`${ctx.from.id}\`\n\nนำไปใส่ในช่อง "Telegram ID Sync" ในหน้า Dashboard นะครับ!`);
    });

    bot.hears('📅 Dashboard', (ctx) => {
        ctx.reply(`🌐 **เข้าสู่หน้า Dashboard**\n\nจัดการนัดหมาย, ดูรันไทม์ และระบบเมมโมรี่ได้ทางเว็บเลยครับ:`, Markup.inlineKeyboard([
            [Markup.button.url('Open Dashboard', 'https://stacy-ai.vercel.app')]
        ]));
    });

    bot.command('status', (ctx) => {
        ctx.reply(`📡 **Stacy System Status**\n━━━━━━━━━━━━━━━━━━━━\n🟢 **Backend:** Online\n🔥 **Firebase:** ${firebaseStatus}\n🚀 **Engine:** moonshotai/kimi-k2\n✨ **Version:** 1.2.5-Premium\n━━━━━━━━━━━━━━━━━━━━`);
    });
    bot.command('skills', async (ctx) => {
        const snap = await db.collection('userActivities').doc(String(ctx.from.id)).collection('skills').get();
        if (snap.empty) return ctx.reply('🛠️ **ยังไม่มีสกิลที่ติดตั้งครับ**');
        let text = "🛠️ **คลังสกิลของคุณ:**\n";
        snap.forEach(doc => text += `🔹 **${doc.id}**: ${doc.data().description}\n`);
        ctx.reply(text);
    });
    bot.command('whoami', async (ctx) => {
        const memory = await getBotMemory(ctx.from.id);
        ctx.reply(`🧠 **ตัวตนปัจจุบันของผม:**\n"${memory.identity}"`);
    });
    bot.command('myid', (ctx) => {
        ctx.reply(`🆔 **ID ของเจ้านายคือ:** \`${ctx.from.id}\``);
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
        const userId = ctx.from.id;
        const userMsg = ctx.message.text;
        try {
            await ctx.sendChatAction('typing');
            await syncUser(ctx);
            if (!tgContexts.has(userId)) tgContexts.set(userId, { history: [] });
            await processStacyAI(ctx, userMsg);
        } catch (e) {
            console.error('Text Error:', e);
            ctx.reply('❌ ระบบประมวลผลข้อความขัดข้อง รบกวนลองใหม่อีกครั้งครับ');
        }
    });

    bot.on('photo', async (ctx) => {
        const userId = ctx.from.id;
        try {
            await ctx.sendChatAction('typing');
            await syncUser(ctx);
            const photo = ctx.message.photo.pop();
            const fileId = photo.file_id;
            const fileUrl = await ctx.telegram.getFileLink(fileId);
            
            const caption = ctx.message.caption || "";
            await ctx.reply('📸 ได้รับรูปภาพแล้วครับ! กำลังพยายามทำความเข้าใจภาพและบริบทที่เจ้านายส่งมานะครับ...');
            
            if (!tgContexts.has(userId)) tgContexts.set(userId, { history: [] });
            await processStacyAI(ctx, `[เจ้านายส่งรูปภาพมา] ${caption}`, fileUrl.href);
        } catch (e) {
            console.error('Photo Error:', e);
            ctx.reply('❌ ไม่สามารถดึงข้อมูลรูปภาพเพื่อวิเคราะห์ได้ครับ');
        }
    });


    bot.catch((err, ctx) => {
        console.error(`🔥 Telegram Global Error [${ctx.updateType}]:`, err);
        ctx.reply('🔴 เกิดข้อผิดพลาดร้ายแรงที่ระบบบอทครับ ผมกำลังแจ้งเตือนทีมวิศวกร (หรือเจ้านาย) ให้ตรวจสอบให้ครับ');
    });
}

// ========== Web Server Routes ==========

app.get('/', (req, res) => res.json({ 
    status: 'online', 
    name: CONFIG.SYS_NAME,
    version: CONFIG.VERSION,
    firebase: firebaseStatus 
}));

app.get('/api/health', (req, res) => {
    res.json({
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
    });
});

app.post('/api/telegram-webhook', async (req, res) => {
    if (bot) {
        try {
            await bot.handleUpdate(req.body, res);
        } catch (err) { console.error('Webhook Error:', err); }
    }
    if (!res.writableEnded) res.status(200).send('OK');
});

// ========== Housekeeping & Heartbeat ==========
cron.schedule('0 * * * *', () => {
    console.log('💓 System Heartbeat: Node is healthy');
});

// ========== Global Error Bridge ==========
process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 Critical Unhandled Rejection:', reason);
});

// ========== Start Server ==========
app.listen(PORT, () => {
    console.log(`🚀 Stacy Premium v${CONFIG.VERSION} running on port ${PORT}`);
    if (bot && !IS_RENDER) {
        bot.launch()
           .then(() => console.log("🤖 Bot Polling Started (Local)"))
           .catch(err => console.error("❌ Bot Launch Failed:", err));
    }
});
