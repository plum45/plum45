/**
 * Stacy AI - Smart Exam Solver Module
 * ฟังก์ชั่นช่วยทำข้อสอบและวิเคราะห์คำถามอัตโนมัติ
 * Version: 2.0.0
 */

const puppeteer = require('puppeteer');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

/**
 * วิเคราะห์คำถามปรนัยและหาคำตอบที่ถูกต้อง
 * @param {Object} question - คำถามที่ต้องการวิเคราะห์
 * @param {Array} question.options - ตัวเลือก
 * @param {string} aiContext - บริบทเพิ่มเติมจาก AI
 * @returns {Object} - คำตอบและเหตุผล
 */
async function analyzeQuestion(question, options, aiContext = '') {
    // ใช้ความรู้ทางการศึกษาและหลักตรรกะวิทยา
    const knowledgeBase = {
        // คำถามเกี่ยวกับการสอน
        'cooperative learning': 'การเรียนรู้แบบร่วมมือ',
        'experimental instruction': 'รูปแบบการจัดการเรียนรู้จากประสบการณ์',
        'brain-based learning': 'การเรียนรู้โดยใช้สมองเป็นฐาน',
        'project-based learning': 'การจัดการเรียนรู้แบบใช้โครงงานเป็นฐาน',
        'problem-based learning': 'การจัดการเรียนรู้แบบใช้ปัญหาเป็นฐาน',
        'constructivism': 'รูปแบบการจัดการเรียนรู้แบบสร้างองค์ความรู้',
        'inquiry': 'การเรียนแบบสืบค้น',
        'discovery': 'การเรียนแบบค้นพบ',
        'case study': 'การเรียนแบบใช้กรณีศึกษา',
        'simulation': 'การจำลองสถานการณ์',
        'role play': 'การแสดงบทบาทสมมติ',
        'cippa model': 'รูปแบบการจัดการเรียนรู้ที่เน้นผู้เรียนเป็นสำคัญ',
        'addie model': 'รูปแบบการสอน 5 ขั้นตอน (Analysis, Design, Development, Implementation, Evaluation)',
        'stem education': 'การเรียนการสอนแบบบูรณาการ (Science, Technology, Engineering, Mathematics)',
        'multiple intelligences': 'พหุปัญญา - แนวคิดการพัฒนาผู้เรียนอย่างรอบด้าน',
        'self directed learning': 'การเรียนรู้แบบนำตนเอง',
        'professional learning community': 'ชุมชนแห่งการเรียนรู้ทางวิชาชีพ',
        'active learning': 'การเรียนรู้ผ่านการทำกิจกรรม',
        'mind mapping': 'แผนผังความคิด',
        'concept mapping': 'การสอนแบบสร้างโครงสร้างความรู้',
        'jigsaw': 'การติดต่อภาพ - เทคนิคการเรียนรู้แบบร่วมมือ',
        'stad': 'Student Teams Achievement Divisions - การเรียนรู้แบบกลุ่มสัมฤทธิ์',
        'tgt': 'Team Games Tournament - เทคนิคการเรียนรู้แบบร่วมมือ',
        'backward design': 'การจัดการเรียนรู้แบบย้อนกลับ',
    };

    // วิเคราะห์คำถามและหาคำตอบ
    const questionLower = question.toLowerCase();

    // ตรวจสอบคำสำคัญในคำถาม
    for (const [key, value] of Object.entries(knowledgeBase)) {
        if (questionLower.includes(key) || questionLower.includes(value)) {
            // หาตัวเลือกที่ตรงกับคำตอบ
            for (const option of options) {
                const optionLower = option.toLowerCase();
                if (optionLower.includes(value.toLowerCase()) ||
                    value.toLowerCase().includes(optionLower.replace(/[่้้๊๋]/g, ''))) {
                    return {
                        answer: option,
                        confidence: 0.95,
                        reason: `คำถามเกี่ยวกับ "${key}" ซึ่งหมายถึง "${value}"`,
                        source: 'knowledge_base'
                    };
                }
            }
        }
    }

    // ใช้ AI context ถ้ามี
    if (aiContext) {
        // วิเคราะห์จากบริบท
        for (const option of options) {
            if (aiContext.toLowerCase().includes(option.toLowerCase())) {
                return {
                    answer: option,
                    confidence: 0.7,
                    reason: `จากบริบทที่วิเคราะห์มา`,
                    source: 'ai_context'
                };
            }
        }
    }

    // ถ้าไม่พบ ให้ส่งคำถาอบไปวิเคราะห์ต่อ
    return {
        answer: null,
        confidence: 0,
        reason: 'ต้องการการวิเคราะห์เพิ่มเติมจาก AI',
        source: 'need_ai',
        question: question,
        options: options
    };
}

/**
 * ดึงคำถามจาก Google Forms
 * @param {string} url - URL ของ Google Forms
 * @returns {Array} - รายการคำถาม
 */
async function extractGoogleFormQuestions(url) {
    let browser = null;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=th-TH']
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        console.log(`[FORM_EXTRACT] Opening: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // รอให้ฟอร์มโหลด
        await page.waitForSelector('div[role="listitem"], .Qr7Oae, .M7eMe', { timeout: 10000 }).catch(() => {});

        // ดึงข้อมูลคำถาม
        const questions = await page.evaluate(() => {
            const results = [];

            // หาทุกคำถามในฟอร์ม
            const questionElements = document.querySelectorAll('[role="listitem"], .Qr7Oae, .M7eMe, .geG5Pe');

            questionElements.forEach((el, index) => {
                const questionText = el.querySelector('.M7eMe, .HoCfj, .H2MOkc')?.innerText ||
                                    el.querySelector('[role="heading"]')?.innerText ||
                                    el.innerText.split('\n')[0];

                // หาตัวเลือก
                const options = [];
                const optionElements = el.querySelectorAll('[role="radio"], [role="checkbox"], .nWQGrd .docssharedWizToggleLabeledLabelText, .aDTYNe .yNMZtd');
                optionElements.forEach(opt => {
                    const optText = opt.innerText || opt.getAttribute('aria-label') || '';
                    if (optText.trim()) {
                        options.push(optText.trim());
                    }
                });

                // หาตัวเลือกแบบอื่น
                if (options.length === 0) {
                    const altOptions = el.querySelectorAll('.nWQGrd, .aDTYNe, .oyXaNc');
                    altOptions.forEach(opt => {
                        const label = opt.querySelector('.docssharedWizToggleLabeledLabelText');
                        if (label && label.innerText) {
                            options.push(label.innerText.trim());
                        }
                    });
                }

                // หาประเภทคำถาม
                const isMultiple = el.querySelector('[role="checkbox"]') !== null;
                const isShortAnswer = el.querySelector('input[type="text"], textarea') !== null;

                if (questionText && questionText.length > 0) {
                    results.push({
                        number: index + 1,
                        question: questionText.trim(),
                        options: options,
                        type: isMultiple ? 'multiple' : (isShortAnswer ? 'text' : 'single'),
                        required: el.querySelector('[aria-label*="required"], .H2MOkc span[aria-label="Required"]') !== null
                    });
                }
            });

            return results;
        });

        // ถ้าไม่พบคำถาม ลองวิธีอื่น
        if (questions.length === 0) {
            const alternativeQuestions = await page.evaluate(() => {
                const results = [];
                const allText = document.body.innerText;
                const lines = allText.split('\n');

                let currentQ = null;
                let currentOpts = [];

                lines.forEach(line => {
                    line = line.trim();
                    if (line.length < 2) return;

                    // ตรวจสอบว่าเป็นคำถามหรือไม่ (มีตัวเลือกมักจะขึ้นต้นด้วยตัวเลือก)
                    if (line.match(/^[ก-๙a-zA-Z0-9]\.\s/) || line.match(/^[\(\[]?[ก-๙A-Da-d][\)\]]?\s/)) {
                        // เป็นตัวเลือก
                        if (currentQ) {
                            currentOpts.push(line.replace(/^[ก-๙A-Da-d][\.\)\]]?\s*/, ''));
                        }
                    } else if (line.match(/^[0-9]+\./) || line.includes('?') || line.includes('ข้อใด')) {
                        // เป็นคำถามใหม่
                        if (currentQ) {
                            results.push({
                                number: results.length + 1,
                                question: currentQ,
                                options: currentOpts,
                                type: currentOpts.length > 0 ? 'single' : 'text'
                            });
                        }
                        currentQ = line.replace(/^[0-9]+\.\s*/, '');
                        currentOpts = [];
                    }
                });

                // เพิ่มคำถามสุดท้าย
                if (currentQ) {
                    results.push({
                        number: results.length + 1,
                        question: currentQ,
                        options: currentOpts,
                        type: currentOpts.length > 0 ? 'single' : 'text'
                    });
                }

                return results;
            });

            questions.push(...alternativeQuestions);
        }

        console.log(`[FORM_EXTRACT] Found ${questions.length} questions`);
        return questions;

    } catch (error) {
        console.error('[FORM_EXTRACT] Error:', error.message);
        throw error;
    } finally {
        if (browser) await browser.close();
    }
}

/**
 * สร้างไฟล์เฉลย HTML
 * @param {string} title - ชื่อแบบทดสอบ
 * @param {Array} questions - คำถามและคำตอบ
 * @param {string} savePath - ที่อยู่ที่จะบันทึก
 * @returns {string} - ที่อยู่ไฟล์ที่สร้าง
 */
async function generateAnswerSheet(title, questions, savePath) {
    const htmlContent = `<!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>เฉลย ${title}</title>
    <style>
        * { box-sizing: border-box; font-family: 'Sarabun', 'Segoe UI', sans-serif; }
        body { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; margin: 0; padding: 20px; }
        .container { max-width: 900px; margin: 0 auto; background: white; border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); overflow: hidden; }
        .header { background: linear-gradient(90deg, #4CAF50, #45a049); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 2em; }
        .content { padding: 20px 30px; }
        .question { background: #f8f9fa; border-left: 5px solid #4CAF50; margin: 15px 0; padding: 15px 20px; border-radius: 0 10px 10px 0; }
        .question-number { font-weight: bold; color: #4CAF50; font-size: 1.1em; }
        .question-text { font-weight: bold; color: #333; margin: 8px 0; }
        .answer { background: linear-gradient(90deg, #e8f5e9, #c8e6c9); padding: 10px 15px; border-radius: 8px; color: #2e7d32; font-weight: bold; display: inline-block; }
        .answer::before { content: "✓ "; }
        .options { margin: 10px 0; padding-left: 20px; color: #555; }
        .options li { margin: 5px 0; }
        @media print { body { background: white; } .container { box-shadow: none; } }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📚 เฉลยแบบทดสอบ</h1>
            <h1>${title}</h1>
            <p>รวม ${questions.length} ข้อ</p>
        </div>
        <div class="content">
            ${questions.map((q, i) => `
            <div class="question">
                <div class="question-number">ข้อ ${i + 1}</div>
                <div class="question-text">${q.question}</div>
                ${q.answer ? `<div class="answer">${q.answer}</div>` : '<div class="answer" style="background: #fff3e0; color: #e65100;">ต้องวิเคราะห์เพิ่มเติม</div>'}
                ${q.reason ? `<div style="margin-top: 8px; color: #666; font-size: 0.9em;">📌 ${q.reason}</div>` : ''}
            </div>
            `).join('')}
        </div>
    </div>
</body>
</html>`;

    // สร้างโฟลเดอร์ถ้ายังไม่มี
    const dir = path.dirname(savePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(savePath, htmlContent, 'utf8');
    console.log(`[ANSWER_SHEET] Generated: ${savePath}`);
    return savePath;
}

/**
 * ทำข้อสอบ Google Forms อัตโนมัติ
 * @param {Object} params - พารามิเตอร์
 * @returns {Object} - ผลลัพธ์
 */
async function solveGoogleForm(params) {
    const { url, ctx, userId, sendSmartImage, logToTerminal, aiSolver } = params;

    let browser = null;
    const results = {
        title: '',
        questions: [],
        answers: [],
        answerSheetPath: null,
        screenshotPath: null
    };

    try {
        // แจ้งสถานะ
        if (ctx) {
            await ctx.reply('📝 **Stacy Exam Solver v2.0**\nกำลังวิเคราะห์แบบทดสอบ...');
        }

        // ดึงคำถามจากฟอร์ม
        const questions = await extractGoogleFormQuestions(url);
        results.questions = questions;

        if (questions.length === 0) {
            throw new Error('ไม่พบคำถามในแบบฟอร์ม');
        }

        if (ctx) {
            await ctx.reply(`📊 พบ ${questions.length} ข้อคำถาม\n🔍 กำลังวิเคราะห์คำตอบ...`);
        }

        // วิเคราะห์คำตอบแต่ละข้อ
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            let answer = null;
            let reason = '';

            // วิเคราะห์ด้วย knowledge base ก่อน
            if (q.options && q.options.length > 0) {
                const analysis = await analyzeQuestion(q.question, q.options, aiSolver);
                if (analysis.answer) {
                    answer = analysis.answer;
                    reason = analysis.reason;
                }
            }

            // ถ้ายังไม่มีคำตอบ และมี AI solver
            if (!answer && aiSolver) {
                // ใช้ AI วิเคราะห์
                answer = await aiSolver(q.question, q.options);
            }

            results.answers.push({
                question: q.question,
                options: q.options,
                answer: answer || 'ต้องตรวจสอบเพิ่มเติม',
                reason: reason,
                confidence: answer ? 0.9 : 0.5
            });
        }

        // สร้างไฟล์เฉลย
        const homeDir = process.env.USERPROFILE || 'C:\\Users\\lgopl';
        const onedriveDesktop = path.join(homeDir, 'OneDrive', 'Desktop');
        const standardDesktop = path.join(homeDir, 'Desktop');
        const targetDesktop = fs.existsSync(onedriveDesktop) ? onedriveDesktop : standardDesktop;

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const fileName = `เฉลย_${timestamp}.html`;
        results.answerSheetPath = path.join(targetDesktop, fileName);

        await generateAnswerSheet(
            results.title || 'แบบทดสอบ',
            results.answers,
            results.answerSheetPath
        );

        // ส่งผลลัพธ์
        if (ctx) {
            let summary = `✅ **วิเคราะห์เสร็จสิ้น!**\n\n`;
            summary += `📊 จำนวน: ${questions.length} ข้อ\n`;
            summary += `📄 ไฟล์เฉลย: บันทึกที่ Desktop แล้ว\n\n`;
            summary += `**สรุปคำตอบ:**\n`;

            results.answers.slice(0, 10).forEach((a, i) => {
                summary += `${i + 1}. ${a.answer}\n`;
            });

            if (results.answers.length > 10) {
                summary += `... และอีก ${results.answers.length - 10} ข้อ\n`;
            }

            summary += `\n⚠️ **หมายเหตุ:** คำตอบนี้เป็นการวิเคราะห์เบื้องต้น กรุณาตรวจสอบอีกครั้ง`;

            await ctx.reply(summary);

            // ส่งไฟล์เฉลย
            if (fs.existsSync(results.answerSheetPath)) {
                await ctx.replyWithDocument({ source: results.answerSheetPath });
            }
        }

        // บันทึก log
        if (logToTerminal) {
            await logToTerminal(userId, 'FORM_SOLVER', `Analyzed ${questions.length} questions`);
        }

        return results;

    } catch (error) {
        console.error('[FORM_SOLVER] Error:', error);
        if (ctx) {
            await ctx.reply(`❌ เกิดข้อผิดพลาด: ${error.message}`);
        }
        throw error;
    } finally {
        if (browser) await browser.close();
    }
}

/**
 * ฟังก์ชันหลักสำหรับ handleFormSolver
 */
async function handleFormSolver(params) {
    const { ctx, data, userId, sendSmartImage, logToTerminal, aiContext } = params;
    const url = data.url;

    if (!url) {
        await ctx.reply('❌ กรุณาระบุ URL ของแบบทดสอบค่ะ');
        return { success: false, error: 'No URL provided' };
    }

    // ตรวจสอบว่าเป็น Google Forms หรือไม่
    if (url.includes('forms.gle') || url.includes('docs.google.com/forms')) {
        return await solveGoogleForm({
            url,
            ctx,
            userId,
            sendSmartImage,
            logToTerminal,
            aiSolver: aiContext
        });
    } else {
        // ฟอร์มอื่นๆ - ใช้วิธีทั่วไป
        await ctx.reply('🔍 กำลังวิเคราะห์ฟอร์มที่ไม่ใช่ Google Forms...');
        // TODO: Implement generic form handling
        return { success: false, error: 'Unsupported form type' };
    }
}

module.exports = {
    handleFormSolver,
    extractGoogleFormQuestions,
    analyzeQuestion,
    generateAnswerSheet,
    solveGoogleForm
};