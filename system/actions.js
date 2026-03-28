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
const PptxGenJS = require('pptxgenjs');

// Destructure utils
const { performSearch, googleSearch, smartSearch, newsSearch, handleImageSearch, logToTerminal, smartReply, sendSmartImage } = require('./utils');
const { handleSubagent } = require('./subagent');
const { scheduleTask } = require('./cron-manager');
const { executeCommand } = require('./shell-executor');
const { draftDocument } = require('./writing-engine');
const { readFileChunk, writeFile, listDirectory, editFile } = require('./advanced-fs');
const { fetchUrlContent } = require('./web-tools');
const { executeMcpTool } = require('./mcp-client');
const modularSkills = require('./skills_loader');
const { isLocalAction, sendCommandToPC } = require('./bridge');

function tryRepairJSON(str) {
    // Attempt to fix truncated JSON by closing unclosed brackets
    let s = str.trim();
    let openBraces = 0, openBrackets = 0, inString = false, escape = false;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (escape) { escape = false; continue; }
        if (c === '\\') { escape = true; continue; }
        if (c === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (c === '{') openBraces++;
        if (c === '}') openBraces--;
        if (c === '[') openBrackets++;
        if (c === ']') openBrackets--;
    }
    // If we're inside a string, close it
    if (inString) s += '"';
    // Close any unclosed brackets/braces
    while (openBrackets > 0) { s += ']'; openBrackets--; }
    while (openBraces > 0) { s += '}'; openBraces--; }
    return s;
}

function extractActions(text) {
    if (!text) return { cleanText: "", actions: [] };
    const actions = [];
    let cleanText = text;

    // Use bracket-aware parser instead of regex (regex breaks on nested [] in JSON)
    // Robust check: If model forgot '[' but started with 'ACTION:', wrap it.
    let textToParse = text;
    if (!textToParse.includes('[ACTION:') && textToParse.includes('ACTION:')) {
        textToParse = textToParse.replace(/(ACTION:\s*[A-Z_]+[\s\S]*?)(?=\n|\[ACTION:|$)/g, '[$1]');
    }

    const marker = '[ACTION:';
    let searchFrom = 0;

    while (true) {
        const start = textToParse.indexOf(marker, searchFrom);
        if (start === -1) break;

        // Extract action type (e.g., CREATE_EXCEL)
        const afterMarker = start + marker.length;
        let typeEnd = afterMarker;
        while (typeEnd < textToParse.length && /\s/.test(textToParse[typeEnd])) typeEnd++; // skip spaces
        let typeEndPos = typeEnd;
        while (typeEndPos < textToParse.length && /[A-Z_]/.test(textToParse[typeEndPos])) typeEndPos++;
        const type = textToParse.substring(typeEnd, typeEndPos);

        // Now find the matching closing ] by counting brackets
        let depth = 1; // we already consumed the opening [
        let pos = typeEndPos;
        let inString = false, escape = false;

        while (pos < textToParse.length && depth > 0) {
            const c = textToParse[pos];
            if (escape) { escape = false; pos++; continue; }
            if (c === '\\') { escape = true; pos++; continue; }
            if (c === '"') { inString = !inString; pos++; continue; }
            if (!inString) {
                if (c === '[') depth++;
                if (c === ']') depth--;
            }
            pos++;
        }

        const fullMatch = textToParse.substring(start, pos);
        const dataStr = textToParse.substring(typeEndPos, pos - 1).trim();

        try {
            let data;
            if (dataStr.startsWith('{')) {
                try {
                    data = JSON.parse(dataStr);
                } catch (e1) {
                    console.warn(`[Action Parse] Direct parse failed for ${type}, attempting repair...`);
                    try {
                        data = JSON.parse(tryRepairJSON(dataStr));
                        console.log(`[Action Parse] Repair succeeded for ${type}`);
                    } catch (e2) {
                        console.error(`[Action Parse] Repair also failed for ${type}:`, dataStr.substring(0, 300));
                        data = {};
                    }
                }
            } else if (dataStr === '' || dataStr === '{}') {
                data = {};
            } else {
                const queryActions = ['WEB_SEARCH', 'IMAGE_SEARCH', 'YOUTUBE_OPEN', 'YOUTUBE_LIST_TABS'];
                if (queryActions.includes(type)) data = { query: dataStr };
                else if (type === 'WEB_BROWSE') data = { url: dataStr };
                else data = { value: dataStr };
            }

            actions.push({ type, data });
            cleanText = cleanText.replace(fullMatch, '');
        } catch (e) {
            console.error('Action Parse Error:', e.message);
        }

        searchFrom = pos;
    }

    return { cleanText: cleanText.trim(), actions };
}

async function handleAgentActions(ctx, type, data, userId, options = {}) {
    const { docDir, IS_RENDER, db } = options;
    const outputDir = path.join(__dirname, '../output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    // ========== HYBRID BRIDGE: Redirect local-only actions to PC ==========
    if (IS_RENDER && isLocalAction(type)) {
        try {
            const chatId = ctx.chat?.id || ctx.from?.id;
            await sendCommandToPC(db, userId, type, data, chatId);
            // ctx.reply(`📡 **ส่งคำสั่ง ${type} ไปยังคอมพิวเตอร์ที่บ้านแล้วค่ะ!**`); // Removed per user request
            return;
        } catch (err) {
            console.error(`[Bridge Error] ${type}:`, err.message);
            await ctx.reply(`❌ ส่งคำสั่งไปยังคอมที่บ้านไม่สำเร็จ: ${err.message}`);
            return;
        }
    }

    switch (type) {
        case 'CREATE_EXCEL':
            try {
                const workbook = xlsx.utils.book_new();
                const baseFileName = (data.filename || data.title || `export_${Date.now()}`).replace(/[\\/:*?"<>|]/g, '_') + (data.filename ? '' : '.xlsx');
                let filePath = path.join(outputDir, baseFileName);
                
                // Allow AI to specify direct path (e.g. OneDrive)
                if (data.path || data.customPath) {
                    const reqPath = data.path || data.customPath;
                    if (reqPath.toLowerCase().endsWith('.xlsx')) filePath = reqPath;
                }

                // Construct data if AI used headers/rows format instead of sheets
                let dataArray = data.data;
                if (!dataArray && data.headers) {
                    const rows = data.rows || [];
                    dataArray = [data.headers, ...rows];
                }

                // Validate: reject empty files (only headers, no rows)
                if (!dataArray || dataArray.length <= 1) {
                    console.warn('[CREATE_EXCEL] No rows data! Headers:', JSON.stringify(data.headers));
                    await ctx.reply('⚠️ หนูสร้าง Excel ไม่ได้ค่ะเจ้านาย เพราะข้อมูล rows ขาดหายไปค่ะ กรุณาลองสั่งอีกครั้งนะคะ');
                    break;
                }

                const sheets = data.sheets || [{ name: 'Data', data: dataArray || [] }];

                sheets.forEach(s => {
                    const ws = (Array.isArray(s.data) && s.data.length > 0 && typeof s.data[0] === 'object' && !Array.isArray(s.data[0]))
                                ? xlsx.utils.json_to_sheet(s.data)
                                : xlsx.utils.aoa_to_sheet(s.data);
                    if (s.merges) ws['!merges'] = s.merges;
                    xlsx.utils.book_append_sheet(workbook, ws, s.name);
                });
                
                xlsx.writeFile(workbook, filePath);
                
                // Backup to Permanent DocDir if we used temp path
                if (filePath.includes(outputDir) && docDir && fs.existsSync(docDir)) {
                    const permanentPath = path.join(docDir, baseFileName);
                    fs.copyFileSync(filePath, permanentPath);
                }

                await ctx.replyWithDocument({ source: filePath });
                await logToTerminal(userId, 'CREATE_EXCEL', `Generated: ${filePath}`);
                
                // HYBRID: Sync file to local PC via bridge
                if (IS_RENDER && db) {
                    try {
                        const fileBuffer = fs.readFileSync(filePath);
                        const base64 = fileBuffer.toString('base64');
                        const targetDir = "C:\\Users\\lgopl\\OneDrive\\เอกสาร\\stact doc";
                        await sendCommandToPC(db, userId, 'SAVE_FILE_LOCAL', { 
                            filename: baseFileName, 
                            base64, 
                            targetDir 
                        }, ctx.chat?.id);
                        console.log(`[Hybrid] File sync command sent for: ${baseFileName}`);
                    } catch (syncErr) {
                        console.warn('[Hybrid] File sync failed (non-critical):', syncErr.message);
                    }
                }
            } catch (err) { 
                console.error('CREATE_EXCEL Error:', err);
                ctx.reply(`❌ ระบบสร้างไฟล์ Excel ขัดข้อง: ${err.message}`); 
            }
            break;

        case 'CREATE_WORD':
            try {
                // 🛠️ DEFENSIVE CLEANING: Remove characters that break Word/XML
                const cleanStr = (s) => (s || "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "").trim();

                const fileName = (data.filename || data.title || `document_${Date.now()}`).replace(/[\\/:*?"<>|]/g, '_') + (data.filename ? '' : '.docx');
                const filePath = path.join(outputDir, fileName);

                const children = [
                    new Paragraph({ 
                        children: [new TextRun({ text: cleanStr(data.title) || 'Untitled', bold: true, size: 32 })], 
                        alignment: docx.AlignmentType.CENTER,
                        spacing: { after: 400 }
                    })
                ];
                console.log(`[CREATE_WORD] Generating Word for ${userId}. Data:`, JSON.stringify(data).substring(0, 500));
                
                // 🛠️ FALLBACK: If AI sent "content" instead of "sections", convert it
                if (!data.sections && data.content) {
                    data.sections = [{ text: data.content }];
                }

                (data.sections || []).forEach(s => {
                    if (s.heading) children.push(new Paragraph({ 
                        children: [new TextRun({ text: cleanStr(s.heading), bold: true, size: 28 })], 
                        spacing: { before: 200, after: 100 }
                    }));
                    if (s.text || s.content) {
                        const bodyText = s.text || s.content || "";
                        bodyText.split('\n').forEach(line => {
                            if (line.trim()) {
                                children.push(new Paragraph({ 
                                    children: [new TextRun({ text: cleanStr(line) })], 
                                    spacing: { after: 120 }
                                }));
                            }
                        });
                    }
                });

                const doc = new Document({
                    sections: [{
                        children: children,
                    }],
                });

                const buffer = await docx.Packer.toBuffer(doc);
                fs.writeFileSync(filePath, buffer);
                
                // Backup to Permanent DocDir (e.g. OneDrive) if available
                if (docDir && fs.existsSync(docDir)) {
                    const permanentPath = path.join(docDir, fileName);
                    fs.copyFileSync(filePath, permanentPath);
                    console.log(`[Backup] Word saved to: ${permanentPath}`);
                }

                await ctx.replyWithDocument({ source: filePath });
                await logToTerminal(userId, 'CREATE_WORD', `Generated: ${filePath}`);
                
                // HYBRID: Sync file to local PC via bridge
                if (IS_RENDER && db) {
                    try {
                        const fileBuffer = fs.readFileSync(filePath);
                        const base64 = fileBuffer.toString('base64');
                        const targetDir = "C:\\Users\\lgopl\\OneDrive\\เอกสาร\\stact doc";
                        await sendCommandToPC(db, userId, 'SAVE_FILE_LOCAL', { 
                            filename: fileName, 
                            base64, 
                            targetDir 
                        }, ctx.chat?.id);
                        console.log(`[Hybrid] File sync command sent for: ${fileName}`);
                    } catch (syncErr) {
                        console.warn('[Hybrid] File sync failed (non-critical):', syncErr.message);
                    }
                }
            } catch (err) { 
                console.error('CREATE_WORD Error:', err);
                ctx.reply(`❌ ระบบสร้างไฟล์ Word ขัดข้อง: ${err.message}`); 
            }
            break;

        case 'CREATE_SLIDE':
            try {
                const pptx = new PptxGenJS();
                const fileName = (data.filename || data.title || `slides_${Date.now()}`).replace(/[\\/:*?"<>|]/g, '_') + (data.filename ? '' : '.pptx');
                const filePath = path.join(outputDir, fileName);

                // Title Slide
                let titleSlide = pptx.addSlide();
                titleSlide.addText(data.title || 'Untitled Presentation', { x: 1, y: 1.5, w: '80%', fontSize: 44, color: '363636', align: 'center', bold: true });

                // Content Slides
                (data.slides || []).forEach(s => {
                    let slide = pptx.addSlide();
                    if (s.title) slide.addText(s.title, { x: 0.5, y: 0.3, w: '90%', fontSize: 32, color: '0088CC', bold: true });
                    if (s.content) slide.addText(s.content, { x: 0.5, y: 1.2, w: '90%', h: '70%', fontSize: 20, color: '333333', align: 'left', valign: 'top', bullet: true });
                });

                await pptx.writeFile({ fileName: filePath });
                
                // Backup to Permanent DocDir (e.g. OneDrive) if available
                if (docDir && fs.existsSync(docDir)) {
                    const permanentPath = path.join(docDir, fileName);
                    fs.copyFileSync(filePath, permanentPath);
                }

                await ctx.replyWithDocument({ source: filePath });
                await logToTerminal(userId, 'CREATE_SLIDE', `Generated: ${filePath}`);
            } catch (err) {
                console.error('CREATE_SLIDE Error:', err);
                ctx.reply(`❌ ระบบสร้างสไลด์ขัดข้อง: ${err.message}`);
            }
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
                await smartReply(ctx, stats, 60000); // Auto-delete after 60s
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
                const query = data.query || data.q || data.text || (typeof data === 'string' ? data : null);
                if (!query) throw new Error('คำค้นหาว่างเปล่า');
                const results = await smartSearch(query);
                await smartReply(ctx, results);
            } catch (err) { await ctx.reply(`❌ ค้นหาล้มเหลว: ${err.message}`); }
            break;

        case 'GOOGLE_SEARCH':
            try {
                const query = data.query || data.q || data.text || (typeof data === 'string' ? data : null);
                if (!query) throw new Error('คำค้นหาว่างเปล่า');
                const { googleSearch: gSearch } = require('./utils');
                const results = await gSearch(query);
                await smartReply(ctx, `🔍 **ผลการค้นหา (Google):**\n\n${results}`);
            } catch (err) { await ctx.reply(`❌ ค้นหาล้มเหลว: ${err.message}`); }
            break;

        case 'NEWS_SEARCH':
        case 'NEWS':
        case 'GET_NEWS':
            try {
                const query = data.query || data.q || data.topic || (typeof data === 'string' ? data : 'ข่าวประเทศไทยวันนี้');
                const results = await newsSearch(query);
                await smartReply(ctx, results);
            } catch (err) { await ctx.reply(`❌ ค้นหาข่าวล้มเหลว: ${err.message}`); }
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

                // Helper: Ultra-Robust Thai Date Parser (Handles BE 2569, DD/MM/YYYY, and standard formats)
                const parseThaiDate = (str) => {
                    if (!str) return new Date();
                    let s = str.trim().replace(/\s+/g, ' ');
                    
                    // Priority 1: DD/MM/YYYY or DD-MM-YYYY with optional time
                    const dmyRegex = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(\s+(\d{1,2}):(\d{1,2}))?/;
                    const match = s.match(dmyRegex);
                    if (match) {
                        let d = parseInt(match[1]);
                        let m = parseInt(match[2]) - 1;
                        let y = parseInt(match[3]);
                        if (y > 2400) y -= 543;
                        const date = new Date(y, m, d);
                        if (match[5]) date.setHours(parseInt(match[5]), parseInt(match[6] || 0));
                        return date;
                    }

                    // Priority 2: Standard parse with BE check
                    let d = new Date(s);
                    if (isNaN(d.getTime())) {
                        // Try just numbers if format like 27032569
                        if (/^\d{8}$/.test(s)) {
                           let d2 = parseInt(s.substring(0,2));
                           let m2 = parseInt(s.substring(2,4)) - 1;
                           let y2 = parseInt(s.substring(4,8));
                           if (y2 > 2400) y2 -= 543;
                           return new Date(y2, m2, d2);
                        }
                    }
                    if (d.getFullYear() > 2400) d.setFullYear(d.getFullYear() - 543);
                    return d;
                };

                // Robust date parsing
                let startDT = parseThaiDate(data.start);
                let endDT = data.end ? parseThaiDate(data.end) : new Date(startDT.getTime() + 600000); 

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
            } catch (err) { 
                console.error(`[CALENDAR_ERROR]`, err);
                let msg = err.message;
                if (err.message.includes('invalid_grant')) msg = "กุญแจ (Key) ของ Google Calendar ไม่ถูกต้องหรือหมดอายุค่ะ";
                if (err.message.includes('not found')) msg = "ไม่พบปฏิทิน (Calendar ID) ที่ระบุค่ะ";
                ctx.reply(`❌ บันทึกปฏิทินไม่สำเร็จ: ${msg}\n\n💡 เจ้านายลองเช็ค Environment Variable ใน Render นะคะว่าได้วางข้อมูลจากไฟล์ .json เข้าไปครบถ้วนหรือยังค่ะ?`); 
            }
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
                if (!db) throw new Error('ฐานข้อมูล (Firebase) ไม่ได้เชื่อมต่อค่ะ กรุณาเช็คค่า FIREBASE_SERVICE_ACCOUNT ใน Render นะคะ');
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

                ctx.reply(`📝 **บันทึกเวลาทำงานลงฐานข้อมูลให้แล้วค่ะเจ้านาย!**\n✅ **งาน:** ${task}\n🕒 **ระยะเวลา:** ${duration}\n🕒 **บันทึกเมื่อ:** ${now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}\n\n🔗 **เช็คหน้า Dashboard:** https://plum45.onrender.com\n\n💡 *หมายเหตุ: หากเจ้านายต้องการให้บันทึกลง Google Calendar ด้วย ให้แจ้งหนูว่า "ลงปฏิทินด้วยนะ" นะคะ*`);
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
                ctx.reply(`📌 **เพิ่มงานลงในรายการ To-Do ให้แล้วนะจ๊ะ!**\n🔹 ${title} (ระดับความสำคัญ: ${data.priority || 'ปกติ'})\n\n🔗 **เช็คหน้า Dashboard:** https://plum45.onrender.com`);
            } catch (err) { ctx.reply(`❌ เพิ่มงานไม่สำเร็จ: ${err.message}\n\n💡 *เจ้านายลองเช็คว่าได้ตั้งค่า FIREBASE_SERVICE_ACCOUNT ใน Render หรือยังนะคะ*`); }
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

        case 'CANVA_CONTROL':
        case 'CANVA_OPEN':
        case 'CANVA_SEARCH':
        case 'CANVA_CREATE':
            await (require('../skills/canva'))({ ctx, data, userId, logToTerminal });
            break;

        case 'SUBAGENT_SPAWN': {
            const result = await handleSubagent({ goal: data.goal, context: data.context || '', client: options.client, userId });
            await smartReply(ctx, `📌 **ผลลัพธ์จาก Subagent:**\n${result}`);
            break;
        }

        case 'SCHEDULE_TASK': {
            const { name, schedule, task } = data;
            const parsedSchedule = scheduleTask({ name, schedule, task, ctx, smartReply });
            if (parsedSchedule) {
                await smartReply(ctx, `⏰ **ตั้งเวลาเรียบร้อยแล้วค่ะ!**\n\nชื่องาน: ${name}\nเวลา: ${parsedSchedule} (รูปแบบ Cron)\nภารกิจ: ${task}`);
            } else {
                await smartReply(ctx, `❌ **ตั้งเวลาไม่สำเร็จค่ะ** ระบบไม่สามารถอ่านรูปแบบเวลา "${schedule}" ได้ค่ะเจ้านาย`);
            }
            break;
        }

        case 'RECOVER_WIFI': {
            const { execSync } = require('child_process');
            const fs = require('fs');
            const path = require('path');
            try {
                const profilesOutput = execSync('netsh wlan show profiles').toString();
                const profileNames = profilesOutput.split('\n').filter(line => line.includes(':')).map(line => line.split(':')[1].trim()).filter(n => n !== '');
                if (profileNames.length === 0) { await ctx.reply('❌ ไม่พบโปรไฟล์ Wi-Fi ค่ะ'); break; }

                const targetSSID = data.ssid || data.name || data.query;
                const profilesToScan = targetSSID 
                    ? profileNames.filter(n => n.toLowerCase().includes(targetSSID.toLowerCase())) 
                    : profileNames.slice(0, 10);

                let tableResult = `📶 **Wi-Fi Password Recovery (XML)** 📑\n\n`;
                tableResult += `| SSID | Password |\n`;
                tableResult += `| :--- | :--- |\n`;
                
                for (const ssid of profilesToScan) {
                    try {
                        execSync(`netsh wlan export profile name="${ssid}" folder="." key=clear`, { stdio: 'ignore' });
                        const files = fs.readdirSync('.');
                        const targetFile = files.find(f => f.startsWith('Wi-Fi-') && f.endsWith('.xml') && f.includes(ssid));
                        
                        if (targetFile && fs.existsSync(targetFile)) {
                            const xml = fs.readFileSync(targetFile, 'utf8');
                            const key = xml.match(/<keyMaterial>(.*)<\/keyMaterial>/);
                            tableResult += `| \`${ssid}\` | \`${key ? key[1] : '*(ไม่มี)*'}\` |\n`;
                            fs.unlinkSync(targetFile);
                        } else {
                            const detail = execSync(`netsh wlan show profile name="${ssid}" key=clear`).toString();
                            const keyMatch = detail.match(/Key Content\s*:\s*(.*)/i) || detail.match(/เนื้อหาคีย์\s*:\s*(.*)/i);
                            tableResult += `| \`${ssid}\` | \`${keyMatch ? keyMatch[1].trim() : '*(ไม่พบ)*'}\` |\n`;
                        }
                    } catch (e) {
                        tableResult += `| \`${ssid}\` | *Error* |\n`;
                    }
                }
                await smartReply(ctx, tableResult);
            } catch (err) { await ctx.reply(`❌ Wi-Fi Error: ${err.message}`); }
            break;
        }

        case 'RUN_COMMAND':
        case 'EXEC_COMMAND': {
            const output = await executeCommand(data.command);
            await smartReply(ctx, `🖥️ **System Output:**\n\`\`\`\n${output}\n\`\`\``, 60000); // Auto-delete after 60s
            break;
        }

        case 'DOCUMENT_DRAFT': {
            const draft = await draftDocument({ goal: data.goal, instructions: data.instructions || '', client: options.client });
            await smartReply(ctx, `🖋️ **Draft งานเขียน:**\n\n${draft}`);
            break;
        }

        case 'READ_FILE': {
            const result = readFileChunk(data.path, data.offset || 1, data.limit || 2000);
            await smartReply(ctx, `📄 **เนื้อหาไฟล์:**\n\`\`\`\n${result}\n\`\`\``);
            break;
        }

        case 'WRITE_FILE':
        case 'CREATE_FILE': {
            const result = writeFile(data.path, data.content);
            await smartReply(ctx, `💾 **สถานะแก้ไขไฟล์:**\n${result}`);
            break;
        }

        case 'EDIT_FILE': {
            const result = editFile(data.path, data.old_text, data.new_text, data.replace_all || false);
            await smartReply(ctx, `💾 **สถานะแก้ไขไฟล์:**\n${result}`);
            break;
        }

        case 'LIST_DIR': {
            const result = listDirectory(data.path, data.recursive || false, data.max_entries || 200);
            await smartReply(ctx, `📂 **เนื้อหาในโฟลเดอร์:**\n\`\`\`\n${result}\n\`\`\``);
            break;
        }

        case 'WEB_FETCH': {
            const result = await fetchUrlContent(data.url, data.max_chars || 50000);
            await smartReply(ctx, `🌐 **เนื้อหาเว็บ:**\n\`\`\`markdown\n${result}\n\`\`\``);
            break;
        }

        case 'MCP_CALL': {
            const result = await executeMcpTool(data.server, data.command, data.args || [], data.tool, data.tool_args || {});
            await smartReply(ctx, `🔌 **MCP Output:**\n\`\`\`\n${result}\n\`\`\``);
            break;
        }

        default:
            if (modularSkills.handlers[type]) {
                try {
                    await modularSkills.handlers[type](type, data, ctx, userId, options);
                } catch(err) {
                    console.error(`[Modular Skill Error] ${type}:`, err);
                    ctx.reply(`❌ ฟังก์ชันเพิ่มเติมทำงานผิดพลาด: ${err.message}`);
                }
            } else {
                console.log(`[Unhandled Action] Unknown or unused action type: ${type}`);
            }
            break;
    }
}

module.exports = { extractActions, handleAgentActions };
