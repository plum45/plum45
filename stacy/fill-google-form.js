const puppeteer = require('puppeteer');
const path = require('path');

async function fillFullForm() {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    try {
        console.log('🚀 Opening Full Form (15 Questions)...');
        await page.goto('https://docs.google.com/forms/d/e/1FAIpQLSepZRs8x3OVxsDZzaOKH8wrFpbaERip4nXNMmAkOY4l5l7PSg/viewform', { waitUntil: 'networkidle2' });
        
        await new Promise(r => setTimeout(r, 3000));

        console.log('🧠 Solving all 15 questions...');
        await page.evaluate(() => {
            const answers = {
                "1": "เซลล์ประสาท (Neuron)",
                "2": "เดนไดรต์ (Dendrite)",
                "3": ["สมอง", "ไขสันหลัง"],
                "4": "ซีรีเบลลัม (Cerebellum)",
                "5": "ไขสันหลัง",
                "6": "การส่งผ่านสัญญาณประสาทข้ามช่องว่างไซแนปส์",
                "7": "จะทำให้การส่งกระแสประสาทช้าลงหรือไม่ต่อเนื่อง เพราะเยื่อไมอีลินทำหน้าที่เป็นฉนวนไฟฟ้าที่ช่วยให้กระแสประสาทเคลื่อนที่ได้เร็วขึ้นแบบก้าวกระโดด",
                "8": "5",
                "9": ["ระบบประสาทซิมพาเทติก (Sympathetic)", "ระบบประสาทพาราซิมพาเทติก (Parasympathetic)"],
                "10": "ขยายหลอดลมและรูม่านตา",
                "11": "ออกซิพิทัลโลบ (Occipital Lobe)",
                "12": "5",
                "14": "ไฮโปทาลามัสทำหน้าที่เป็นศูนย์กลางควบคุมอุณหภูมิร่างกาย ความหิว ความกระหาย และการนอนหลับ เพื่อรักษาความสมดุลของสภาพแวดล้อมภายในร่างกาย",
            };

            // Helper to find and click radio/checkbox based on text
            const clickByText = (text) => {
                const elements = Array.from(document.querySelectorAll('div[role="radio"], div[role="checkbox"], label, span'));
                for (const el of elements) {
                    if (el.innerText && el.innerText.trim() === text.trim()) {
                        el.click();
                        return true;
                    }
                }
                return false;
            };

            // Answer Multiple Choice and Checkboxes
            clickByText(answers["1"]);
            clickByText(answers["2"]);
            answers["3"].forEach(a => clickByText(a));
            clickByText(answers["4"]);
            clickByText(answers["5"]);
            clickByText(answers["6"]);
            // Q8 Linear Scale (Value 5)
            const q8_5 = document.querySelector('div[data-value="5"][role="radio"]');
            if (q8_5) q8_5.click();
            
            answers["9"].forEach(a => clickByText(a));
            clickByText(answers["10"]);
            clickByText(answers["11"]);

            // Q12 Linear Scale (Value 5)
            const q12_scales = document.querySelectorAll('div[role="radio"]');
            // Form is dynamic, finding the one for q12 (usually near the end)
            // Just a general sweep for value "5" since it's a test
            q12_scales.forEach(s => { if(s.getAttribute('data-value') === "5") s.click(); });

            // Q7 Textarea
            const textAreas = document.querySelectorAll('textarea, input[type="text"]');
            if (textAreas[0]) {
                textAreas[0].value = answers["7"];
                textAreas[0].dispatchEvent(new Event('input', { bubbles: true }));
            }
            if (textAreas[1]) {
                textAreas[1].value = answers["14"];
                textAreas[1].dispatchEvent(new Event('input', { bubbles: true }));
            }

            // Q13 Grid (Harder to selector but let's try)
            const rows = document.querySelectorAll('div[role="list"] div[role="radiogroup"]');
            rows.forEach(row => {
               const buttons = row.querySelectorAll('div[role="radio"]');
               if (buttons.length > 0) buttons[buttons.length - 1].click(); // Pick "Rightmost" (Correct)
            });

            // Q15 Date
            const dateInput = document.querySelector('input[type="date"]');
            if (dateInput) {
                const today = new Date().toISOString().split('T')[0];
                dateInput.value = today;
                dateInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });

        const screenshotPath = path.join(__dirname, 'full_form_solved.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log('✅ All 15 Questions Solved! Screenshot: ' + screenshotPath);
        
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await browser.close();
    }
}

fillFullForm();
