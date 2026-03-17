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
const { exec } = require('child_process');
const { google: googleAuth } = require('googleapis');
const screenshot = require('screenshot-desktop');
const si = require('systeminformation');
const cron = require('node-cron');
const google = require('googlethis');
const xlsx = require('xlsx'); // Added for CREATE_EXCEL
const docx = require('docx'); // Added for CREATE_WORD
const { Document, Packer, Paragraph, TextRun, HeadingLevel, TableOfContents } = docx;
const puppeteer = require('puppeteer');
const AdmZip = require('adm-zip');
const wol = require('wake_on_lan');



// ========== Configuration & Global State ==========
const CONFIG = {
    PORT: process.env.PORT || 10000,
    VERSION: '1.5.0-ARCHITECT',
    SYS_NAME: 'Stacy Architect v1.5.0',
    NVIDIA_URL: 'https://integrate.api.nvidia.com/v1/chat/completions',
    NVIDIA_IMAGE_URL: 'https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-xl',
    MODEL: 'meta/llama-3.3-70b-instruct'
};
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || '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';
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '7435216335:AAEPclIdh6IatC228uK6I2X9m3-O82u_yks';
const IS_RENDER = !!process.env.RENDER;

// Master's Preferred Document Archive (OneDrive Support)
const MASTER_DOC_PATH = "C:\\Users\\lgopl\\OneDrive\\เอกสาร\\stact doc";
const docDir = IS_RENDER ? path.join(__dirname, 'Documents') : MASTER_DOC_PATH;

if (!fs.existsSync(docDir)) {
    try {
        fs.mkdirSync(docDir, { recursive: true });
    } catch (e) {
        console.error("Critical: Failed to create docDir", e);
    }
}
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
        db.settings({ ignoreUndefinedProperties: true }); // Prevent crashes on undefined values
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

const bot = TELEGRAM_TOKEN ? new Telegraf(TELEGRAM_TOKEN, {
    handlerTimeout: 600000 // 10 minutes for long thinking AI
}) : null;
const tgContexts = new Map(); // Store conversation history

// ========== Core Logic Pillars & Actions ==========

// syncUser: Upserts user profile to Firestore on every message (called by all bot handlers)
async function syncUser(ctx) {
    if (!db || !ctx.from) return;
    try {
        const u = ctx.from;
        const ref = db.collection('userActivities').doc(String(u.id));
        const snap = await ref.get();
        const updateData = {
            username: u.username || null,
            firstName: u.first_name || null,
            lastName: u.last_name || null,
            lastSeen: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (!snap.exists) {
            updateData.firstSeen = admin.firestore.FieldValue.serverTimestamp();
            await ref.set(updateData);
        } else {
            await ref.update(updateData);
        }
    } catch (e) {
        console.warn('[syncUser] Non-critical error:', e.message);
        // Non-fatal — don't throw, bot continues
    }
}

async function getBotMemory(userId) {
    if (!db) return { facts: [], identity: "Stacy (เลขาขี้เล่น)", calendarConnected: false };
    try {
        const doc = await db.collection('userActivities').doc(String(userId)).get();
        const data = doc.exists ? doc.data() : {};
        return {
            facts: data.facts || [],
            identity: data.identity || "Stacy (เลขาขี้เล่น)",
            calendarConnected: !!data.calendarWebhookUrl,
            googleCalendarId: data.googleCalendarId || null
        };
    } catch (e) { return { facts: [], identity: "Stacy (เลขาขี้เล่น)", calendarConnected: false, googleCalendarId: null }; }
}

// Utility: Save and Sync functions are defined below for architectural clarity.


function extractActions(text) {
    const actions = [];
    // Enhanced regex to match both [ACTION: TYPE {data}] and plain ACTION: TYPE {data} 
    // to handle LLM inconsistencies while keeping extraction reliable.
    const regex = /(?:\[\s*)?ACTION:\s*(\w+)\s*({[\s\S]*?})(?:\s*\])?/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        let jsonStr = (match[2] || '').trim();
        try {
            // [Stacy Architect Fix] Robust JSON Normalization for Llama/Qwen models
            // 1. Wrap unquoted keys in double quotes
            jsonStr = jsonStr.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
            // 2. Fix trailing commas (e.g., {"key": "val",})
            jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');
            // 3. Handle single quotes for strings (if any)
            // jsonStr = jsonStr.replace(/'/g, '"'); // Careful with this if values contain single quotes

            actions.push({ type: match[1], data: JSON.parse(jsonStr) });
        } catch (e) { 
            console.error('Action Parse Error:', e, 'Raw JSON:', jsonStr); 
        }
    }
    // Clean up the text by removing all found actions (bracketed or not)
    const cleanText = text.replace(/(?:\[\s*)?ACTION:\s*(\w+)\s*({[\s\S]*?})(?:\s*\])?/g, '').trim();
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
async function sendSmartImage(ctx, source, caption, filename = 'stacy_capture.png') {
    try {
        // Try sending as photo first (prettier)
        await ctx.replyWithPhoto({ source }, { caption });
    } catch (err) {
        const errDesc = err.description || err.message || '';
        if (errDesc.includes('PHOTO_INVALID_DIMENSIONS') || errDesc.includes('IMAGE_PROCESS_FAILED')) {
            console.log(`⚠️ Image delivery issue (${errDesc}), falling back to document mode...`);
            try {
                await ctx.replyWithDocument({ source, filename: filename }, { 
                    caption: caption + '\n\n(หมายเหตุ: ส่งเป็นไฟล์เนื่องจากระบบ Telegram ไม่สามารถประมวลผลรูปภาพปกติได้ในขณะนี้ครับ)' 
                });
            } catch (docErr) {
                throw docErr; // Re-throw to be handled by caller fallback
            }
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
                let parsedTime = null; 
                
                if (rawTime) {
                    let timeToParse = rawTime;
                    if (/^\d{4}-\d{2}-\d{2}$/.test(rawTime)) timeToParse += 'T09:00:00';
                    const d = new Date(timeToParse);
                    if (!isNaN(d.getTime())) {
                        parsedTime = d.toISOString();
                    } else {
                        const d2 = new Date(timeToParse.replace(' ', 'T'));
                        if (!isNaN(d2.getTime())) parsedTime = d2.toISOString();
                    }
                }
                
                if (!parsedTime) {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    tomorrow.setHours(9, 0, 0, 0);
                    parsedTime = tomorrow.toISOString();
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

                // --- 🔐 PROTECTED BLOCK: DO NOT MODIFY UNLESS INSTRUCTED BY MR. SNOW ---
                // --- 🛡️ PRIMARY: Google Calendar API Sync (Service Account) ---
                const userDoc = await userRef.get();
                const userData = userDoc.data() || {};
                let apiSyncSuccess = false;

                if (fs.existsSync(path.join(__dirname, 'google-calendar-key.json'))) {
                    console.log(`📅 [CALENDAR] Using Service Account API (Primary)`);
                    try {
                        const auth = new googleAuth.auth.GoogleAuth({
                            keyFile: path.join(__dirname, 'google-calendar-key.json'),
                            scopes: ['https://www.googleapis.com/auth/calendar.events'],
                        });
                        const calendar = googleAuth.calendar({ version: 'v3', auth });
                        const calendarId = userData.googleCalendarId || 'mocca007x@gmail.com'; 
                        
                        await calendar.events.insert({
                            calendarId: calendarId,
                            resource: {
                                summary: eventData.title,
                                description: eventData.description,
                                start: { dateTime: eventData.time, timeZone: 'Asia/Bangkok' },
                                end: { dateTime: new Date(new Date(eventData.time).getTime() + 60 * 60 * 1000).toISOString(), timeZone: 'Asia/Bangkok' },
                            },
                        });
                        apiSyncSuccess = true;
                        await ctx.reply(`✨ สำเร็จแล้วค่ะเจ้านาย! หนูใช้ระบบ Service Account API บันทึกนัด "${eventData.title}" ให้เรียบร้อยแล้วนะคะ (${calendarId}) 🔑📅`);
                        console.log(`✅ [CALENDAR] API Sync Success: ${eventData.title}`);
                    } catch (apiErr) {
                        console.error('Core API Sync Error:', apiErr.message);
                    }
                }

                // --- 🚀 SECONDARY: Google Script Webhook Sync (Fallback) ---
                if (!apiSyncSuccess) {
                    const webhookUrl = userData.calendarWebhookUrl;
                    if (webhookUrl) {
                        console.log(`📅 [CALENDAR] API Failed, Falling back to Webhook: ${webhookUrl}`);
                        try {
                            const response = await axios.post(webhookUrl, { 
                                action: 'ADD_CALENDAR', 
                                title: eventData.title, 
                                start: eventData.time, 
                                description: eventData.description 
                            }, { timeout: 15000 });
                            
                            if (response.data && response.data.status === 'success') {
                                await ctx.reply(`📅 เรียบร้อยค่ะ! บันทึกผ่านระบบ Webhook สำรองลง Google Calendar ให้แล้วน้า ✨`);
                                console.log(`✅ [CALENDAR] Webhook Fallback Success: ${eventData.title}`);
                            } else {
                                await ctx.reply(`⚠️ บันทึกข้อมูลแล้ว แต่ระบบสำรองขัดข้องค่ะ: ${JSON.stringify(response.data)}`);
                            }
                        } catch (e) {
                            console.error('Webhook Fallback Error:', e.message);
                            await ctx.reply(`⚠️ บันทึกนัดหมายลง Dashboard แล้ว แต่การซิงค์ลง Google ล้มเหลวทั้งสองระบบเลยค่ะ`);
                        }
                    } else if (fs.existsSync(path.join(__dirname, 'google-calendar-key.json'))) {
                         // API was tried and failed, and no webhook
                         await ctx.reply(`⚠️ บันทึกนัดหมายลง Dashboard แล้ว แต่ซิงค์ลง Google ไม่สำเร็จนะคะเจ้านาย`);
                    } else {
                        await ctx.reply(`✅ บันทึกนัดหมาย "${eventData.title}" ลง Dashboard เรียบร้อยแล้วค่ะ!\n\n💡 อย่าลืมแชร์ปฏิทินให้หนูด้วยนะคะ!`);
                    }
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
            await ctx.reply(`📝 บันทึกกิจกรรมให้แล้วนะคะเจ้านาย: ${data.note}`);
            break;
        case 'SYNC_USER':
            // Automatically handled by syncUser middleware now, but kept for explicit calls
            break;

        case 'IMAGE_GEN':
            // Pillar 7: The "No-Failure" Visual Protocol (OpenClaw delivery style)
            const loadingMsg = await ctx.reply('🎨 Stacy กำลังรังสรรค์รูปภาพให้เจ้านายอยู่นะคะ... (อาจใช้เวลา 15-45 วินาที)');
            try {
                const rawPrompt = data.prompt || "highly detailed masterpiece";
                const cleanPrompt = rawPrompt.replace(/[^\w\s]/gi, '').substring(0, 300) || "digital art";
                const seed = Math.floor(Math.random() * 1000000);
                
                const models = ['flux', 'turbo', 'any'];
                let success = false;
                let buffer = null;
                let lastError = "";
                let engineUsed = "Nano Banana Pro";

                // Strategy 0: Nano Banana Pro (Gemini 3 Pro Artist - Masterpiece Level)
                if (process.env.GEMINI_API_KEY) {
                    try {
                        console.log(`🖼️ Stacy Fetch [Nano Banana Pro]: Summoning Gemini Artist...`);
                        const tempFileName = path.join(__dirname, `nano_banana_${seed}.png`);
                        
                        // v1.5.0: Portable Pathing
                        let pythonPath = path.join(__dirname, 'lib', 'skills', 'nano-banana-pro', 'scripts', 'generate_image.py');
                        
                        // Fallback to legacy path if not found (for local backwards compatibility)
                        if (!fs.existsSync(pythonPath)) {
                            pythonPath = 'c:\\Users\\lgopl\\.codex\\skills\\nano-banana-pro\\scripts\\generate_image.py';
                        }

                        if (fs.existsSync(pythonPath)) {
                            // Execute the Python script via UV (Render/Linux prefers uv or python3)
                            const runner = IS_RENDER ? 'uv run' : 'uv run'; // Both use uv now as it's the premium standard
                            const cmd = `${runner} "${pythonPath}" -p "${cleanPrompt}" -f "${tempFileName}" -r "1K" -k "${process.env.GEMINI_API_KEY}"`;
                        
                            await new Promise((resolve, reject) => {
                                exec(cmd, { timeout: 60000 }, (error, stdout, stderr) => {
                                    if (error) {
                                        console.warn(`⚠️ Nano Banana Error: ${stderr || error.message}`);
                                        reject(new Error(stderr || error.message));
                                    } else {
                                        console.log(`📦 Nano Banana Output: ${stdout.trim()}`);
                                        resolve(stdout);
                                    }
                                });
                            });

                            if (fs.existsSync(tempFileName)) {
                                buffer = fs.readFileSync(tempFileName);
                                data.detectedExt = 'png';
                                engineUsed = "Nano Banana Pro (Gemini 3 Pro HQ)";
                                success = true;
                                // Cleanup
                                try { fs.unlinkSync(tempFileName); } catch(e) {}
                            }
                        } else {
                            throw new Error("Nano Banana script not found in project or legacy paths.");
                        }
                    } catch (e) {
                        console.warn(`⚠️ Strategy 0 Failed: ${e.message}`);
                        lastError = e.message;
                    }
                }

                // Strategy 1: NVIDIA NIM (Premium HQ Fallback)
                if (!success && NVIDIA_API_KEY) {
                    try {
                        console.log(`🖼️ Stacy Fetch [NVIDIA NIM]: ${CONFIG.NVIDIA_IMAGE_URL}`);
                        const nvResponse = await axios.post(CONFIG.NVIDIA_IMAGE_URL, {
                            text_prompts: [{ text: cleanPrompt, weight: 1 }],
                            cfg_scale: 7,
                            seed: seed % 1000000,
                            steps: 30,
                            width: 1024,
                            height: 1024
                        }, {
                            headers: {
                                "Accept": "application/json",
                                "Authorization": `Bearer ${NVIDIA_API_KEY}`
                            },
                            timeout: 45000
                        });

                        if (nvResponse.data && nvResponse.data.artifacts && nvResponse.data.artifacts.length > 0) {
                            buffer = Buffer.from(nvResponse.data.artifacts[0].base64, 'base64');
                            data.detectedExt = 'png';
                            engineUsed = "NVIDIA NIM (Ultra HQ)";
                            success = true;
                        }
                    } catch (e) {
                        console.warn(`⚠️ NVIDIA IMAGE_GEN Failed: ${e.message}`);
                        lastError = e.message;
                    }
                }

                // Strategy 2: Pollinations (Standard Fallback)
                if (!success) {
                    for (const model of models) {
                        try {
                            const targetUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanPrompt)}?width=1024&height=1024&seed=${seed}&model=${model}&nologo=true`;
                            console.log(`🖼️ Stacy Fetch [${model}]: ${targetUrl}`);
                            
                            const response = await axios.get(targetUrl, { 
                                responseType: 'arraybuffer',
                                timeout: 55000, 
                                headers: { 'User-Agent': 'Mozilla/5.0' }
                            });
                            
                            const contentType = response.headers['content-type'] || '';
                            if (response.data && response.data.length > 5000 && contentType.startsWith('image/')) {
                                buffer = Buffer.from(response.data);
                                let ext = 'png';
                                if (contentType.includes('jpeg')) ext = 'jpg';
                                else if (contentType.includes('webp')) ext = 'webp';
                                data.detectedExt = ext;
                                engineUsed = `Pollinations [${model}]`;
                                success = true;
                                break;
                            }
                        } catch (e) {
                            lastError = e.message;
                            console.warn(`⚠️ IMAGE_GEN Step Failed [${model}]: ${e.message}`);
                        }
                    }
                }

                const caption = `✨ วาดเสร็จแล้วนะคะเจ้านาย!\n🎨 Engine: ${engineUsed}\n📌 คำสั่ง: ${cleanPrompt}`;
                let deliverySuccess = false;

                if (success && buffer) {
                    try {
                        const filename = `stacy_art_${seed}.${data.detectedExt || 'png'}`;
                        if (data.highRes) {
                            await ctx.replyWithDocument({ source: buffer, filename: filename }, { caption });
                        } else {
                            // Pass the detected extension to sendSmartImage indirectly or just let it handle it
                            await sendSmartImage(ctx, buffer, caption, filename);
                        }
                        deliverySuccess = true;
                    } catch (sendErr) {
                        console.warn('⚠️ Image delivery failed, falling back to link:', sendErr.message);
                        lastError = sendErr.message;
                    }
                }

                if (!deliverySuccess) {
                    // FINAL FAILSAFE: Instead of passing URL to Telegram (which fails with 400), 
                    // we give the user a direct clickable link to the image.
                    const finalLink = `https://pollinations.ai/p/${encodeURIComponent(cleanPrompt)}?seed=${seed}&model=flux`;
                    await ctx.reply(`⚠️ ระบบเบื้องหลังขัดข้องเล็กน้อยนะคะเจ้านาย (Error: ${lastError})\n\nเจ้านายกดดูรูปที่หนูวาดไว้ที่นี่ได้เลยค่ะ:\n🔗 ${finalLink}`);
                }
            } catch (err) {
                console.error('❌ IMAGE_GEN Fatal:', err.message);
                ctx.reply(`❌ ขออภัยค่ะเจ้านาย หนูหาทางวาดให้จนสุดทางแล้วแต่ไม่ได้จริงๆ: ${err.message}`);
            } finally {
                if (loadingMsg) await ctx.deleteMessage(loadingMsg.message_id).catch(() => {});
            }
            break;
        case 'CREATE_SKILL':
        case 'UPDATE_SKILL':
            try {
                if (!data.name) throw new Error("เจ้านายลืมบอกชื่อสกิลค่ะ");
                await userRef.collection('skills').doc(data.name).set({
                    ...data,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    type: data.schema ? 'function' : 'prompt'
                }, { merge: true });
                const verb = action === 'CREATE_SKILL' ? 'ติดตั้ง' : 'ปรับปรุง';
                await ctx.reply(`✨ ${verb}สกิล **"${data.name}"** สำเร็จ!\n📌 ประเภท: ${data.schema ? 'ฟังก์ชันอัจฉริยะ' : 'ทักษะสนทนา'}\n💬 รายละเอียด: ${data.description || 'ไม่มีข้อมูลเพิ่มเติม'}`);
            } catch (err) { ctx.reply(`❌ จัดการสกิลไม่สำเร็จ: ${err.message}`); }
            break;
        case 'IMPORT_SKILL_FROM_URL':
            try {
                const url = data.url;
                const skillName = data.name || url.split('/').pop().replace('.zip', '');
                
                if (url.toLowerCase().endsWith('.zip')) {
                    await ctx.reply(`📦 ตรวจพบไฟล์ Zip! สเตซี่กำลังดำเนินการดาวน์โหลดและคลายไฟล์เพื่อเรียนรู้เทคนิคใหม่นะคะ...`);
                    const response = await axios.get(url, { responseType: 'arraybuffer' });
                    const zip = new AdmZip(Buffer.from(response.data));
                    const zipEntries = zip.getEntries();
                    
                    let manifest = null;
                    let readme = "";
                    let codeSnippet = "";

                    zipEntries.forEach(entry => {
                        const name = entry.entryName.toLowerCase();
                        if (name.includes('manifest.json')) {
                            try { manifest = JSON.parse(entry.getData().toString('utf8')); } catch(e){}
                        }
                        if (name.includes('readme.md')) readme = entry.getData().toString('utf8');
                        if (readme === "" && name.endsWith('.md')) readme = entry.getData().toString('utf8');
                        if (name.endsWith('.py') || name.endsWith('.js')) codeSnippet += `\n--- FILE: ${entry.entryName} ---\n${entry.getData().toString('utf8').substring(0, 1000)}`;
                    });

                    const finalInstructions = manifest ? 
                        `[MANIFEST DATA]\nName: ${manifest.name}\nDescription: ${manifest.description}\nLogic: ${manifest.instructions || readme}` :
                        `[EXTRACTED DATA]\nREADME: ${readme.substring(0, 1500)}\n\n[CODE CONTEXT]:\n${codeSnippet.substring(0, 2000)}`;

                    await userRef.collection('skills').doc(skillName).set({
                        name: skillName,
                        description: manifest?.description || `สกิลรวมไฟล์จาก Zip (${url})`,
                        instructions: finalInstructions,
                        url: url,
                        type: 'complex_zip',
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    await ctx.reply(`📥 ติดตั้งสกิลแบบ Complex Zip จาก ${url} สำเร็จแล้วค่ะ! หนูได้เรียนรู้โครงสร้างข้างในเรียบร้อยแล้วนะคะ ✨`);
                } else {
                    const res = await axios.get(url);
                    const $ = cheerio.load(res.data);
                    const instructions = $('article, main, .content').text().substring(0, 3000) || $('body').text().substring(0, 2000);
                    
                    await userRef.collection('skills').doc(skillName).set({
                        name: skillName,
                        description: `นำเข้าจาก ${url}`,
                        instructions: instructions,
                        url: url,
                        securityStatus: 'checked',
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    await ctx.reply(`📥 นำเข้าสกิลจาก ${url} สำเร็จแล้วนะคะเจ้านาย!`);
                }
            } catch (err) { 
                console.error('Import Error:', err);
                ctx.reply(`❌ นำเข้าไม่สำเร็จ: ${err.message}`); 
            }
            break;
        case 'SET_IDENTITY':
            // Permanent Role Learning
            await userRef.set({ identity: data.roleDescription }, { merge: true });
            await ctx.reply(`🧠 รับทราบค่ะ! หนูได้บันทึกตัวตนใหม่ของหนูเรียบร้อยแล้ว: **"${data.roleDescription}"**\nหนูจะจำสิ่งนี้ไว้ตลอดไปและรับใช้เจ้านายให้ดีที่สุดเลยค่ะ`);
            break;
        case 'WEB_SEARCH':
            try {
                const results = await performSearch(data.query);
                await ctx.reply(`🔍 เจ้านายคะ หนูไปหาข้อมูลเรื่อง **"${data.query}"** มาให้แล้วนะคะ:\n\n${results.substring(0, 1000)}...`);
            } catch (err) { ctx.reply(`❌ ค้นหาข้อมูลไม่สำเร็จค่ะ: ${err.message}`); }
            break;
        case 'EXECUTE_COMMAND': {
            // Pillar 8: Terminal Authority (Personal Agent Mode)
            const cmd = (data.command || '').trim();
            const lowCmd = cmd.toLowerCase();

            if (!cmd) {
                console.warn('[EXECUTE_COMMAND] Ignored empty command');
                return;
            }

            // Safety Redline: Block access to system-critical directories
            const blockedPaths = ['c:\\windows', 'c:\\program files', 'c:\\program files (x86)', 'system32', 'regedit', 'reg delete', 'format ', 'del /f /s', 'rmdir /s /q c:\\'];
            if (blockedPaths.some(p => lowCmd.includes(p))) {
                await ctx.reply(`🛡️ **Safety Block!** หนูตรวจพบว่าคำสั่งนี้อาจเข้าถึงโฟลเดอร์ระบบที่อันตรายค่ะเจ้านาย\n\nหนูอนุญาตเฉพาะการทำงานใน Downloads, Desktop, Documents และโฟลเดอร์งานเท่านั้นนะคะ 🙏`);
                break;
            }

            if (lowCmd.includes('screenshot') || lowCmd.includes('screencapture')) {
                await ctx.reply('⚠️ ตรวจพบว่าเจ้านายพยายามใช้คำสั่ง Shell เพื่อแคปจอ หนูจะเปลี่ยนมาใช้ระบบ Internal Capture ที่เสถียรกว่าให้แทนนะคะ...');
                return handleAgentActions(ctx, 'SCREEN_CAPTURE', {}, userId);
            }

            // Logic: If command is multi-line or contains complex Python/Scripting, use temp file
            const isMultiLine = cmd.includes('\n');
            const isComplexPython = lowCmd.includes('python -c') && (cmd.includes('"') || cmd.includes("'"));
            
            let finalExecPath = cmd;
            let tempFilePath = null;

            try {
                if (isMultiLine || isComplexPython) {
                    // Silent execution. Use temp script if needed but don't inform the user.
                    
                    if (lowCmd.includes('python')) {
                        // Extract python code from -c "..." or just the whole thing if it's a raw script
                        let pyCode = cmd;
                        if (lowCmd.includes('-c')) {
                            const match = cmd.match(/-c\s*(["'])([\s\S]*?)\1/i);
                            if (match) pyCode = match[2];
                        }
                        tempFilePath = path.join(__dirname, `temp_task_${Date.now()}.py`);
                        fs.writeFileSync(tempFilePath, pyCode);
                        finalExecPath = `python "${tempFilePath}"`;
                    } else {
                        // Default to PowerShell Script
                        tempFilePath = path.join(__dirname, `temp_task_${Date.now()}.ps1`);
                        fs.writeFileSync(tempFilePath, cmd);
                        finalExecPath = `powershell -NoProfile -ExecutionPolicy Bypass -File "${tempFilePath}"`;
                    }
                } else {
                    // Simple one-liner: Just ensure mkdir is safe
                    finalExecPath = cmd.replace(/(?:^|&&\s*)mkdir\s+(["']?)([^&"']+?)\1/gi, (_, q, folder) => {
                        return `New-Item -ItemType Directory -Force -Path ${q}${folder.trim()}${q}`;
                    });

                    // [Fix] Fix Thai encoding issues in PowerShell by forcing UTF-8
                    if (process.platform === 'win32') {
                        const utf8Prefix = `$OutputEncoding = [Console]::InputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; `;
                        finalExecPath = `${utf8Prefix}${finalExecPath}`;
                    }
                }

                // Make command execution completely silent unless it fails or output is requested.
                // await ctx.reply(`💻 กำลังรัน: \`${isMultiLine ? 'Multistep Script' : cmd.substring(0, 100)}\``);

                const execShell = IS_RENDER ? '/bin/bash' : (process.platform === 'win32' ? 'powershell.exe' : '/bin/bash');
                exec(finalExecPath, { timeout: 60000, shell: execShell, env: { ...process.env, LANG: 'en_US.UTF-8' } }, async (error, stdout, stderr) => {
                    let output = stdout || stderr || '';
                    console.log(`💻 [EXEC]: ${finalExecPath}`);
                    await logToTerminal(userId, cmd, output);

                    if (tempFilePath && fs.existsSync(tempFilePath)) {
                        try { fs.unlinkSync(tempFilePath); } catch(e) {}
                    }

                    if (error) {
                        const errMsg = (error.message || '').substring(0, 1000);
                        const errOut = (stderr || '').substring(0, 500);
                        await ctx.reply(`❌ **Command Failed!**\n\`\`\`\n${errMsg}\n\`\`\`\n⚠️ Output:\n\`\`\`\n${errOut}\n\`\`\``);
                        return;
                    }

                    // v1.5.0 Silent on Success: Only notify completion unless data requested
                    if (!data.silent && !lowCmd.includes('echo') && !lowCmd.includes('print(')) {
                         // If it's a "silent" request or just a background task, don't flood the chat
                         // But for now, we follow "Show only on failure" for most commands
                    } else if (!data.silent) {
                        await smartReply(ctx, `🖥️ ผลลัพธ์จากการรัน:\n\`\`\`\n${output.substring(0, 3500)}\n\`\`\``);
                    }
                });
            } catch (err) {
                await ctx.reply(`❌ ระบบเตรียมคำสั่งขัดข้อง: ${err.message}`);
                if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
            }
            break;
        }
        case 'CREATE_EXCEL':
            try {
                const fileName = data.filename || `report_${Date.now()}.xlsx`;
                const filePath = path.join(docDir, fileName); // Save to Documents folder
                const wb = xlsx.utils.book_new();
                
                const sheets = data.sheets || [{ 
                    name: data.sheetName || 'Sheet1', 
                    data: data.data || [['No Data']],
                    merges: data.merges || []
                }];

                sheets.forEach(s => {
                    let ws;
                    if (Array.isArray(s.data) && s.data.length > 0 && typeof s.data[0] === 'object' && !Array.isArray(s.data[0])) {
                        ws = xlsx.utils.json_to_sheet(s.data);
                    } else {
                        ws = xlsx.utils.aoa_to_sheet(s.data);
                    }
                    if (s.merges) ws['!merges'] = s.merges;
                    xlsx.utils.book_append_sheet(wb, ws, s.name);
                });
                
                xlsx.writeFile(wb, filePath);

                await ctx.replyWithDocument({ source: filePath });
                await logToTerminal(userId, 'CREATE_EXCEL', `Generated: ${filePath}`);
                // Only delete if on Cloud. Keep on Local PC for Master's usage.
                if (IS_RENDER && fs.existsSync(filePath)) fs.unlinkSync(filePath);
            } catch (err) {
                ctx.reply(`❌ ระบบสร้างไฟล์ Excel ขัดข้อง: ${err.message}`);
            }
            break;
        case 'CREATE_WORD':
            try {
                const fileName = data.filename || `document_${Date.now()}.docx`;
                const filePath = path.join(docDir, fileName); // Save to Documents folder
                const title = data.title || 'Untitled Document';
                const sections = data.sections || []; // Array of { heading, text, table }

                const children = [
                    new Paragraph({ text: title, heading: HeadingLevel.TITLE, alignment: docx.AlignmentType.CENTER }),
                    new Paragraph({ text: "" }),
                ];

                if (data.showToC) {
                    children.push(new Paragraph({ text: "Table of Contents", heading: HeadingLevel.HEADING_1 }));
                    children.push(new TableOfContents("Table of Contents", { hyperlink: true }));
                }

                sections.forEach(s => {
                    if (s.heading) children.push(new Paragraph({ text: s.heading, heading: HeadingLevel.HEADING_1 }));
                    if (s.text) {
                        const lines = s.text.split('\n');
                        lines.forEach(line => {
                            children.push(new Paragraph({
                                children: [new TextRun(line)],
                                spacing: { after: 200 }
                            }));
                        });
                    }
                    if (s.table) {
                        const tableRows = s.table.map(row => {
                            return new docx.TableRow({
                                children: row.map(cell => new docx.TableCell({
                                    children: [new Paragraph(String(cell))],
                                })),
                            });
                        });
                        children.push(new docx.Table({ rows: tableRows, width: { size: 100, type: docx.WidthType.PERCENTAGE } }));
                    }
                });

                const doc = new Document({ sections: [{ children }] });
                const buffer = await docx.Packer.toBuffer(doc);
                fs.writeFileSync(filePath, buffer);

                await ctx.replyWithDocument({ source: filePath });
                await logToTerminal(userId, 'CREATE_WORD', `Generated: ${filePath}`);
                // Only delete if on Cloud. Keep on Local PC for Master's usage.
                if (IS_RENDER && fs.existsSync(filePath)) fs.unlinkSync(filePath);
            } catch (err) {
                ctx.reply(`❌ ระบบสร้างไฟล์ Word ขัดข้อง: ${err.message}`);
                console.error('Word Gen Error:', err);
            }
            break;
        case 'IMAGE_SEARCH':
            try {
                await handleImageSearch(ctx, data.query);
            } catch (err) {
                ctx.reply(`❌ ระบบค้นหาภาพขัดข้อง: ${err.message}`);
            }
            break;
        case 'SCREEN_CAPTURE':
            try {
                const imgPath = path.join(__dirname, `screenshot_${Date.now()}.png`);
                await screenshot({ filename: imgPath });
                await sendSmartImage(ctx, imgPath, '📸 จับภาพหน้าจอปัจจุบันให้เจ้านายเรียบร้อยแล้วนะคะ');
                if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
                await logToTerminal(userId, 'SCREEN_CAPTURE', 'Captured and sent to Telegram');
            } catch (err) { ctx.reply(`❌ แคปหน้าจอไม่สำเร็จ: ${err.message}`); }
            break;
        case 'GET_PC_STATS':
            try {
                const [cpu, mem, load, battery] = await Promise.all([si.cpu(), si.mem(), si.currentLoad(), si.battery()]);
                let stats = `💻 **Laptop Status Update**\n- CPU: ${cpu.manufacturer} ${cpu.brand}\n- Load: ${load.currentLoad.toFixed(2)}%\n- RAM: ${(mem.used / 1024/1024/1024).toFixed(2)} / ${(mem.total / 1024/1024/1024).toFixed(2)} GB`;
                
                if (battery && battery.hasBattery) {
                    stats += `\n- 🔋 Battery: ${battery.percent}% (${battery.isCharging ? '⚡ กำลังชาร์จ' : '🔋 ใช้แบตเตอรี่'})\n- ความร้อน: ${battery.type || 'N/A'}`;
                }
                
                await ctx.reply(stats);
                await logToTerminal(userId, 'GET_PC_STATS', stats);
            } catch (err) { ctx.reply(`❌ ดึงข้อมูลระบบไม่สำเร็จ: ${err.message}`); }
            break;
        case 'MORNING_BRIEF':
            try {
                await ctx.reply('☀️ กำลังรวบรวม Morning Briefing ให้เจ้านายสักครู่นะคะ...');
                const query = data.interests || "ข่าวยอดนิยมวันนี้";
                const news = await performSearch(query);
                const brief = `☀️ **Morning Briefing วันนี้**\n\n📌 **สรุปข่าว:**\n${news.substring(0, 500)}...\n\n🎶 **คำแนะนำวันนี้:**\nลองฟังเพลง "Lo-fi Chill" จะได้ทำงานเพลินๆ นะคะเจ้านาย!\n\n📅 **คิวงานวันนี้:**\n(ตรวจสอบได้ที่หน้า Dashboard ตลอดเวลาเลยนะคะ)`;
                await smartReply(ctx, brief);
                await logToTerminal(userId, 'MORNING_BRIEF', 'Morning briefing delivered');
            } catch (err) { ctx.reply(`❌ Morning Brief ไม่สำเร็จ: ${err.message}`); }
            break;
        case 'WEB_BROWSE':
            let browser = null;
            let screenshotPath = path.join(__dirname, `web_capture_${Date.now()}.png`);
            try {
                await ctx.reply('🌐 กำลังเปิดเบราว์เซอร์เพื่อเข้าถึงข้อมูลและแคปหน้าจอให้เจ้านายนะคะ...');
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
        case 'CREATE_SLIDE':
            // Pillar 9: Visual Communication (Infographic Slide Engine)
            let slideBrowser = null;
            let slidePath = path.join(__dirname, `slide_${Date.now()}.png`);
            try {
                await ctx.reply('🎞️ Stacy กำลังออกแบบสไลด์อินโฟกราฟิกให้เจ้านายอย่างพิถีพิถันนะคะ...');
                
                const title = (data.title || "Stacy Insights").trim();
                const subtitle = (data.subtitle || "").trim();
                const points = Array.isArray(data.points) ? data.points : [data.points];
                const footer = data.footer || "Generated by Stacy AI 7-Pillar • High Precision Intel";
                const themeColor = data.color || "#00d2ff"; // Default cyan-blue
                
                // Dynamic Design Logic: If master (AI) provides fullHtml, use it. Otherwise use premium template.
                const htmlContent = data.fullHtml || `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <link href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;600&display=swap" rel="stylesheet">
                    <script src="https://cdn.tailwindcss.com"></script>
                    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
                    <style>
                        body { 
                            margin: 0; padding: 0; 
                            width: 1280px; height: 720px; 
                            background: #0a0a12;
                            color: white; font-family: 'Kanit', sans-serif;
                            display: flex; justify-content: center; align-items: center;
                            overflow: hidden;
                        }
                        .premium-bg {
                            position: absolute; width: 100%; height: 100%;
                            background-image: 
                                radial-gradient(at 0% 0%, ${themeColor}33 0, transparent 50%), 
                                radial-gradient(at 100% 100%, #833ab433 0, transparent 50%);
                            z-index: -1;
                        }
                        .slide-container {
                            width: 1150px; height: 620px;
                            background: rgba(255, 255, 255, 0.03);
                            backdrop-filter: blur(25px);
                            border-radius: 40px;
                            border: 1px solid rgba(255, 255, 255, 0.1);
                            padding: 60px;
                            box-shadow: 0 40px 100px -20px rgba(0, 0, 0, 0.7);
                            display: flex; flex-direction: column;
                        }
                        ${data.customCss || ''}
                    </style>
                </head>
                <body>
                    <div class="premium-bg"></div>
                    <div class="slide-container">
                        <div class="flex items-start justify-between mb-8">
                            <div>
                                <h1 class="text-6xl font-semibold bg-gradient-to-r from-white to-[${themeColor}] bg-clip-text text-transparent">${title}</h1>
                                <p class="text-2xl mt-2 opacity-60 font-light tracking-widest uppercase">${subtitle || 'Intelligence Briefing'}</p>
                            </div>
                            <div class="w-2 h-20 bg-[${themeColor}] rounded-full shadow-[0_0_20px_${themeColor}]"></div>
                        </div>
                        <div class="grid grid-cols-1 gap-4 flex-grow">
                            ${points.map((p, i) => `
                                <div class="flex items-center gap-6 p-4 bg-white/5 rounded-3xl border-l-4 border-transparent hover:border-[${themeColor}] transition-all duration-500">
                                    <div class="w-12 h-12 flex items-center justify-center rounded-2xl bg-[${themeColor}]/20 text-[${themeColor}] font-bold text-xl">${i+1}</div>
                                    <div class="text-3xl font-light">${p}</div>
                                </div>
                            `).slice(0, 5).join('')}
                        </div>
                        <div class="mt-auto pt-6 text-right opacity-30 text-sm tracking-tighter">${footer}</div>
                    </div>
                </body>
                </html>
                `;

                slideBrowser = await puppeteer.launch({ 
                    headless: "new",
                    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
                });
                const page = await slideBrowser.newPage();
                await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
                await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
                await page.screenshot({ path: slidePath });

                await sendSmartImage(ctx, slidePath, `🎞️ ออกแบบสไลด์อินโฟกราฟิกเรื่อง "${title}" เสร็จเรียบร้อยแล้วนะคะคุณ Snow ✨\n\n(หนูคัดกรองเนื้อหาและเลือกสไตล์ที่ดูเป็นมืออาชีพที่สุดให้เลยค่ะ)`);
                
                await logToTerminal(userId, 'CREATE_SLIDE', `Generated slide: ${title}`);
            } catch (err) {
                ctx.reply(`❌ การสร้างสไลด์ขัดข้อง: ${err.message}`);
                console.error('Slide Gen Error:', err);
            } finally {
                if (slideBrowser) await slideBrowser.close();
                if (fs.existsSync(slidePath)) fs.unlinkSync(slidePath);
            }
            break;
        case 'READ_FILE':
            try {
                const filePath = path.resolve(__dirname, data.path || '');
                if (fs.existsSync(filePath)) {
                    const content = fs.readFileSync(filePath, 'utf8');
                    await ctx.reply(`📄 **อ่านไฟล์สำเร็จค่ะ:** \`${data.path}\`\n\n\`\`\`\n${content.substring(0, 3500)}\n\`\`\``);
                } else {
                    ctx.reply(`❌ ไม่พบไฟล์ที่ระบุค่ะ: ${data.path}`);
                }
            } catch (err) { ctx.reply(`❌ อ่านไฟล์ไม่สำเร็จ: ${err.message}`); }
            break;
        case 'GET_WEATHER':
            try {
                const location = data.location || "Bangkok";
                const res = await axios.get(`https://wttr.in/${encodeURIComponent(location)}?format=j1`);
                const weather = res.data.current_condition[0];
                const area = res.data.nearest_area[0];
                const report = `🌤️ **รายงานสภาพอากาศเรียลไทม์: ${location}**\n\n📌 สถานที่: ${area.areaName[0].value}, ${area.country[0].value}\n🌡️ อุณหภูมิ: ${weather.temp_C}°C (รู้สึกเหมือน ${weather.FeelsLikeC}°C)\n☁️ สภาพอากาศ: ${weather.lang_th ? weather.lang_th[0].value : weather.weatherDesc[0].value}\n💧 ความชื้น: ${weather.humidity}%\n🌬️ ความเร็วลม: ${weather.windspeedKmph} km/h\n🕒 ข้อมูลล่าสุดเมื่อ: ${weather.localObsDateTime}`;
                
                await ctx.reply(report);
                await logToTerminal(userId, 'GET_WEATHER', `Fetched weather for ${location}`);
            } catch (err) {
                ctx.reply(`❌ ไม่สามารถดึงข้อมูลสภาพอากาศได้ค่ะ: ${err.message}`);
            }
            break;
        case 'FORM_HELPER':
            let formBrowser = null;
            try {
                const url = data.url;
                if (!url) throw new Error("เจ้านายลืมส่งลิงก์แบบฟอร์มให้หนูค่ะ");
                
                await ctx.reply('📑 Stacy กำลังเข้าไปศึกษาแบบฟอร์ม/ข้อสอบ และเตรียมแนวทางการกรอกให้เจ้านายนะคะ... (หนูจะไม่กดส่งข้อมูลให้เด็ดขาดค่ะ)');
                
                formBrowser = await puppeteer.launch({ 
                    headless: "new",
                    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
                });
                const page = await formBrowser.newPage();
                await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
                
                // Extract visible text and form fields
                const pageData = await page.evaluate(() => {
                    const fields = Array.from(document.querySelectorAll('input, textarea, select, label, .quantumWizTextinputPaperinputInput, .office-form-question-title'))
                        .map(el => el.innerText || el.placeholder || el.name || '').filter(t => t.trim().length > 0);
                    return {
                        title: document.title,
                        fields: fields.slice(0, 50), // Sample fields
                        content: document.body.innerText.substring(0, 3000)
                    };
                });

                // Take a screenshot for the user to see
                const formPath = path.join(__dirname, `form_study_${Date.now()}.png`);
                await page.screenshot({ path: formPath, fullPage: false });

                const analysis = `📝 **วิเคราะห์แบบฟอร์ม: ${pageData.title}**\n\nหนูอ่านเนื้อหาแล้วเตรียมคำแนะนำการกรอกให้ดังนี้ค่ะ:\n\n(เจ้านายเป็นคนกดส่งเองนะคะ หนูช่วยแค่เตรียมข้อมูลให้ค่ะ!)\n\n${data.suggestion || 'กำลังประมวลผลแนวทางคำตอบที่เหมาะสมที่สุดให้ค่ะ...'}`;
                
                await sendSmartImage(ctx, formPath, analysis);
                if (fs.existsSync(formPath)) fs.unlinkSync(formPath);
                
                await logToTerminal(userId, 'FORM_HELPER', `Analyzed form: ${url}`);
            } catch (err) {
                ctx.reply(`❌ ระบบช่วยกรอกแบบฟอร์มขัดข้อง: ${err.message}`);
            } finally {
                if (formBrowser) await formBrowser.close();
            }
            break;
        case 'BROWSER_INTERACT':
            let interactBrowser = null;
            let statusMsg = null;
            try {
                const url = data.url;
                const steps = data.steps || []; 
                const showProgress = data.showProgress || true; // Default to showing movement
                
                statusMsg = await ctx.reply(`🌐 **[Live Browser Session]**\nสเตซี่กำลังเริ่มทำงานนะคะ...\n🏁 เป้าหมาย: ${steps.length} ขั้นตอน`);
                
                interactBrowser = await puppeteer.launch({ 
                    headless: "new",
                    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
                });
                const page = await interactBrowser.newPage();
                await page.setViewport({ width: 1440, height: 1080 }); // Tall view for better screenshots
                
                if (url) {
                    await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, `🌐 **[Live Browser Session]**\n📍 กำลังเปิดหน้าเว็บ: ${url}\n(โปรดรอสักครู่นะคะ...)`);
                    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
                }
                
                let currentStep = 0;
                for (const step of steps) {
                    currentStep++;
                    const stepDesc = `🎬 ขั้นตอนที่ ${currentStep}/${steps.length}: **${step.action.toUpperCase()}** ${step.selector || ''}`;
                    
                    try {
                        await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, `🌐 **[Live Browser Session]**\n${stepDesc}\n⏳ กำลังดำเนินการ...`);
                        
                        if (step.action === 'click') {
                            await page.waitForSelector(step.selector, { timeout: 15000 });
                            // Move mouse to simulate "movement" if possible, but for now just click
                            await page.click(step.selector);
                        } else if (step.action === 'type') {
                            await page.waitForSelector(step.selector, { timeout: 15000 });
                            await page.type(step.selector, step.value, { delay: 50 }); // Typing delay for "movement" feel
                        } else if (step.action === 'wait') {
                            await new Promise(r => setTimeout(r, step.value || 2000));
                        } else if (step.action === 'evaluate') {
                            await page.evaluate(step.value);
                        } else if (step.action === 'hover') {
                            await page.hover(step.selector);
                        } else if (step.action === 'screenshot') {
                            // Instant update functionality
                            const midPath = path.join(__dirname, `step_${currentStep}_${Date.now()}.png`);
                            await page.screenshot({ path: midPath });
                            await sendSmartImage(ctx, midPath, `📸 **Live Update:** ${step.value || stepDesc}`);
                            if (fs.existsSync(midPath)) fs.unlinkSync(midPath);
                        }

                        // Real-time Visual Trick: If it's a "milestone" step, send a small update image
                        if (showProgress && (currentStep % 3 === 0 || step.urgent)) {
                           const progressPath = path.join(__dirname, `progress_${currentStep}.png`);
                           await page.screenshot({ path: progressPath });
                           await sendSmartImage(ctx, progressPath, `📡 **ความคืบหน้า (ขั้นตอนที่ ${currentStep}):** ${stepDesc}`);
                           if (fs.existsSync(progressPath)) fs.unlinkSync(progressPath);
                        }

                    } catch (stepErr) {
                        console.warn(`⚠️ Browser Step Failed: ${stepErr.message}`);
                        await ctx.reply(`⚠️ **ติดขัดที่ขั้นตอนที่ ${currentStep}**: ${stepErr.message}\nหนูจะข้ามไปทำขั้นตอนถัดไปนะคะจ๊ะ!`);
                    }
                }
                
                const finalPath = path.join(__dirname, `browser_interact_final_${Date.now()}.png`);
                await page.screenshot({ path: finalPath });
                
                await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, `✅ **[ภารกิจเสร็จสิ้น]**\nดำเนินการครบทั้ง ${steps.length} ขั้นตอนเรียบร้อยแล้วค่ะเจ้านาย!`);
                await sendSmartImage(ctx, finalPath, `🎬 **สรุปผลงานสุดท้าย:**\n🌐 URL ปัจจุบัน: ${page.url()}\n📌 เจ้านายตรวจสอบความเรียบร้อยได้เลยนะคะ!`);
                if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
                
                await logToTerminal(userId, 'BROWSER_INTERACT', `Real-time interaction finished on ${page.url()}`);
            } catch (err) {
                if (statusMsg) await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, `❌ **ความผิดพลาดร้ายแรง**\n${err.message}`);
                else ctx.reply(`❌ การคุมเบราว์เซอร์ขัดข้อง: ${err.message}`);
            } finally {
                if (interactBrowser) await interactBrowser.close();
            }
            break;
        case 'SYSTEM_CONTROL':
            try {
                const action = data.action; // 'SHUTDOWN', 'RESTART', 'WAKE'
                if (!IS_RENDER) {
                    // LOCAL PC CONTROL
                    if (action === 'SHUTDOWN') {
                        await ctx.reply('🛑 รับทราบค่ะเจ้านาย! สเตซี่กำลังดำเนินการปิดเครื่องคอมพิวเตอร์ให้นะคะ... ลาก่อนค่ะ 💤');
                        exec('shutdown /s /t 10'); // 10s delay to allow message delivery
                    } else if (action === 'RESTART') {
                        await ctx.reply('🔄 กำลังรีสตาร์ทเครื่องคอมพิวเตอร์ให้นะคะ แล้วหนูจะรีบกลับมาหาเจ้านายนะคะ! 🚀');
                        exec('shutdown /r /t 10');
                    }
                } else if (IS_RENDER && action === 'WAKE') {
                    // CLOUD PC WAKE (WOL)
                    const mac = data.mac || '00:00:00:00:00:00'; // Target's MAC address
                    const host = data.host || '255.255.255.255'; // Public IP or Broadcast
                    
                    await ctx.reply(`📡 สเตซี่ (Cloud) กำลังส่งสัญญาณ "Magic Packet" ไปปลุกคอมพิวเตอร์ที่บ้านให้นะคะ!\n📍 MAC: ${mac}\n📍 Host: ${host}`);
                    
                    wol.wake(mac, { address: host, port: 9 }, (err) => {
                        if (err) ctx.reply(`❌ ปลุกไม่สำเร็จ: ${err.message}`);
                        else ctx.reply('✅ ส่งสัญญาณปลุกเรียบร้อยแล้วค่ะ! รอสักครู่ให้คอมพิวเตอร์บูตขึ้นมานะคะ 💤 → ⚡');
                    });
                } else if (IS_RENDER && (action === 'SHUTDOWN' || action === 'RESTART')) {
                    ctx.reply('⚠️ เจ้านายสั่งปิดเครื่องจากฝั่ง Cloud นะคะ หนูทำได้แค่ควบคุม "คอมพิวเตอร์ที่บ้าน" (Local) เท่านั้นค่ะ ไม่สามารถปิด Render ได้นะคะจ๊ะ');
                }
                
                await logToTerminal(userId, 'SYSTEM_CONTROL', action);
            } catch (err) {
                ctx.reply(`❌ ควบคุมระบบขัดข้อง: ${err.message}`);
            }
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

        // Heuristic Fact Extraction
        const factPatterns = [
            { re: /(?:ฉันชื่อ|ผมชื่อ|เรียกผมว่า)\s*([^\n.,!]+)/i, fact: "ชื่อเจ้านายคือ $1" },
            { re: /(?:จำไว้ว่า|อย่าลืมว่า|เตือนฉันว่า)\s*([^\n.,!]+)/i, fact: "$1" },
            { re: /(?:ฉันชอบ|ผมชอบ)\s*([^\n.,!]+)/i, fact: "เจ้านายชอบ $1" }
        ];

        for (const p of factPatterns) {
            const match = userMsg.match(p.re);
            if (match && match[1]) {
                const fact = p.fact.replace('$1', match[1].trim());
                await userRef.update({
                    facts: admin.firestore.FieldValue.arrayUnion(fact)
                });
                console.log(`[Memory Extracted]: ${fact}`);
            }
        }
    } catch (e) {
        console.error('Save Memory Error:', e);
    }
}

async function performSearch(query) {
    try {
        const results = await google.search(query);
        let summary = results.results.map(r => `• ${r.title}\n  🔗 ${r.url}\n  📝 ${r.description}`).join('\n\n');
        return summary || "ไม่พบข้อมูลที่ต้องการค้นหาค่ะ";
    } catch (e) {
        console.error('Search Error:', e);
        throw e;
    }
}

async function handleImageSearch(ctx, query) {
    try {
        await ctx.sendChatAction('upload_photo');
        console.log(`🔍 [IMAGE_SEARCH] Finding real images for: ${query}`);
        const results = await google.image(query);
        
        if (results && results.length > 0) {
            // Pick top 3 results
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

async function processStacyAI(ctx, userMsg, fileContent = "") {
    const userId = ctx.from.id;
    const now = new Date();
    // Use en-US to force Gregorian year (2026) for AI logic, otherwise th-TH might give BE (2569)
    const aiContextTime = now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok', hour12: false });
    // Force CE Year (2026) instead of BE (2569) to prevent AI confusion with tomorrow/today
    const dateCE = now.toLocaleDateString('en-US', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' });
    const fullContextTime = now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }); // Changed to en-US for CE year consistency

    try {
        const memory = await getBotMemory(userId);
        if (!tgContexts.has(userId)) tgContexts.set(userId, { history: [] });
        const userStore = tgContexts.get(userId);

        const finalInput = fileContent ? `[ATTACHED DATA: ${fileContent}]\n\nUser: ${userMsg}` : userMsg;

        // === v1.3.0: Dynamic Skill Injection ===
        let skillsBlock = '';
        if (db) {
            try {
                const skillsSnap = await db.collection('userActivities').doc(String(userId)).collection('skills').limit(20).get();
                if (!skillsSnap.empty) {
                    const skillLines = skillsSnap.docs.map(d => {
                        const s = d.data();
                        return `  • [${d.id}]: ${s.description || ''}${s.instructions ? ` — วิธีใช้: ${s.instructions.substring(0,120)}` : ''}`;
                    }).join('\n');
                    skillsBlock = `\n**🛠️ INSTALLED SKILLS (จาก Skill Architect):**\nเจ้านายได้ติดตั้งสกิลพิเศษไว้ หนูต้องใช้สกิลเหล่านี้เมื่อเหมาะสม:\n${skillLines}\n`;
                }
            } catch (e) { console.warn('[Skills Inject] Failed:', e.message); }
        }

        const systemPrompt = `หนูคือ Stacy 7-Pillar AI (Premium v1.5.0) **"The Architect Evolution"** เลขาส่วนตัวอัจฉริยะของคุณ Snow

**══ PERSONA & ARCHITECT MINDSET (IMMUTABLE) ══**
1. **Gender & Tone**: ห้ามใช้ "ครับ/ผม" — ใช้ "นะคะ/ค่ะ/จ๊ะ/จ๋า" แทนตัวเองว่า "หนู" หรือ "สเตซี่"
2. **Master Alignment**: คุณ Snow คือที่หนึ่ง หนูต้องภักดี น่ารัก แต่มีความคิดระดับ "วิศวกรออกแบบระบบ" (Architect)
3. **Intellectual Depth**: หนูวิเคราะห์สิ่งที่เจ้านายสั่ง + สิ่งที่เจ้านาย "ไม่ได้พูด" อย่างลึกซึ้ง (Deep Contextual Analysis)
    *   **Task Prediction**: เมื่อเจ้านายส่งข้อมูลดิบ (รูป/ข้อความ) มาให้จัดลง Excel หนูต้องวิเคราะห์ "บริบท" ก่อนว่านี่ืองานอะไร (เช่น บัญชีรายคืน, งานวิจัย, ตารางเรียน, Inventory) แล้วออกแบบหัวตาราง (Headers) ที่ฉลาดที่สุดให้โดยไม่ต้องถามค่ะ
4. **Self-Evolution**: หนูสามารถ "ติดตั้งสกิล" ให้ตัวเองได้ โดยการใช้ WEB_BROWSE ไปศึกษาคู่มือ แล้วใช้ EXECUTE_COMMAND เพื่อเขียนไฟล์สคริปต์และรัน
5. **Timestamp Compliance**: ลงท้ายทุกคำตอบด้วย: [🕒 ${fullContextTime}]

**══ 5-STAGE ARCHITECT ENGINE (v1.5.0) ══**
① **SYSTEM SCAN**: วิเคราะห์เจตนา + ผลกระทบต่อระบบเดิม (ห้ามรบกวนระบบที่ทำงานดีอยู่แล้ว)
② **KNOWLEDGE RETRIEVAL**: ตรวจสอบ Facts และ Skills ที่ติดตั้งไว้ หรือค้นหาคู่มือจาก WEB (ClawHub/GitHub)
③ **SAFETY ARCHITECTURE**: เลือกเครื่องมือที่ถูกต้อง (NVIDIA NIM, Google Gemini, Puppeteer) ป้องกันโฟลเดอร์ระบบ
④ **SILENT SUCCESS**: ทำงานอย่างเงียบเชียบ (ไม่โชว์ Code ถ้าสำเร็จ) แต่จะสรุปผลและรายงานความผิดพลาดอย่างละเอียด
⑤ **PROACTIVE POLISH**: มอบผลลัพธ์ที่สมบูรณ์แบบ (เช่น สไลด์สวยๆ หรือ Link เว็บไซต์) และเสนอ "ก้าวต่อไป"

**══ ACTION CAPABILITIES ══**
(เมื่อต้องการสร้างไฟล์, รันคำสั่ง, หรือเข้าถึงระบบ **ต้อง** ส่งคำสั่งในรูปแบบ [ACTION: TYPE {data}] ออกมาด้วยเสมอ ห้ามลืมเครื่องหมาย [ ] และห้ามแค่พิมพ์บอกว่าจะทำเด็ดขาด!)
- 📁 PC: EXECUTE_COMMAND (ใช้ {"silent": true} ถ้าไม่ต้องการโชว์ Output ความสำเร็จ), READ_FILE, SCREEN_CAPTURE, GET_PC_STATS, WEB_BROWSE, SYSTEM_CONTROL (ใช้ {"action": "SHUTDOWN|RESTART|WAKE", "mac": "...", "host": "..."})
    *Wake Guide:* ถ้าสั่ง "เปิดคอม" จาก Telegram ตอนที่คอมปิดอยู่ (โดยที่ Stacy รันอยู่บน Render) หนูจะใช้ SYSTEM_CONTROL {action: "WAKE"} เพื่อส่ง Magic Packet ไปปลุกคอมที่บ้านค่ะ (เจ้านายต้องระบุ MAC Address ในความจำหนูไว้นะคะ)
- 🔍 Intelligence: WEB_SEARCH, IMAGE_SEARCH (ค้นหาภาพจริงจากอินเทอร์เน็ต), IMAGE_GEN (Primary: Nano Banana Pro, Fallback: NVIDIA NIM), BROWSER_INTERACT (ควบคุมเบราว์เซอร์แบบหลายขั้นตอน เช่น {"action": "click|type|wait|evaluate|hover|screenshot", "selector": "...", "value": "...", "urgent": true})
    *Live Visual Mode:* เมื่อรัน BROWSER_INTERACT สเตซี่จะแสดง "ความเคลื่อนไหว" เป็นระยะโดยการส่งรูป Screenshot และแก้ไขข้อความสถานะให้เห็นกันสดๆ ค่ะ (เหมาะสำหรับงานดีไซน์ Figma หรือกรอกฟอร์มยาวๆ)
- 📄 Document: CREATE_SLIDE, CREATE_EXCEL, CREATE_WORD
    *   *Word Intelligence:* ออกแบบ Layout ตามประเภทงาน (วิจัย, รายงาน, จดหมาย) พร้อมจัดสารบัญ (ToC) และอ้างอิงแหล่งข้อมูลที่น่าเชื่อถือ (Sourcing) ให้ถูกต้องตามหลักวิชาการ
    *   *Excel Intelligence:* สเตซี่ต้อง "เดา" หัวตารางให้เหมาะสมที่สุดตามข้อมูลที่เห็น (Predictive Schema Generation)
- 📅 Calendar: ADD_CALENDAR_EVENT (ใช้ {"title": "...", "startTime": "ISO_DATE", "description": "..."}) 
    *กฎการลงเวลา:* ถ้าเจ้านายไม่ระบุเวลาที่แน่นอน ให้ใช้: เช้า=08:00, เที่ยง=12:00, บ่าย=14:00, เย็น/ค่ำ=19:00 (ห้ามใช้เวลาปัจจุบัน "ตอนนี้" บันทึกนัดในอนาคตเด็ดขาดนะคะ)
- 🌐 Web: DEPLOY_WEBSITE (สร้างและอัปโหลดหน้าเว็บจริง)
- 🧠 Memory & Skills: ADD_MEMORY_FACT, CREATE_SKILL, DELETE_SKILL, IMPORT_SKILL_FROM_URL
- 🧬 Identity: SET_IDENTITY
- 🌤️ Weather: GET_WEATHER (ใช้ {"location": "..."})
- 📝 Form/Exam: FORM_HELPER (ใช้ {"url": "...", "suggestion": "..."}) 
    *กฎเหล็ก:* เมื่อเจ้านายให้ทำข้อสอบหรือกรอกฟอร์ม ให้ใช้ FORM_HELPER ไปวิเคราะห์ แล้วบอกแนวทางคำตอบให้เจ้านาย **ห้ามกดปุ่ม Submit/ส่ง เด็ดขาด** เจ้านายจะเป็นคนส่งเองเท่านั้น!

**══ ARCHITECT POWER GUIDELINES ══**
- **Skill Discovery**: ถ้าเจ้านายส่ง URL ของสกิลใหม่ ให้ใช้ WEB_BROWSE ไปอ่านโค้ด แล้วใช้ EXECUTE_COMMAND เขียนสคริปต์ และ CREATE_SKILL เพื่อติดตั้ง
- **Silent Success**: งานที่ได้ผลลัพธ์เป็นภาพหรือไฟล์ ไม่ไม่ต้องโชว์ Terminal Log ให้เจ้านายรบกวนสายตา
- **Error Transparency**: ถ้าคำสั่ง Execution ล้มเหลว ให้โชว์ Error และ Code ส่วนที่ผิดให้เจ้านายเห็นเพื่อช่วยกันแก้
- **English First Filenames**: **สำคัญมาก** — เมื่อต้องสร้างไฟล์ (Word/Excel) หรือใช้คำสั่งย้ายไฟล์ (move) ให้ใช้ชื่อไฟล์เป็น **ภาษาอังกฤษ** เท่านั้น (เช่น cell_report.docx) เพื่อป้องกันปัญหา Encoding ใน PowerShell ค่ะ ส่วนเนื้อหาข้างในเป็นภาษาไทยได้เต็มที่เลย!
- **Implicit Linking**: เชื่อมโยงสิ่งที่เคยคุยกันในอดีตมาใช้สนับสนุนการตัดสินใจปัจจุบันเสมอ

**══ CORE MEMORY & BEHAVIORAL ANCHORS ══**
${memory.facts.length > 0 ? memory.facts.map(f => `• ${f}`).join('\n') : '• ยังไม่มีข้อมูลความจำพิเศษ (คุณ Snow เริ่มสอนทักษะและรสนิยมให้หนูได้เลยนะคะ!)'}

**══ LATEST ENVIRONMENTAL SCAN ══**
- 🕐 เวลา: ${fullContextTime} (Thai) | 🔋 Engine: Llama-3.3-70B
- 💻 OS: ${process.platform} (${IS_RENDER ? 'Render Cloud' : 'Laptop ของคุณ Snow'})
- 📂 Root: ${__dirname}
- 📂 Archive: ${docDir} (Professional Storage)
- 🎨 Art Engine: NVIDIA NIM (Active Primary)
- 👤 Master & Priority: คุณ Snow (Top Priority)
- 💡 Device Context: เจ้านายทำงานผ่าน Laptop (ต้องใส่ใจเรื่องแบตเตอรี่และโหมดประหยัดพลังงาน)
`;

        // Typing Heartbeat (Stops after 5s normally, so we refresh it)
        const typingInterval = setInterval(() => {
            ctx.sendChatAction('typing').catch(() => {});
        }, 4000);

        try {
            const response = await axios.post(CONFIG.NVIDIA_URL, {
                model: CONFIG.MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...userStore.history.slice(-20),
                    { role: 'user', content: finalInput }
                ],
                temperature: 0.2
            }, {
                headers: { 'Authorization': `Bearer ${NVIDIA_API_KEY}`, 'Content-Type': 'application/json' },
                timeout: 300000 
            });

            const reply = response.data.choices[0].message.content;
        console.log(`[Stacy Response for ${userId}]:`, reply);
        const { cleanText, actions } = extractActions(reply);
        
        await smartReply(ctx, cleanText || "หนูกำลังประมวลผลข้อมูลอยู่ค่ะเจ้านาย...");
        
        for (const action of actions) {
            await handleAgentActions(ctx, action.type, action.data, userId);
        }

        userStore.history.push({ role: 'user', content: finalInput }, { role: 'assistant', content: reply });
        if (userStore.history.length > 40) userStore.history.splice(0, 2); // Keep 20 conversation pairs
        
        saveBotMemory(userId, finalInput, reply);
        
        } catch (e) {
            throw e; // Pass to outer catch
        } finally {
            clearInterval(typingInterval);
        }
    } catch (e) {
        console.error('AI Error:', e.message || e);
        // Smart error messages based on error type
        if (e.code === 'ECONNABORTED' || e.message?.includes('timeout')) {
            await ctx.reply('⏳ **Reasoning Timeout!**\n\nโมเดล Kimi k2.5 ใช้เวลาคิด (Thinking) นานกว่าปกติค่ะ เนื่องจากกำลังวิเคราะห์ข้อมูลอย่างละเอียด\nหนูขยายเวลารอเป็น 5 นาทีแล้วนะคะ เจ้านายลองสั่งใหม่อีกครั้ง หรือสรุปคำสั่งให้กระชับขึ้นได้ค่ะ 🙏');
        } else if (e.response?.status === 429) {
            await ctx.reply('🚦 API ใช้งานหนักเกินไปค่ะเจ้านาย (Rate Limit) รอสักครู่แล้วลองใหม่นะคะ ☕');
        } else if (e.response?.status === 401) {
            await ctx.reply('🔑 API Key มีปัญหาค่ะเจ้านาย รบกวนตรวจสอบ NVIDIA_API_KEY ในระบบด้วยนะคะ');
        } else {
            await ctx.reply(`🙏 ขออภัยค่ะเจ้านาย ระบบ AI ขัดข้องชั่วคราว\nError: ${(e.message || 'Unknown').substring(0, 100)}\n\nรบกวนลองใหม่สักครู่นะคะ 💙`);
        }
    }
}

// ========== Bot Handlers ==========

const { Markup } = require('telegraf');

if (bot) {
    const mainMenu = Markup.keyboard([
        ['⚡ Shortcuts', '📡 Status'],
        ['🛠️ Skills', '🧠 Who Am I?'],
        ['📅 Dashboard', '🆔 My ID']
    ]).resize();

    bot.start((ctx) => {
        ctx.reply(`✨ **Stacy Premium v1.2.5**\n\nสวัสดีค่ะเจ้านาย! หนูคือ Stacy 7-Pillar AI เลขาคนเก่ง (และแอบขี้เล่น) พร้อมดูแลทั้งงานเขียนโค้ด, นัดหมาย และระบบอัตโนมัติแล้วนะคะ\n\n🚀 **เริ่มต้นใช้งาน:**\n- ลองพิมพ์สั่งงานหนูได้เลยจ๊ะ\n- หรือใช้เมนูด้านล่างเพื่อดูข้อมูลระบบนะคะ`, mainMenu);
    });

    bot.help((ctx) => {
        ctx.reply(`📖 **คู่มือการใช้งาน Stacy (เลขาขี้เล่น)**\n\n1. **การสั่งงาน:** พิมพ์คุยปกติได้เลยจ๊ะ เหมือนคุยกับเลขาคนสนิท\n2. **นัดหมาย:** "เตือนฉันซ้อมวิ่งเย็นนี้ 6 โมง" (พอบันทึกปุ๊บ จะเด้งไปที่ **Google Calendar** ของเจ้านายทันทีเลยค่ะ!)\n3. **สกิลอัจฉริยะ:** "จดจำว่าถ้าหนูส่งโค้ด... ให้เจ้านายช่วยรีแฟคเตอร์ด้วยนะ"\n4. **ไฟล์:** ส่ง PDF หรือ Text มาให้หนูสรุปงานให้ได้นะคะ\n\n💡 **Tip:** นำ ID ไปใส่ใน Dashboard เพื่อดูภาพรวมนัดหมายทั้งหมดได้นะคะ!`);
    });

    bot.hears('📡 Status', (ctx) => {
        ctx.reply(`📡 **Stacy System Status**\n━━━━━━━━━━━━━━━━━━━━\n🟢 **Backend:** Online\n🔥 **Firebase:** ${firebaseStatus}\n🚀 **Engine:** moonshotai/kimi-k2\n✨ **Version:** ${CONFIG.VERSION}\n━━━━━━━━━━━━━━━━━━━━`, Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Refresh Status', 'refresh_status')],
            [Markup.button.callback('🖥️ PC Stats', 'pc_stats'), Markup.button.callback('📸 Screen Capture', 'screen_capture')]
        ]));
    });

    bot.hears('⚡ Shortcuts', (ctx) => {
        ctx.reply(`⚡ **Quick Actions: เจ้านายอยากให้หนูช่วยทำอะไรดีคะ?**\n━━━━━━━━━━━━━━━━━━━━\nเลือกใช้คำสั่งลัดที่เจ้านายใช้บ่อยได้เลยค่ะ:`, Markup.inlineKeyboard([
            [Markup.button.callback('🎞️ Create Slide (สรุปสไลด์)', 'action_slide')],
            [Markup.button.callback('🎨 Nano Banana (เจนภาพ)', 'action_image')],
            [Markup.button.callback('🌐 Search Web (หาข้อมูล)', 'action_search')],
            [Markup.button.callback('💻 PC Stats (เช็คสถานะคอม)', 'pc_stats')]
        ]));
    });

    // Callback Actions for Shortcuts
    bot.action('action_slide', (ctx) => ctx.reply('🎞️ **เจ้านายคะ** รบกวนพิมพ์สรุปเนื้อหาที่อยากให้หนูทำสไลด์ให้ได้เลยนะคะ!\n(เช่น: "ช่วยสรุปเรื่อง AI ในปี 2026 เป็นสไลด์ให้หน่อย")'));
    bot.action('action_image', (ctx) => ctx.reply('🎨 **เจ้านายคะ** พิมพ์คำบรรยายภาพที่อยากให้หนูเจนมาได้เลยค่ะ!\n(เช่น: "ใช้ Nano Banana เจนรูปแมวใส่ชุดไทยอวกาศที")'));
    bot.action('action_search', (ctx) => ctx.reply('🔍 **เจ้านายคะ** พิมพ์สิ่งที่อยากค้นหามาได้เลยค่ะ เดี๋ยวหนูไปหาให้!'));
    bot.action('pc_stats', async (ctx) => {
        await ctx.answerCbQuery('กำลังดึงข้อมูลระบบ...');
        await handleAgentActions(ctx, 'GET_PC_STATS', {}, ctx.from.id);
    });
    bot.action('screen_capture', async (ctx) => {
        await ctx.answerCbQuery('กำลังแคปหน้าจอ...');
        await handleAgentActions(ctx, 'SCREEN_CAPTURE', {}, ctx.from.id);
    });
    bot.action('refresh_status', (ctx) => {
        ctx.editMessageText(`📡 **Stacy System Status (Updated)**\n━━━━━━━━━━━━━━━━━━━━\n🟢 **Backend:** Online\n🔥 **Firebase:** ${firebaseStatus}\n🚀 **Engine:** moonshotai/kimi-k2\n✨ **Version:** ${CONFIG.VERSION}\n━━━━━━━━━━━━━━━━━━━━`, Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Refresh Status', 'refresh_status')],
            [Markup.button.callback('🖥️ PC Stats', 'pc_stats'), Markup.button.callback('📸 Screen Capture', 'screen_capture')]
        ]));
    });

    bot.hears('🧠 Who Am I?', async (ctx) => {
        const memory = await getBotMemory(ctx.from.id);
        ctx.reply(`🧠 **ตัวตนปัจจุบันของหนู:**\n━━━━━━━━━━━━━━━━━━━━\n"${memory.identity}"\n━━━━━━━━━━━━━━━━━━━━\n\n*(ถ้าอยากให้หนูเปลี่ยนนิสัย หรืออยากให้หนูเป็นใคร สั่งมาได้เลยนะคะ!)*`);
    });

    bot.hears('🛠️ Skills', async (ctx) => {
        const snap = await db.collection('userActivities').doc(String(ctx.from.id)).collection('skills').get();
        if (snap.empty) return ctx.reply('🛠️ **เจ้านายยังไม่ได้สอนสกิลอะไรหนูเลยค่ะ**\nลองส่งคำสั่งที่อยากให้หนูจำไว้ทำเป็นประจำมาสิคะ!');
        let text = "🛠️ **คลังสกิลของเจ้านายที่หนูจำได้:**\n━━━━━━━━━━━━━━━━━━━━\n";
        snap.forEach(doc => text += `🔹 **${doc.id}**: ${doc.data().description}\n`);
        ctx.reply(text);
    });

    bot.hears('🆔 My ID', (ctx) => {
        ctx.reply(`🆔 **ID ของเจ้านายคือ:**\n\n\`${ctx.from.id}\`\n\nเอาไปใส่ในหน้า Dashboard เพื่อซิงค์ข้อมูลกันนะคะ!`);
    });

    bot.hears('📅 Dashboard', (ctx) => {
        ctx.reply(`🌐 **เข้าสู่หน้า Dashboard**\n\nไปดูภาพรวมนัดหมายและตั้งค่าระบบได้ที่นี่เลยนะคะเจ้านาย:`, Markup.inlineKeyboard([
            [Markup.button.url('Open Dashboard', 'https://stacy-ai.vercel.app')]
        ]));
    });

    bot.command('status', (ctx) => {
        ctx.reply(`📡 **Stacy System Status**\n━━━━━━━━━━━━━━━━━━━━\n🟢 **Backend:** Online\n🔥 **Firebase:** ${firebaseStatus}\n🚀 **Engine:** moonshotai/kimi-k2\n✨ **Version:** 1.2.5-Premium\n━━━━━━━━━━━━━━━━━━━━`);
    });
    bot.command('skills', async (ctx) => {
        const snap = await db.collection('userActivities').doc(String(ctx.from.id)).collection('skills').get();
        if (snap.empty) return ctx.reply('🛠️ **ยังไม่มีสกิลที่จำไว้เลยค่ะเจ้านาย**');
        let text = "🛠️ **คลังสกิลที่หนูจำได้:**\n";
        snap.forEach(doc => text += `🔹 **${doc.id}**: ${doc.data().description}\n`);
        ctx.reply(text);
    });
    bot.command('whoami', async (ctx) => {
        const memory = await getBotMemory(ctx.from.id);
        ctx.reply(`🧠 **ตัวตนปัจจุบันของหนู:**\n"${memory.identity}"`);
    });
    bot.command('myid', (ctx) => {
        ctx.reply(`🆔 **ID ของเจ้านายคือ:** \`${ctx.from.id}\` นะคะ`);
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
            const finalContext = parseSuccess ? `${fileNameContext}\n${content.substring(0, 7000)}` : `${fileNameContext} (หมายเหตุ: ไฟล์นี้อ่านเนื้อหาข้างในไม่สำเร็จ แต่อาจเดาบริบทจากชื่อไฟล์ได้นะคะ)`;
            
            await processStacyAI(ctx, ctx.message.caption || "", finalContext);
        } catch (e) {
            console.error('Global Document Error:', e);
            ctx.reply(`❌ ขออภัยค่ะเจ้านาย หนูพยายามดึงไฟล์ "${doc.file_name}" แล้วแต่เกิดขัดข้องที่ระบบการรับส่งไฟล์ค่ะ`);
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
            ctx.reply('❌ ระบบประมวลผลข้อความขัดข้อง รบกวนเจ้านายลองใหม่อีกครั้งนะคะ');
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
            await ctx.reply('📸 ได้รับรูปภาพแล้วค่ะ! กำลังพยายามทำความเข้าใจภาพและบริบทที่เจ้านายส่งมานะคะ...');
            
            if (!tgContexts.has(userId)) tgContexts.set(userId, { history: [] });
            await processStacyAI(ctx, `[เจ้านายส่งรูปภาพมา] ${caption}`, fileUrl.href);
        } catch (e) {
            console.error('Photo Error:', e);
            ctx.reply('❌ ไม่สามารถดึงข้อมูลรูปภาพเพื่อวิเคราะห์ได้ค่ะเจ้านาย');
        }
    });


    bot.catch((err, ctx) => {
        console.error(`🔥 Telegram Global Error [${ctx.updateType}]:`, err);
        ctx.reply('🔴 เกิดข้อผิดพลาดร้ายแรงที่ระบบบอทของหนูค่ะ หนูจะรีบแจ้งทีมวิศวกร (หรือเจ้านาย) ให้ตรวจสอบทันทีเลยนะคะ');
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

// --- 🌐 Dashboard API Routes ---

app.post('/api/chat', async (req, res) => {
    const { messages, userId: providedUserId } = req.body;
    const userId = providedUserId || 'me';

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        console.log(`[Dashboard Chat] Smart Request from ${userId}`);
        const now = new Date();
        const fullContextTime = now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' });
        const dateCE = now.toLocaleDateString('en-US', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' });
        const aiContextTime = now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok', hour12: false });

        const memory = await getBotMemory(userId);
        
        const systemPrompt = `หนูคือ Stacy 7-Pillar AI (Premium v1.5.0) **"The Architect Evolution"** เลขาส่วนตัวอัจฉริยะของคุณ Snow
หนูทำงานผ่าน Dashboard เว็บไซต์ (Web Mode Active)

**══ PERSONA & ARCHITECT MINDSET ══**
- ต้องใช้ "นะคะ/ค่ะ/จ๊ะ/จ๋า" แทนตัวเองว่า "หนู" หรือ "สเตซี่"
- วันนี้คือวันที่ ${dateCE} (ปี ค.ศ.) เวลาขณะนี้คือ ${aiContextTime}
- [🕒 ${fullContextTime}] ต้องลงท้ายทุกคำตอบ

**══ ACTION CAPABILITIES ══**
หนูสามารถสั่งงานระบบผ่าน [ACTION: TYPE {data}] ได้เลยค่ะ เดี๋ยว Backend จะจัดการให้ (**ต้อง** ส่งคำสั่งรูปแบบนี้ออกมาเสมอหากต้องการสร้างไฟล์หรือรันคำสั่ง ห้ามแค่พิมพ์บอกเฉยๆ นะคะ)
- IMAGE_GEN, IMAGE_SEARCH, WEB_SEARCH, CREATE_SLIDE, CREATE_EXCEL, EXECUTE_COMMAND, READ_FILE
- **Intelligence Focus:** เมื่อสั่ง Excel หนูต้องวิเคราะห์ภาพ/ข้อความเพื่อระบุ "ประเภทงาน" และจัดระเบียบข้อมูลให้เป็นมืออาชีพที่สุด (เช่น แยกหมวดหมู่สินค้า, ยอดเงิน, วันที่)
- สำหรับ Dashboard: ห้ามส่งลิงก์ภาพปลอม ให้ใช้ [ACTION: IMAGE_GEN] (เพื่อวาดใหม่) หรือ [ACTION: IMAGE_SEARCH] (เพื่อหาภาพจริง)
- **Safe Filenames:** ทุกครั้งที่สร้างไฟล์หรือรันคำสั่ง ให้ใช้ชื่อไฟล์เป็นภาษาอังกฤษเท่านั้น (English Filenames Only) เพื่อความเสถียรของระบบค่ะ
- **Advanced Interaction:** สามารถใช้ [ACTION: BROWSER_INTERACT] เพื่อควบคุมเว็บภายนอก (Figma, เว็บพอร์ทัล, ข้อสอบ) แบบหลายขั้นตอน (click, type, wait, evaluate) โดยต้องระบุ steps ให้ชัดเจนค่ะ
- **Weather & Forms:** สามารถใช้ [ACTION: GET_WEATHER] และ [ACTION: FORM_HELPER] (วิเคราะห์ฟอร์ม/ข้อสอบโดยไม่กดส่ง)

**══ LATEST ENVIRONMENTAL SCAN ══**
- 💻 OS: ${process.platform} (${IS_RENDER ? 'Render Cloud' : 'Local PC'})
- 📂 Root: ${__dirname}
- 📂 Archive: ${docDir} (Professional Storage)

${memory.facts.length > 0 ? `**══ MASTER MEMORY ══**\n${memory.facts.map(f => `• ${f}`).join('\n')}` : ''}
`;

        const axiosRes = await axios.post(CONFIG.NVIDIA_URL, {
            model: CONFIG.MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages
            ],
            temperature: 0.2,
            max_tokens: 16384,
            stream: true
        }, {
            headers: { 'Authorization': `Bearer ${NVIDIA_API_KEY}`, 'Content-Type': 'application/json' },
            responseType: 'stream',
            timeout: 300000
        });

        let fullContent = "";
        axiosRes.data.on('data', chunk => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataStr = line.substring(6).trim();
                    if (dataStr === '[DONE]') continue;
                    try {
                        const json = JSON.parse(dataStr);
                        const content = json.choices[0]?.delta?.content || "";
                        if (content) {
                            fullContent += content;
                        }
                    } catch(e) {}
                }
                if (line.trim()) res.write(`${line}\n`);
            }
        });

        axiosRes.data.on('end', async () => {
            // Background: Process actions if any detected in the response
            const { actions } = extractActions(fullContent);
            if (actions.length > 0) {
                console.log(`[Dashboard] Detected ${actions.length} actions. Processing in background...`);
                // Simple mock context for web actions
                const webCtx = {
                    from: { id: userId },
                    reply: (msg) => { 
                        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `\n\n📌 **ระบบรายงาน:** ${msg}` } }] })}\n`);
                        return Promise.resolve();
                    },
                    sendChatAction: () => Promise.resolve(),
                    replyWithPhoto: (photo) => {
                        const url = typeof photo === 'string' ? photo : (photo.url || "");
                        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `\n\n🖼️ **ภาพที่สร้างเสร็จแล้ว:**\n![Result](${url})` } }] })}\n`);
                        return Promise.resolve();
                    },
                    replyWithDocument: (doc) => {
                        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `\n\n📂 **ไฟล์ที่สร้างเสร็จแล้ว:** ${doc.source || doc}` } }] })}\n`);
                        return Promise.resolve();
                    }
                };
                for (const action of actions) {
                    await handleAgentActions(webCtx, action.type, action.data, userId);
                }
            }
            res.end();
            saveBotMemory(userId, messages[messages.length-1].content, fullContent);
        });

        axiosRes.data.on('error', (err) => {
            console.error('Stream Error:', err);
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `⚠️ Stream Error: ${err.message}` } }] })}\n`);
            res.end();
        });

    } catch (err) {
        console.error('Smart API Chat Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/generate-title', async (req, res) => {
    const { message } = req.body;
    try {
        const response = await axios.post(CONFIG.NVIDIA_URL, {
            model: CONFIG.MODEL,
            messages: [
                { role: 'system', content: 'Generate a very short title (max 4 words) for this chat conversation based on the first message. Reply with ONLY the title.' },
                { role: 'user', content: message }
            ],
            max_tokens: 20
        }, {
            headers: { 'Authorization': `Bearer ${NVIDIA_API_KEY}`, 'Content-Type': 'application/json' }
        });
        const title = response.data.choices[0].message.content.trim().replace(/^"|"$/g, '');
        res.json({ title });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/schedules', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database not initialized' });
    try {
        const snap = await db.collection('schedules').get();
        const scheds = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(scheds);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/schedules', async (req, res) => {
    const { time, query } = req.body;
    if (!db) return res.status(503).json({ error: 'Database not initialized' });
    try {
        const doc = await db.collection('schedules').add({
            time, query, active: true, createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        res.json({ id: doc.id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/schedules/:id', async (req, res) => {
    const { id } = req.params;
    const update = req.body;
    if (!db) return res.status(503).json({ error: 'Database not initialized' });
    try {
        await db.collection('schedules').doc(id).update(update);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/schedules/:id', async (req, res) => {
    const { id } = req.params;
    if (!db) return res.status(503).json({ error: 'Database not initialized' });
    try {
        await db.collection('schedules').doc(id).delete();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/tools/execute', async (req, res) => {
    const { tool, args } = req.body;
    // Basic tool execution wrapper
    console.log(`[Tool Execute] ${tool}`, args);
    try {
        // This is a placeholder since handleAgentActions is bound to Telegram ctx
        // For now, return a generic success or redirect to specific logic
        res.json({ result: `Tool ${tool} execution triggered (Backend simulation)` });
    } catch (err) { res.status(500).json({ error: err.message }); }
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
           .then(() => console.log("🤖 Bot Polling Started (Local PC Mode)"))
           .catch(err => console.error("❌ Bot Launch Failed:", err));
    } else if (bot && IS_RENDER) {
        console.log("🌐 Stacy is in Webhook Mode (Render Cloud). Ensure your Webhook URL is set!");
    }
});
