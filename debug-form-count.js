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
        console.log('🔍 กำลังเข้าหน้าเว็บเพื่อตรวจข้อสอบใหม่...');
        await page.goto('https://docs.google.com/forms/d/e/1FAIpQLSfYiyfmCILD8zFISEWgwnyiZ2moBjZc4keSy-8mPyBcBmRLcw/viewform', { waitUntil: 'networkidle2' });
        
        const pageData = await page.evaluate(() => {
            const title = document.title;
            // Find all question containers
            const questionNodes = document.querySelectorAll('.Qr7Oae, .M7eMe');
            const questions = Array.from(questionNodes).map(el => el.innerText.trim()).filter(t => t.length > 5);
            return { title, count: questions.length, questions };
        });

        console.log(`📊 ผลการตรวจ: ${pageData.title}`);
        console.log(`🔢 จำนวนข้อที่นับได้จริงๆ: ${pageData.count} ข้อ`);
        
        // Save screenshot to proof the real view
        const homeDir = process.env.USERPROFILE || 'C:\\Users\\lgopl';
        const desktop = fs.existsSync(path.join(homeDir, 'OneDrive', 'Desktop')) ? path.join(homeDir, 'OneDrive', 'Desktop') : path.join(homeDir, 'Desktop');
        const proofPath = path.join(desktop, 'gg form', 'real_exam_view.png');
        
        await page.screenshot({ path: proofPath, fullPage: true });
        console.log(`📸 แคปภาพหน้าเว็บจริงไว้ที่: ${proofPath}`);
        
        pageData.questions.forEach((q, i) => {
            console.log(`[ข้อ ${i+1}]: ${q.substring(0, 100)}...`);
        });

    } catch (e) {
        console.error('❌ Error:', e.message);
    } finally {
        await browser.close();
    }
})();
