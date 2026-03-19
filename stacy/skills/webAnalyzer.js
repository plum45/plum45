/**
 * Stacy AI - Web Analyzer Module
 * ฟังก์ชั่นวิเคราะห์เว็บไซต์และดึงข้อมูลอัตโนมัติ
 * Version: 2.0.0
 */

const puppeteer = require('puppeteer');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');

/**
 * ดึงข้อมูลจากเว็บไซต์แบบละเอียด
 * @param {string} url - URL ที่ต้องการวิเคราะห์
 * @param {Object} options - ตัวเลือกเพิ่มเติม
 * @returns {Object} - ข้อมูลที่ดึงมา
 */
async function fetchWebsiteData(url, options = {}) {
    const {
        waitFor = 'networkidle2',
        timeout = 30000,
        screenshot = false,
        extractLinks = false,
        extractImages = false,
        extractText = true,
        extractTables = false
    } = options;

    let browser = null;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        console.log(`[WEB_FETCH] Navigating to: ${url}`);
        await page.goto(url, { waitUntil: waitFor, timeout });

        const result = {
            url: url,
            title: await page.title(),
            timestamp: new Date().toISOString()
        };

        // ดึงข้อความ
        if (extractText) {
            result.text = await page.evaluate(() => {
                // ลบ script และ style tags
                const clone = document.body.cloneNode(true);
                clone.querySelectorAll('script, style, noscript').forEach(el => el.remove());
                return clone.innerText.trim();
            });
        }

        // ดึงลิงก์
        if (extractLinks) {
            result.links = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('a[href]')).map(a => ({
                    text: a.innerText.trim(),
                    href: a.href
                })).filter(l => l.href && !l.href.startsWith('javascript:'));
            });
        }

        // ดึงรูปภาพ
        if (extractImages) {
            result.images = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('img[src]')).map(img => ({
                    alt: img.alt || '',
                    src: img.src,
                    width: img.width,
                    height: img.height
                })).filter(i => i.src);
            });
        }

        // ดึงตาราง
        if (extractTables) {
            result.tables = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('table')).map(table => {
                    const rows = Array.from(table.querySelectorAll('tr'));
                    return rows.map(row =>
                        Array.from(row.querySelectorAll('td, th')).map(cell => cell.innerText.trim())
                    );
                });
            });
        }

        // ถ่ายภาพหน้าจอ
        if (screenshot) {
            const screenshotPath = path.join(process.cwd(), `web_capture_${Date.now()}.png`);
            await page.screenshot({ path: screenshotPath, fullPage: true });
            result.screenshotPath = screenshotPath;
        }

        return result;

    } catch (error) {
        console.error('[WEB_FETCH] Error:', error.message);
        throw error;
    } finally {
        if (browser) await browser.close();
    }
}

/**
 * ค้นหาข้อมูลบนเว็บแบบหลายแหล่ง
 * @param {string} query - คำค้นหา
 * @param {Object} options - ตัวเลือก
 * @returns {Object} - ผลการค้นหา
 */
async function multiSourceSearch(query, options = {}) {
    const { maxResults = 5, includeContent = true } = options;

    const results = {
        query,
        sources: [],
        summary: ''
    };

    try {
        // ใช้ googlethis สำหรับค้นหา
        const google = require('googlethis');
        const searchResults = await google.search(query, { safe: true });

        if (searchResults.results && searchResults.results.length > 0) {
            for (let i = 0; i < Math.min(maxResults, searchResults.results.length); i++) {
                const result = searchResults.results[i];
                const source = {
                    title: result.title,
                    url: result.url,
                    description: result.description
                };

                // ดึงเนื้อหาถ้าต้องการ
                if (includeContent && result.url) {
                    try {
                        const response = await axios.get(result.url, { timeout: 10000 });
                        const $ = cheerio.load(response.data);
                        source.content = $('article, main, .content, #content').text().substring(0, 2000) ||
                                        $('body').text().substring(0, 2000);
                    } catch (e) {
                        source.content = 'ไม่สามารถดึงเนื้อหาได้';
                    }
                }

                results.sources.push(source);
            }
        }

        // สรุปผลการค้นหา
        results.summary = results.sources.map((s, i) =>
            `${i + 1}. **${s.title}**\n   ${s.description}\n   🔗 ${s.url}`
        ).join('\n\n');

        return results;

    } catch (error) {
        console.error('[SEARCH] Error:', error.message);
        throw error;
    }
}

/**
 * วิเคราะห์หน้าเว็บและดึงข้อมูลเฉพาะ
 * @param {string} url - URL ที่ต้องการวิเคราะห์
 * @param {Object} selectors - CSS selectors ที่ต้องการดึง
 * @returns {Object} - ข้อมูลที่ดึงมา
 */
async function extractPageContent(url, selectors = {}) {
    let browser = null;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        const result = { url, extracted: {} };

        // ดึงข้อมูลตาม selectors
        for (const [name, selector] of Object.entries(selectors)) {
            const elements = await page.$$(selector);
            result.extracted[name] = await Promise.all(
                elements.map(el => el.evaluate(node => ({
                    text: node.innerText,
                    html: node.innerHTML,
                    attributes: Object.fromEntries(
                        Array.from(node.attributes || []).map(a => [a.name, a.value])
                    )
                })))
            );
        }

        return result;

    } catch (error) {
        console.error('[EXTRACT] Error:', error.message);
        throw error;
    } finally {
        if (browser) await browser.close();
    }
}

/**
 * กรอกแบบฟอร์มบนเว็บอัตโนมัติ
 * @param {string} url - URL ของฟอร์ม
 * @param {Object} formData - ข้อมูลที่จะกรอก
 * @param {Object} options - ตัวเลือกเพิ่มเติม
 * @returns {Object} - ผลลัพธ์
 */
async function fillWebForm(url, formData, options = {}) {
    const {
        submitForm = false,
        screenshotSteps = false,
        waitForSelector = null
    } = options;

    let browser = null;
    const steps = [];

    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        // เปิดหน้าฟอร์ม
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        steps.push({ action: 'navigate', url });

        // รอให้ฟอร์มโหลด
        if (waitForSelector) {
            await page.waitForSelector(waitForSelector, { timeout: 10000 });
        }

        // กรอกข้อมูลแต่ละฟิลด์
        for (const [selector, value] of Object.entries(formData)) {
            try {
                await page.waitForSelector(selector, { timeout: 5000 });

                // ตรวจสอบประเภท input
                const inputType = await page.evaluate((sel) => {
                    const el = document.querySelector(sel);
                    if (!el) return 'unknown';
                    if (el.type === 'radio' || el.type === 'checkbox') return 'choice';
                    if (el.tagName === 'SELECT') return 'select';
                    if (el.tagName === 'TEXTAREA') return 'textarea';
                    return 'text';
                }, selector);

                if (inputType === 'choice') {
                    // Radio หรือ Checkbox
                    await page.click(`${selector}[value="${value}"]`);
                } else if (inputType === 'select') {
                    // Dropdown
                    await page.select(selector, value);
                } else {
                    // Text input หรือ textarea
                    await page.type(selector, value, { delay: 50 });
                }

                steps.push({ action: 'fill', selector, value, success: true });

                if (screenshotSteps) {
                    const screenshotPath = path.join(process.cwd(), `form_step_${steps.length}.png`);
                    await page.screenshot({ path: screenshotPath });
                }
            } catch (e) {
                steps.push({ action: 'fill', selector, value, success: false, error: e.message });
            }
        }

        // ถ่ายภาพสุดท้าย
        const finalScreenshot = path.join(process.cwd(), `form_final_${Date.now()}.png`);
        await page.screenshot({ path: finalScreenshot, fullPage: true });

        // ส่งฟอร์มถ้าต้องการ
        if (submitForm) {
            // หาปุ่ม submit
            const submitButton = await page.$('button[type="submit"], input[type="submit"], .submit, #submit');
            if (submitButton) {
                await submitButton.click();
                await page.waitForNavigation({ timeout: 30000 }).catch(() => {});
            }
        }

        return {
            success: true,
            steps,
            screenshot: finalScreenshot,
            finalUrl: page.url()
        };

    } catch (error) {
        console.error('[FORM_FILL] Error:', error.message);
        return {
            success: false,
            error: error.message,
            steps
        };
    } finally {
        if (browser) await browser.close();
    }
}

/**
 * ดาวน์โหลดไฟล์จากเว็บ
 * @param {string} url - URL ของไฟล์
 * @param {string} savePath - ที่อยู่ที่จะบันทึก
 * @returns {Object} - ผลลัพธ์
 */
async function downloadFile(url, savePath) {
    try {
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'stream'
        });

        // สร้างโฟลเดอร์ถ้ายังไม่มี
        const dir = path.dirname(savePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const writer = fs.createWriteStream(savePath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve({ success: true, path: savePath }));
            writer.on('error', reject);
        });

    } catch (error) {
        console.error('[DOWNLOAD] Error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * ตรวจสอบสถานะเว็บไซต์
 * @param {string} url - URL ที่ต้องการตรวจสอบ
 * @returns {Object} - สถานะ
 */
async function checkWebsiteStatus(url) {
    try {
        const start = Date.now();
        const response = await axios.head(url, { timeout: 10000 });
        const latency = Date.now() - start;

        return {
            url,
            status: response.status,
            statusText: response.statusText,
            latency: `${latency}ms`,
            headers: response.headers,
            online: true
        };
    } catch (error) {
        return {
            url,
            status: 'error',
            statusText: error.message,
            online: false
        };
    }
}

/**
 * Handle Web Analyzer request
 */
async function handleWebAnalyzer(params) {
    const { ctx, data, userId, logToTerminal } = params;

    try {
        const action = data.action || 'fetch';
        const url = data.url;

        switch (action) {
            case 'fetch':
                const fetchResult = await fetchWebsiteData(url, data.options || {});
                if (ctx) {
                    await ctx.reply(`🌐 **ดึงข้อมูลจาก:** ${url}\n\n**หัวข้อ:** ${fetchResult.title}\n**เนื้อหาสุดสั้น:** ${fetchResult.text?.substring(0, 500)}...`);
                }
                return fetchResult;

            case 'search':
                const searchResult = await multiSourceSearch(data.query, data.options || {});
                if (ctx) {
                    await ctx.reply(`🔍 **ผลการค้นหา:** ${data.query}\n\n${searchResult.summary.substring(0, 3000)}`);
                }
                return searchResult;

            case 'extract':
                const extractResult = await extractPageContent(url, data.selectors || {});
                if (ctx) {
                    await ctx.reply(`📊 **ดึงข้อมูลสำเร็จ:** ${url}\n\nข้อมูลที่ดึงมา: ${JSON.stringify(extractResult.extracted, null, 2).substring(0, 2000)}`);
                }
                return extractResult;

            case 'fill':
                const fillResult = await fillWebForm(url, data.formData || {}, data.options || {});
                if (ctx) {
                    if (fillResult.success) {
                        await ctx.reply(`✅ **กรอกฟอร์มสำเร็จ**\nขั้นตอนที่ทำ: ${fillResult.steps.length} ขั้นตอน`);
                    } else {
                        await ctx.reply(`❌ **กรอกฟอร์มไม่สำเร็จ:** ${fillResult.error}`);
                    }
                }
                return fillResult;

            case 'status':
                const statusResult = await checkWebsiteStatus(url);
                if (ctx) {
                    await ctx.reply(`📡 **สถานะเว็บไซต์:**\nURL: ${url}\nStatus: ${statusResult.status}\nLatency: ${statusResult.latency || 'N/A'}\nOnline: ${statusResult.online ? '✅' : '❌'}`);
                }
                return statusResult;

            default:
                throw new Error(`Unknown action: ${action}`);
        }

    } catch (error) {
        console.error('[WEB_ANALYZER] Error:', error);
        if (ctx) {
            await ctx.reply(`❌ เกิดข้อผิดพลาด: ${error.message}`);
        }
        throw error;
    }
}

module.exports = {
    handleWebAnalyzer,
    fetchWebsiteData,
    multiSourceSearch,
    extractPageContent,
    fillWebForm,
    downloadFile,
    checkWebsiteStatus
};