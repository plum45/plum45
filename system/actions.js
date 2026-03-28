const admin = require('firebase-admin');
const fs = require('fs');
const { google: googleAuth } = require('googleapis');
const path = require('path');
const axios = require('axios');
const { exec } = require('child_process');
const xlsx = require('xlsx');
const docx = require('docx');
const { Document, Paragraph, TextRun } = docx;
const screenshot = require('screenshot-desktop');
const si = require('systeminformation');

const { googleSearch, newsSearch, handleImageSearch, logToTerminal, smartReply, sendSmartImage } = require('./utils');
const { isLocalAction, sendCommandToPC } = require('./bridge');

function extractActions(text) {
    if (!text) return { cleanText: "", actions: [] };
    const actions = [];
    const regex = /\[ACTION:\s*([A-Z_]+)\s*(\{[\s\S]*?\})\]/g;
    let match;
    let cleanText = text;
    while ((match = regex.exec(text)) !== null) {
        try {
            actions.push({ type: match[1], data: JSON.parse(match[2]) });
            cleanText = cleanText.replace(match[0], '');
        } catch (e) {}
    }
    return { cleanText: cleanText.trim(), actions };
}

async function handleAgentActions(ctx, type, data, userId, options = {}) {
    const { docDir, IS_RENDER, db } = options;
    const outputDir = path.join(__dirname, '../output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    if (IS_RENDER && isLocalAction(type)) {
        await sendCommandToPC(db, userId, type, data, ctx.chat?.id);
        await ctx.reply(`📡 **ส่งคำสั่ง ${type} ไปยังคอมพิวเตอร์ที่บ้านแล้วค่ะ!**`);
        return;
    }

    switch (type) {
        case 'CREATE_EXCEL':
            try {
                const workbook = xlsx.utils.book_new();
                const fileName = `${data.filename || 'export'}.xlsx`;
                const filePath = path.join(outputDir, fileName);
                const ws = xlsx.utils.aoa_to_sheet(data.rows);
                xlsx.utils.book_append_sheet(workbook, ws, "Sheet1");
                xlsx.writeFile(workbook, filePath);
                await ctx.replyWithDocument({ source: filePath });
                if (IS_RENDER && db) {
                    const base64 = fs.readFileSync(filePath).toString('base64');
                    await sendCommandToPC(db, userId, 'SAVE_FILE_LOCAL', { filename: fileName, base64 }, ctx.chat?.id);
                }
            } catch (e) { ctx.reply(`❌ Excel Error: ${e.message}`); }
            break;
        case 'CREATE_WORD':
            try {
                const doc = new Document({ sections: [{ children: (data.sections || []).map(s => new Paragraph({ children: [new TextRun(s.text)] })) }] });
                const fileName = `${data.filename || 'doc'}.docx`;
                const filePath = path.join(outputDir, fileName);
                const buffer = await docx.Packer.toBuffer(doc);
                fs.writeFileSync(filePath, buffer);
                await ctx.replyWithDocument({ source: filePath });
                if (IS_RENDER && db) {
                    const base64 = buffer.toString('base64');
                    await sendCommandToPC(db, userId, 'SAVE_FILE_LOCAL', { filename: fileName, base64 }, ctx.chat?.id);
                }
            } catch (e) { ctx.reply(`❌ Word Error: ${e.message}`); }
            break;
        case 'WEB_SEARCH':
        case 'GOOGLE_SEARCH':
            const res = await googleSearch(data.query);
            await smartReply(ctx, res);
            break;
        case 'NEWS_SEARCH':
            const news = await newsSearch(data.query);
            await smartReply(ctx, news);
            break;
        case 'IMAGE_SEARCH':
            await handleImageSearch(ctx, data.query);
            break;
        case 'GET_PC_STATS':
            const stats = await si.cpu();
            await ctx.reply(`💻 CPU: ${stats.brand}`);
            break;
        case 'SCREEN_CAPTURE':
            const imgPath = path.join(outputDir, 'screen.png');
            await screenshot({ filename: imgPath });
            await ctx.replyWithPhoto({ source: imgPath });
            break;
        case 'WORK_LOG':
            if (db) await db.collection('userActivities').doc(String(userId)).collection('workLogs').add({ task: data.task, duration: data.duration, timestamp: new Date() });
            await ctx.reply(`📝 บันทึกงาน: ${data.task} (${data.duration}) เรียบร้อยค่ะ`);
            break;
        default:
            console.log(`Unhandled action: ${type}`);
    }
}

module.exports = { extractActions, handleAgentActions };
