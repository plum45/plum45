const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

module.exports = async function handleFormHelper({ ctx, data, userId, sendSmartImage, logToTerminal }) {
    let formBrowser = null;
    try {
        const url = data.url;
        if (!url) throw new Error("เจ้านายลืมส่งลิงก์แบบฟอร์มให้หนูค่ะ");
        
        await ctx.reply('📑 Stacy กำลังเข้าไปศึกษาแบบฟอร์ม/ข้อสอบ และสรุปข้อมูลไว้ที่หน้า Desktop ให้เจ้านายนะคะ...');
        
        try {
            formBrowser = await puppeteer.launch({ 
                headless: "new",
                args: ['--no-sandbox', '--disable-setuid-sandbox'] 
            });
        } catch (launchErr) {
            console.error("Puppeteer default launch failed, trying fallback...", launchErr);
            // Fallback for some hosting environments (like Render)
            formBrowser = await puppeteer.launch({
                headless: "new",
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
        }
        const page = await formBrowser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Extract visible questions and title
        const pageData = await page.evaluate(() => {
            const questions = [];
            document.querySelectorAll('[role="listitem"], .M7eMe, .Qr7Oae, .office-form-question-title').forEach(el => {
                const txt = el.innerText || "";
                if (txt.length > 5) questions.push(txt.trim());
            });
            return {
                title: document.title || 'Untitled Form',
                questions: questions.slice(0, 30)
            };
        });

        // Prepare Desktop folder - Detection with OneDrive support
        const homeDir = process.env.USERPROFILE || 'C:\\Users\\lgopl';
        const onedriveDesktop = path.join(homeDir, 'OneDrive', 'Desktop');
        const standardDesktop = path.join(homeDir, 'Desktop');
        
        let targetDesktop = fs.existsSync(onedriveDesktop) ? onedriveDesktop : standardDesktop;
        const desktopPath = path.join(targetDesktop, 'gg form');
        
        if (!fs.existsSync(desktopPath)) fs.mkdirSync(desktopPath, { recursive: true });

        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const cleanTitle = pageData.title.replace(/[\\/:*?"<>|]/g, '').substring(0, 50);
        const folderName = `${dateStr} - ${cleanTitle}`;
        const saveDir = path.join(desktopPath, folderName);
        if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });

        // Save Screenshot
        const screenshotPath = path.join(saveDir, 'exam_view.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });

        // Save Analysis as Premium HTML
        const htmlContent = `<!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>เฉลย: ${pageData.title}</title>
    <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600&display=swap" rel="stylesheet">
    <style>
        :root { --primary: #764ba2; --secondary: #667eea; --bg: #f5f7fa; }
        * { box-sizing: border-box; font-family: 'Sarabun', sans-serif; }
        body { background: var(--bg); margin: 0; padding: 40px 20px; line-height: 1.6; color: #333; }
        .container { max-width: 900px; margin: 0 auto; background: white; border-radius: 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.1); overflow: hidden; }
        .header { background: linear-gradient(135deg, var(--secondary), var(--primary)); color: white; padding: 40px; text-align: center; }
        .header h1 { margin: 0; font-size: 2.2em; font-weight: 600; }
        .header p { opacity: 0.9; margin: 10px 0 0; font-weight: 300; }
        .content { padding: 40px; }
        .question-card { background: #fafafa; border-left: 6px solid var(--primary); margin-bottom: 25px; padding: 25px; border-radius: 0 16px 16px 0; transition: transform 0.2s; }
        .question-card:hover { transform: translateX(5px); background: #fff; box-shadow: 0 5px 15px rgba(0,0,0,0.05); }
        .q-num { color: var(--primary); font-weight: 600; font-size: 0.9em; text-transform: uppercase; margin-bottom: 8px; display: block; }
        .q-text { font-size: 1.15em; font-weight: 400; color: #2d3436; margin-bottom: 15px; display: block; }
        .a-box { background: #e8f5e9; color: #2e7d32; padding: 12px 20px; border-radius: 12px; font-weight: 600; display: inline-flex; align-items: center; }
        .a-box::before { content: '✓'; margin-right: 10px; font-size: 1.2em; }
        .footer { text-align: center; padding: 20px; opacity: 0.5; font-size: 0.85em; }
        @media print { body { padding: 0; } .container { box-shadow: none; border: 1px solid #ddd; } .header { background: #333; } }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📚 เฉลย & บทวิเคราะห์</h1>
            <h1>${pageData.title}</h1>
            <p>วิเคราะห์โดย Stacy AI • ${now.toLocaleDateString('th-TH')} ${now.toLocaleTimeString('th-TH')}</p>
        </div>
        <div class="content">
            ${data.suggestion ? `<div style="white-space: pre-wrap; margin-bottom: 30px; padding: 20px; background: #fff3e0; border-radius: 15px; border-left: 5px solid #ff9800;">${data.suggestion}</div>` : ''}
            
            ${pageData.questions.map((q, i) => `
                <div class="question-card">
                    <span class="q-num">คำถามข้อที่ ${i+1}</span>
                    <span class="q-text">${q}</span>
                    <div class="a-box">สเตซี่กำลังเตรียมคำตอบที่ถูกต้องที่สุดให้เจ้านายค่ะ...</div>
                </div>
            `).join('')}
        </div>
        <div class="footer">
            Generated by Stacy AI 1.5.0-ARCHITECT • Premium High-Precision Intelligence
        </div>
    </div>
</body>
</html>`;

        const reportPath = path.join(saveDir, 'analysis_report.html');
        fs.writeFileSync(reportPath, htmlContent, 'utf8');

        // Final Response
        const summary = `✅ **จัดเก็บข้อมูลพรีเมียมเรียบร้อยแล้วค่ะ!**\n\n📂 โฟลเดอร์: \`gg form/${folderName}\` (บน Desktop)\n📄 ไฟล์: \`analysis_report.html\` (เฉลยแบบสวยงาม) และ \`exam_view.png\`\n\nหนูเตรียมเนื้อหาให้เจ้านายพร้อมอ่านที่หน้าจอคอมแล้วนะคะ!`;
        await sendSmartImage(ctx, screenshotPath, summary);
        
        await logToTerminal(userId, 'FORM_HELPER', `Analyzed and saved form to Desktop: ${pageData.title}`);
    } catch (err) {
        ctx.reply(`❌ ระบบจัดการข้อสอบขัดข้อง: ${err.message}`);
    } finally {
        if (formBrowser) await formBrowser.close();
    }
};
