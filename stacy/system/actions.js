const admin = require('firebase-admin');
const fs = require('fs');
const { google: googleAuth } = require('googleapis');
const path = require('path');
const axios = require('axios');
const { exec } = require('child_process');
const xlsx = require('xlsx');
const docx = require('docx');
const { Document, Paragraph, TextRun, HeadingLevel, TableOfContents } = docx;
const puppeteer = require('puppeteer');
const screenshot = require('screenshot-desktop');
const si = require('systeminformation');
const wol = require('wake_on_lan');

// Destructure utils
const { performSearch, handleImageSearch, logToTerminal, smartReply, sendSmartImage } = require('./utils');

function extractActions(text) {
    if (!text) return { cleanText: "", actions: [] };
    const actions = [];
    // More robust regex to catch actions even if AI misses the curly braces for simple strings
    const actionRegex = /\[ACTION:\s*([A-Z_]+)\s*(.*?)\s*\]/g;
    let match;
    let cleanText = text;

    while ((match = actionRegex.exec(text)) !== null) {
        try {
            const type = match[1];
            let dataStr = match[2].trim();
            let data;
            
            if (dataStr.startsWith('{')) {
                data = JSON.parse(dataStr);
            } else {
                // Heuristic: If it's a raw string, treat as "query" for search or "url" for browse
                const queryActions = ['WEB_SEARCH', 'IMAGE_SEARCH', 'YOUTUBE_OPEN', 'YOUTUBE_LIST_TABS'];
                if (queryActions.includes(type)) data = { query: dataStr };
                else if (type === 'WEB_BROWSE') data = { url: dataStr };
                else data = { value: dataStr };
            }
            
            actions.push({ type, data });
            cleanText = cleanText.replace(match[0], '');
        } catch (e) {
            console.error('Action Parse Error:', e, 'Data:', match[2]);
        }
    }
    return { cleanText: cleanText.trim(), actions };
}

async function handleAgentActions(ctx, type, data, userId, options = {}) {
    const { docDir, IS_RENDER, db } = options;
    const outputDir = path.join(__dirname, '../output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    switch (type) {
        case 'CREATE_EXCEL':
            try {
                const workbook = xlsx.utils.book_new();
                const fileName = data.filename || `export_${Date.now()}.xlsx`;
                const filePath = path.join(outputDir, fileName);
                const sheets = data.sheets || [{ name: 'Data', data: data.data || [] }];

                sheets.forEach(s => {
                    const ws = (Array.isArray(s.data) && s.data.length > 0 && typeof s.data[0] === 'object' && !Array.isArray(s.data[0]))
                                ? xlsx.utils.json_to_sheet(s.data)
                                : xlsx.utils.aoa_to_sheet(s.data);
                    if (s.merges) ws['!merges'] = s.merges;
                    xlsx.utils.book_append_sheet(workbook, ws, s.name);
                });
                
                xlsx.writeFile(workbook, filePath);
                await ctx.replyWithDocument({ source: filePath });
                await logToTerminal(userId, 'CREATE_EXCEL', `Generated: ${filePath}`);
            } catch (err) { ctx.reply(`❌ ระบบสร้างไฟล์ Excel ขัดข้อง: ${err.message}`); }
            break;

        case 'CREATE_WORD':
            try {
                const fileName = data.filename || `document_${Date.now()}.docx`;
                const filePath = path.join(outputDir, fileName);
                const children = [new Paragraph({ text: data.title || 'Untitled', heading: HeadingLevel.TITLE, alignment: docx.AlignmentType.CENTER })];

                (data.sections || []).forEach(s => {
                    if (s.heading) children.push(new Paragraph({ text: s.heading, heading: HeadingLevel.HEADING_1 }));
                    if (s.text) s.text.split('\n').forEach(line => children.push(new Paragraph({ children: [new TextRun(line)], spacing: { after: 200 } })));
                });

                const doc = new Document({ sections: [{ children }] });
                const buffer = await docx.Packer.toBuffer(doc);
                fs.writeFileSync(filePath, buffer);
                await ctx.replyWithDocument({ source: filePath });
                await logToTerminal(userId, 'CREATE_WORD', `Generated: ${filePath}`);
            } catch (err) { ctx.reply(`❌ ระบบสร้างไฟล์ Word ขัดข้อง: ${err.message}`); }
            break;

        case 'SCREEN_CAPTURE':
            try {
                const imgPath = path.join(outputDir, `screenshot_${Date.now()}.png`);
                await screenshot({ filename: imgPath });
                await sendSmartImage(ctx, imgPath, '📸 จับภาพหน้าจอปัจจุบันให้เจ้านายเรียบร้อยแล้วนะคะ');
                if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
            } catch (err) { ctx.reply(`❌ แคปหน้าจอไม่สำเร็จ: ${err.message}`); }
            break;

        case 'GET_PC_STATS':
            try {
                const [cpu, mem, load, battery] = await Promise.all([si.cpu(), si.mem(), si.currentLoad(), si.battery()]);
                let stats = `💻 **Laptop Status**\n- CPU: ${cpu.brand}\n- Load: ${load.currentLoad.toFixed(2)}%\n- RAM: ${(mem.used / 1e9).toFixed(2)} / ${(mem.total / 1e9).toFixed(2)} GB`;
                if (battery && battery.hasBattery) stats += `\n- 🔋 Battery: ${battery.percent}% (${battery.isCharging ? '⚡' : '🔋'})`;
                await ctx.reply(stats);
            } catch (err) { ctx.reply(`❌ ดึงข้อมูลระบบล้มเหลว`); }
            break;

        case 'WEB_BROWSE':
            let browser = null;
            let capturePath = path.join(outputDir, `web_${Date.now()}.png`);
            try {
                browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
                const page = await browser.newPage();
                await page.goto(data.url, { waitUntil: 'networkidle2', timeout: 60000 });
                await page.screenshot({ path: capturePath, fullPage: true });
                await sendSmartImage(ctx, capturePath, `🌐 แคปภาพจาก: ${data.url}`);
            } catch (err) { ctx.reply(`❌ เบราว์เซอร์ล้มเหลว: ${err.message}`); }
            finally { if (browser) await browser.close(); if (fs.existsSync(capturePath)) fs.unlinkSync(capturePath); }
            break;

        case 'WEB_SEARCH':
            try {
                const results = await performSearch(data.query);
                await smartReply(ctx, `🔍 **สรุปการวิจัย:**\n\n${results}`);
            } catch (err) { ctx.reply(`❌ ค้นหาล้มเหลว`); }
            break;

        case 'IMAGE_SEARCH':
            await handleImageSearch(ctx, data.query);
            break;

        case 'FETCH_API':
            try {
                const res = await axios({ url: data.url, method: data.method || 'GET', data: data.data, timeout: 15000 });
                await smartReply(ctx, `📡 API Response:\n\`\`\`json\n${JSON.stringify(res.data, null, 2).substring(0, 3000)}\n\`\`\``);
            } catch (err) { ctx.reply(`❌ API ล้มเหลว`); }
            break;

        case 'SYSTEM_CONTROL':
            try {
                if (data.action === 'SHUTDOWN') exec('shutdown /s /t 10');
                else if (data.action === 'RESTART') exec('shutdown /r /t 10');
                else if (data.action === 'WAKE' && IS_RENDER) {
                    wol.wake(data.mac, { address: data.host, port: 9 }, (e) => ctx.reply(e ? '❌ ปลุกไม่สำเร็จ' : '✅ ส่งสัญญาณปลุกแล้วครับ'));
                }
                ctx.reply(`⚙️ ดำเนินการ ${data.action} ให้แล้วนะคะ`);
            } catch (err) { ctx.reply(`❌ ควบคุมระบบล้มเหลว`); }
            break;

        // Skill based actions
        case 'GET_WEATHER':
            await (require('../skills/weather'))({ ctx, data, userId, logToTerminal });
            break;
        case 'FORM_HELPER':
            await (require('../skills/formHelper'))({ ctx, data, userId, sendSmartImage, logToTerminal });
            break;
        case 'KAHOOT_BOT':
            await (require('../skills/kahootBot'))({ ctx, data, userId, logToTerminal });
            break;
        case 'CODE_EXECUTOR':
            await (require('../skills/codeExecutor')).handleCodeExecutor({ ctx, data, userId, logToTerminal });
            break;
        case 'WEB_ANALYZER':
            await (require('../skills/webAnalyzer')).handleWebAnalyzer({ ctx, data, userId, logToTerminal });
            break;
        case 'FILE_MANAGER':
            await (require('../skills/fileManager')).handleFileManager({ ctx, data, userId, logToTerminal });
            break;
        case 'TRANSLATE':
            await (require('../skills/translator'))({ ctx, data, userId, logToTerminal });
            break;
        case 'CURRENCY':
        case 'EXCHANGE_RATE':
            await (require('../skills/currency'))({ ctx, data, userId, logToTerminal });
            break;
        case 'NEWS':
        case 'GET_NEWS':
            await (require('../skills/news'))({ ctx, data, userId, logToTerminal });
            break;
        case 'REMINDER':
            await (require('../skills/reminder'))({ ctx, data, userId, logToTerminal });
            break;
        case 'DAILY_BRIEF':
        case 'MORNING_BRIEF':
            await (require('../skills/dailyBrief'))({ ctx, data, userId, logToTerminal, db });
            break;
        case 'DAILY_NEWS':
            const { bot } = options;
            await (require('../skills/dailyNews')).handleDailyNewsAction({ ctx, data, bot, userId, logToTerminal });
            break;
        case 'ADD_CALENDAR_EVENT':
            try {
                const keyPath = path.join(__dirname, '../config/google-calendar-key.json');
                if (!fs.existsSync(keyPath)) throw new Error('ไม่พบไฟล์กุญแจปฏิทินค่ะ');
                const auth = new googleAuth.auth.GoogleAuth({
                    keyFile: keyPath,
                    scopes: ['https://www.googleapis.com/auth/calendar']
                });
                const calendar = googleAuth.calendar({ version: 'v3', auth });

                // Helper: use LOCAL time values directly (server is already in GMT+7)
                const toLocalISO = (dt) => {
                    if (!(dt instanceof Date) || isNaN(dt.getTime())) dt = new Date();
                    const pad = (n) => String(n).padStart(2, '0');
                    return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}+07:00`;
                };

                // Robust date parsing
                let startDT = data.start ? new Date(data.start) : new Date();
                let endDT = data.end ? new Date(data.end) : new Date(startDT.getTime() + 3600000); // 1 hour default

                // Validation
                if (isNaN(startDT.getTime())) throw new Error(`วันเวลาเริ่มต้น (${data.start}) ไม่ถูกต้องค่ะ`);
                if (isNaN(endDT.getTime())) endDT = new Date(startDT.getTime() + 3600000);

                const event = {
                    summary: data.title || data.summary || data.task || data.project || 'กิจกรรมจาก Stacy',
                    location: data.location || '',
                    description: data.description || '',
                    start: { dateTime: toLocalISO(startDT), timeZone: 'Asia/Bangkok' },
                    end: { dateTime: toLocalISO(endDT), timeZone: 'Asia/Bangkok' }
                };

                const calendarId = process.env.CALENDAR_ID || 'primary';
                const res = await calendar.events.insert({ calendarId, resource: event });

                // Sycn with Tasks for Dashboard Visibility
                if (db) {
                    await db.collection('userActivities').doc(String(userId)).collection('tasks').add({
                        title: event.summary,
                        time: toLocalISO(startDT),
                        type: 'calendar',
                        status: 'scheduled',
                        createdAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                }

                ctx.reply(`📅 **บันทึกนัดหมายเรียบร้อยแล้วค่ะ!**\n📌 **หัวข้อ:** ${data.title}\n🕒 **เวลา:** ${startDT.toLocaleString('th-TH')}\n🔗 [ดูในปฏิทิน](${res.data.htmlLink})`, { parse_mode: 'Markdown' });
            } catch (err) { ctx.reply(`❌ บันทึกปฏิทินไม่สำเร็จ: ${err.message}`); }
            break;

        case 'WORK_LOG':
            try {
                if (!db) throw new Error('ฐานข้อมูลไม่ได้เชื่อมต่อค่ะ');
                const task = data.task || data.project || data.title || data.query || "ไม่ได้ระบุกิจกรรม";
                const duration = data.duration || "1 ชม. (ค่าเริ่มต้น)";
                const toLocalISO = (dt) => {
                    const pad = (n) => String(n).padStart(2, '0');
                    return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}+07:00`;
                };
                const now = new Date();
                const localNow = toLocalISO(now);

                await db.collection('userActivities').doc(String(userId)).collection('workLogs').add({
                    task: task,
                    duration: duration,
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    localTime: localNow
                });

                // Sync with Tasks for Dashboard
                await db.collection('userActivities').doc(String(userId)).collection('tasks').add({
                    title: `Work: ${task} (${duration})`,
                    time: localNow,
                    type: 'work',
                    status: 'completed',
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });

                ctx.reply(`📝 **บันทึกเวลาทำงานลงฐานข้อมูลให้แล้วค่ะเจ้านาย!**\n✅ **งาน:** ${task}\n🕒 **ระยะเวลา:** ${duration}\n🕒 **บันทึกเมื่อ:** ${new Date().toLocaleString('th-TH')}\n\n💡 *หมายเหตุ: หากเจ้านายต้องการให้บันทึกลง Google Calendar ด้วย ให้แจ้งหนูว่า "ลงปฏิทินด้วยนะ" นะคะ*`);
            } catch (err) { ctx.reply(`❌ บันทึก Log ไม่สำเร็จ: ${err.message}`); }
            break;

        case 'ADD_TASK':
            try {
                if (!db) throw new Error('ฐานข้อมูลไม่ได้เชื่อมต่อค่ะ');
                const title = data.title || data.query || data.task || "งานใหม่";
                await db.collection('userActivities').doc(String(userId)).collection('tasks').add({
                    title: title,
                    priority: data.priority || 'medium',
                    status: 'pending',
                    createdAt: new Date()
                });
                ctx.reply(`📌 **เพิ่มงานลงในรายการ To-Do ให้แล้วนะจ๊ะ!**\n🔹 ${title} (ระดับความสำคัญ: ${data.priority || 'ปกติ'})`);
            } catch (err) { ctx.reply(`❌ เพิ่มงานไม่สำเร็จ: ${err.message}`); }
            break;

        case 'IMAGE_GEN':
            try {
                const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
                const NVIDIA_IMAGE_URL = 'https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-xl';
                await ctx.reply('🎨 **หนูกำลังวาดภาพให้เจ้านายอยู่นะคะ รออึดใจเดียวค่ะ...**');
                const res = await axios.post(NVIDIA_IMAGE_URL, {
                    text_prompts: [{ text: data.prompt }],
                    cfg_scale: 7,
                    steps: 30,
                    seed: 0
                }, {
                    headers: { 'Authorization': `Bearer ${NVIDIA_API_KEY}`, 'Accept': 'application/json' },
                    timeout: 60000
                });
                const imgPath = path.join(outputDir, `gen_${Date.now()}.png`);
                const buffer = Buffer.from(res.data.artifacts[0].base64, 'base64');
                fs.writeFileSync(imgPath, buffer);
                await sendSmartImage(ctx, imgPath, `🎨 **ภาพวาดจากจินตนาการเรื่อง:** "${data.prompt}"`);
            } catch (err) { ctx.reply(`❌ วาดภาพไม่สำเร็จ: ${err.message}`); }
            break;

        case 'BROWSER_INTERACT':
            await (require('../skills/browserInteract'))({ ctx, data, userId, sendSmartImage, logToTerminal });
            break;
    }
}

module.exports = { extractActions, handleAgentActions };
