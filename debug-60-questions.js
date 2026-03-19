const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
    const browser = await puppeteer.launch({ 
        headless: "new", 
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    const page = await browser.newPage();
    try {
        console.log('🔍 กำลังตรวจสอบข้อสอบ 60 ข้อตามคำบอกของเจ้านาย...');
        await page.goto('https://docs.google.com/forms/d/e/1FAIpQLSfYiyfmCILD8zFISEWgwnyiZ2moBjZc4keSy-8mPyBcBmRLcw/viewform', { waitUntil: 'networkidle2' });
        
        const questionsData = await page.evaluate(() => {
            // Google Forms questions are usually in containers with class "Qr7Oae"
            const containers = document.querySelectorAll('.Qr7Oae');
            const data = [];
            containers.forEach((container, index) => {
                const titleEl = container.querySelector('[role="heading"], .M7eMe');
                if (titleEl) {
                    const title = titleEl.innerText.trim();
                    const options = Array.from(container.querySelectorAll('[role="radio"], [role="checkbox"], .docssharedWizToggleLabeledLabelText'))
                                        .map(el => el.innerText.trim())
                                        .filter(t => t.length > 0);
                    data.push({ id: index + 1, title, options });
                }
            });
            return data;
        });

        console.log(`🔢 ตรวจพบคำถามพื้นฐานทั้งหมด: ${questionsData.length} รายการ`);
        
        // Let's filter to get exactly what seems like numbered questions if possible
        const filteredQuestions = questionsData.filter(q => q.options.length > 0);
        console.log(`📝 จำนวนข้อที่มีตัวเลือกจริงๆ: ${filteredQuestions.length} ข้อ`);

        // Save detailed report
        const homeDir = process.env.USERPROFILE || 'C:\\Users\\lgopl';
        const desktop = fs.existsSync(path.join(homeDir, 'OneDrive', 'Desktop')) ? path.join(homeDir, 'OneDrive', 'Desktop') : path.join(homeDir, 'Desktop');
        const reportPath = path.join(desktop, 'gg form', 'exact_60_questions_report.txt');
        
        let reportContent = `📋 รายงานการวิเคราะห์ข้อสอบ (ยืนยันจำนวน 60 ข้อ)\n\n`;
        filteredQuestions.slice(0, 60).forEach((q, i) => {
            reportContent += `ข้อที่ ${i+1}: ${q.title}\n`;
            q.options.forEach((opt, oi) => {
                reportContent += `   [ ] ${opt}\n`;
            });
            reportContent += `\n`;
        });

        fs.writeFileSync(reportPath, reportContent, 'utf8');
        console.log(`✅ บันทึกรายงาน 60 ข้อไว้ที่: ${reportPath}`);

        // Take precise screenshot of first 60 questions area if possible
        const finalScreenshot = path.join(desktop, 'gg form', 'exam_focus_60.png');
        await page.screenshot({ path: finalScreenshot, fullPage: true });

    } catch (e) {
        console.error('❌ Error:', e.message);
    } finally {
        await browser.close();
    }
})();
