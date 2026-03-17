const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

module.exports = async function handleBrowserInteract({ ctx, data, userId, sendSmartImage, logToTerminal }) {
    let interactBrowser = null;
    let statusMsg = null;
    let page = null;
    try {
        const url = data.url;
        const steps = data.steps || []; 
        const showProgress = data.showProgress || true; // Default to showing movement
        
        statusMsg = await ctx.reply(`🌐 **[Live Browser Session]**\nสเตซี่กำลังเริ่มทำงานนะคะ...\n🏁 เป้าหมาย: ${steps.length} ขั้นตอน`);
        
        interactBrowser = await puppeteer.launch({ 
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        page = await interactBrowser.newPage();
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
                    const rootDir = path.join(__dirname, '..', '..');
                    const midPath = path.join(rootDir, `step_${currentStep}_${Date.now()}.png`);
                    await page.screenshot({ path: midPath });
                    await sendSmartImage(ctx, midPath, `📸 **Live Update:** ${step.value || stepDesc}`);
                    if (fs.existsSync(midPath)) fs.unlinkSync(midPath);
                }

                // Real-time Visual Trick: If it's a "milestone" step, send a small update image
                if (showProgress && (currentStep % 3 === 0 || step.urgent)) {
                   const rootDir = path.join(__dirname, '..', '..');
                   const progressPath = path.join(rootDir, `progress_${currentStep}.png`);
                   await page.screenshot({ path: progressPath });
                   await sendSmartImage(ctx, progressPath, `📡 **ความคืบหน้า (ขั้นตอนที่ ${currentStep}):** ${stepDesc}`);
                   if (fs.existsSync(progressPath)) fs.unlinkSync(progressPath);
                }

            } catch (stepErr) {
                console.warn(`⚠️ Browser Step Failed: ${stepErr.message}`);
                await ctx.reply(`⚠️ **ติดขัดที่ขั้นตอนที่ ${currentStep}**: ${stepErr.message}\nหนูจะข้ามไปทำขั้นตอนถัดไปนะคะจ๊ะ!`);
            }
        }
        
        const rootDir = path.join(__dirname, '..', '..');
        const finalPath = path.join(rootDir, `browser_interact_final_${Date.now()}.png`);
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
};
