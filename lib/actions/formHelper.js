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

        // Save Analysis Text
        const analysisText = `📝 แบบทดสอบ: ${pageData.title}\nวันที่: ${now.toLocaleString('th-TH')}\nลิงก์: ${url}\n\n` + 
            `💡 แนวทางคำตอบที่สเตซี่วิเคราะห์ให้:\n\n` +
            (data.suggestion || pageData.questions.map((q, i) => `ข้อที่ ${i+1}: ${q}\n[สเตซี่กำลังประมวลผลคำตอบจากฐานความรู้...]\n`).join('\n'));
        
        const reportPath = path.join(saveDir, 'analysis_report.txt');
        fs.writeFileSync(reportPath, analysisText, 'utf8');

        // Final Response
        const summary = `✅ **จัดเก็บข้อมูลเรียบร้อยแล้วค่ะ!**\n\n📂 โฟลเดอร์: \`gg form/${folderName}\` (บน Desktop)\n📄 ไฟล์: \`analysis_report.txt\` และ \`exam_view.png\`\n\nหนูเตรียมเนื้อหาให้เจ้านายพร้อมอ่านที่หน้าจอคอมแล้วนะคะ!`;
        await sendSmartImage(ctx, screenshotPath, summary);
        
        await logToTerminal(userId, 'FORM_HELPER', `Analyzed and saved form to Desktop: ${pageData.title}`);
    } catch (err) {
        ctx.reply(`❌ ระบบจัดการข้อสอบขัดข้อง: ${err.message}`);
    } finally {
        if (formBrowser) await formBrowser.close();
    }
};
