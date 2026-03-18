/**
 * Stacy AI - File Manager Module
 * ฟังก์ชั่นจัดการไฟล์และโฟลเดอร์อัตโนมัติ
 * Version: 2.0.0
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// โฟลเดอร์ที่อนุญาตให้เข้าถึง
const ALLOWED_PATHS = [
    process.env.USERPROFILE || 'C:\\Users\\lgopl',
    'C:\\Users\\lgopl\\Desktop',
    'C:\\Users\\lgopl\\Documents',
    'C:\\Users\\lgopl\\Downloads',
    'C:\\Users\\lgopl\\OneDrive',
];

// โฟลเดอร์ที่ห้ามเข้าถึง
const BLOCKED_PATHS = [
    'C:\\Windows',
    'C:\\Program Files',
    'C:\\Program Files (x86)',
    'C:\\System32',
];

/**
 * ตรวจสอบว่า path อนุญาตให้เข้าถึงหรือไม่
 */
function isPathAllowed(targetPath) {
    const normalized = path.normalize(targetPath);

    // ตรวจสอบ path ที่ห้าม
    for (const blocked of BLOCKED_PATHS) {
        if (normalized.toLowerCase().startsWith(blocked.toLowerCase())) {
            return { allowed: false, reason: 'Path นี้อยู่ในพื้นที่ระบบที่ห้ามเข้าถึง' };
        }
    }

    // ตรวจสอบ path ที่อนุญาต
    for (const allowed of ALLOWED_PATHS) {
        if (normalized.toLowerCase().startsWith(allowed.toLowerCase())) {
            return { allowed: true };
        }
    }

    return { allowed: false, reason: 'Path นี้ไม่อยู่ในรายการที่อนุญาต' };
}

/**
 * อ่านไฟล์
 */
async function readFile(filePath, options = {}) {
    const { encoding = 'utf8', startLine = 0, endLine = -1 } = options;

    const check = isPathAllowed(filePath);
    if (!check.allowed) {
        throw new Error(check.reason);
    }

    if (!fs.existsSync(filePath)) {
        throw new Error(`ไฟล์ไม่พบ: ${filePath}`);
    }

    try {
        if (endLine === -1) {
            return {
                success: true,
                content: fs.readFileSync(filePath, encoding),
                path: filePath,
                size: fs.statSync(filePath).size
            };
        }

        // อ่านเฉพาะบรรทัดที่กำหนด
        const lines = fs.readFileSync(filePath, encoding).split('\n');
        const selectedLines = lines.slice(startLine, endLine === -1 ? undefined : endLine + 1);
        return {
            success: true,
            content: selectedLines.join('\n'),
            path: filePath,
            totalLines: lines.length,
            selectedLines: `${startLine}-${endLine === -1 ? lines.length - 1 : endLine}`
        };

    } catch (error) {
        throw new Error(`อ่านไฟล์ไม่สำเร็จ: ${error.message}`);
    }
}

/**
 * เขียนไฟล์
 */
async function writeFile(filePath, content, options = {}) {
    const { encoding = 'utf8', append = false } = options;

    const check = isPathAllowed(filePath);
    if (!check.allowed) {
        throw new Error(check.reason);
    }

    try {
        // สร้างโฟลเดอร์ถ้ายังไม่มี
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        if (append) {
            fs.appendFileSync(filePath, content, encoding);
        } else {
            fs.writeFileSync(filePath, content, encoding);
        }

        return {
            success: true,
            path: filePath,
            size: fs.statSync(filePath).size,
            action: append ? 'append' : 'write'
        };

    } catch (error) {
        throw new Error(`เขียนไฟล์ไม่สำเร็จ: ${error.message}`);
    }
}

/**
 * ลบไฟล์
 */
async function deleteFile(filePath) {
    const check = isPathAllowed(filePath);
    if (!check.allowed) {
        throw new Error(check.reason);
    }

    if (!fs.existsSync(filePath)) {
        throw new Error(`ไฟล์ไม่พบ: ${filePath}`);
    }

    try {
        fs.unlinkSync(filePath);
        return { success: true, path: filePath, action: 'delete' };
    } catch (error) {
        throw new Error(`ลบไฟล์ไม่สำเร็จ: ${error.message}`);
    }
}

/**
 * สร้างโฟลเดอร์
 */
async function createFolder(folderPath) {
    const check = isPathAllowed(folderPath);
    if (!check.allowed) {
        throw new Error(check.reason);
    }

    try {
        fs.mkdirSync(folderPath, { recursive: true });
        return { success: true, path: folderPath, action: 'create_folder' };
    } catch (error) {
        throw new Error(`สร้างโฟลเดอร์ไม่สำเร็จ: ${error.message}`);
    }
}

/**
 * ลบโฟลเดอร์
 */
async function deleteFolder(folderPath, force = false) {
    const check = isPathAllowed(folderPath);
    if (!check.allowed) {
        throw new Error(check.reason);
    }

    if (!fs.existsSync(folderPath)) {
        throw new Error(`โฟลเดอร์ไม่พบ: ${folderPath}`);
    }

    try {
        if (force) {
            fs.rmSync(folderPath, { recursive: true, force: true });
        } else {
            fs.rmdirSync(folderPath);
        }
        return { success: true, path: folderPath, action: 'delete_folder' };
    } catch (error) {
        throw new Error(`ลบโฟลเดอร์ไม่สำเร็จ: ${error.message}`);
    }
}

/**
 * ลิสต์ไฟล์ในโฟลเดอร์
 */
async function listFiles(folderPath, options = {}) {
    const { pattern = '*', recursive = false, includeHidden = false } = options;

    const check = isPathAllowed(folderPath);
    if (!check.allowed) {
        throw new Error(check.reason);
    }

    if (!fs.existsSync(folderPath)) {
        throw new Error(`โฟลเดอร์ไม่พบ: ${folderPath}`);
    }

    try {
        const results = [];
        const items = fs.readdirSync(folderPath, { withFileTypes: true });

        for (const item of items) {
            if (!includeHidden && item.name.startsWith('.')) continue;

            const itemPath = path.join(folderPath, item.name);
            const stats = fs.statSync(itemPath);

            results.push({
                name: item.name,
                path: itemPath,
                type: item.isDirectory() ? 'folder' : 'file',
                size: stats.size,
                modified: stats.mtime,
                created: stats.birthtime
            });

            // Recursive ถ้าต้องการ
            if (recursive && item.isDirectory()) {
                const subItems = await listFiles(itemPath, options);
                results.push(...subItems);
            }
        }

        // กรองตาม pattern
        if (pattern !== '*') {
            const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
            return results.filter(item => regex.test(item.name));
        }

        return results;

    } catch (error) {
        throw new Error(`อ่านโฟลเดอร์ไม่สำเร็จ: ${error.message}`);
    }
}

/**
 * คัดลอกไฟล์
 */
async function copyFile(source, destination) {
    const checkSource = isPathAllowed(source);
    if (!checkSource.allowed) {
        throw new Error(`Source: ${checkSource.reason}`);
    }

    const checkDest = isPathAllowed(destination);
    if (!checkDest.allowed) {
        throw new Error(`Destination: ${checkDest.reason}`);
    }

    if (!fs.existsSync(source)) {
        throw new Error(`ไฟล์ต้นทางไม่พบ: ${source}`);
    }

    try {
        // สร้างโฟลเดอร์ปลายทางถ้ายังไม่มี
        const dir = path.dirname(destination);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.copyFileSync(source, destination);
        return {
            success: true,
            source,
            destination,
            action: 'copy'
        };
    } catch (error) {
        throw new Error(`คัดลอกไฟล์ไม่สำเร็จ: ${error.message}`);
    }
}

/**
 * ย้ายไฟล์
 */
async function moveFile(source, destination) {
    const result = await copyFile(source, destination);
    await deleteFile(source);
    return {
        ...result,
        action: 'move'
    };
}

/**
 * สร้างไฟล์ HTML
 */
async function createHTMLFile(filePath, content, options = {}) {
    const { title = 'Document', style = '' } = options;

    const htmlContent = `<!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        * { box-sizing: border-box; font-family: 'Sarabun', 'Segoe UI', sans-serif; }
        body { margin: 20px; line-height: 1.6; }
        ${style}
    </style>
</head>
<body>
    ${content}
</body>
</html>`;

    return await writeFile(filePath, htmlContent, 'utf8');
}

/**
 * สร้างไฟล์ Markdown
 */
async function createMarkdownFile(filePath, content, options = {}) {
    const { frontMatter = {} } = options;

    let markdown = '';

    // เพิ่ม front matter ถ้ามี
    if (Object.keys(frontMatter).length > 0) {
        markdown = '---\n';
        for (const [key, value] of Object.entries(frontMatter)) {
            markdown += `${key}: ${value}\n`;
        }
        markdown += '---\n\n';
    }

    markdown += content;

    return await writeFile(filePath, markdown, 'utf8');
}

/**
 * สร้างไฟล์ JSON
 */
async function createJSONFile(filePath, data, options = {}) {
    const { pretty = true } = options;
    const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
    return await writeFile(filePath, content, 'utf8');
}

/**
 * ค้นหาไฟล์ในโฟลเดอร์
 */
async function searchFiles(folderPath, searchTerm, options = {}) {
    const { caseSensitive = false, searchInContent = false } = options;

    const check = isPathAllowed(folderPath);
    if (!check.allowed) {
        throw new Error(check.reason);
    }

    const files = await listFiles(folderPath, { recursive: true });
    const results = [];

    for (const file of files) {
        if (file.type !== 'file') continue;

        // ค้นหาในชื่อไฟล์
        const nameToSearch = caseSensitive ? file.name : file.name.toLowerCase();
        const termToSearch = caseSensitive ? searchTerm : searchTerm.toLowerCase();

        if (nameToSearch.includes(termToSearch)) {
            results.push({
                ...file,
                matchType: 'filename'
            });
            continue;
        }

        // ค้นหาในเนื้อหาถ้าต้องการ
        if (searchInContent) {
            try {
                const content = fs.readFileSync(file.path, 'utf8');
                const contentToSearch = caseSensitive ? content : content.toLowerCase();

                if (contentToSearch.includes(termToSearch)) {
                    results.push({
                        ...file,
                        matchType: 'content',
                        context: extractContext(content, searchTerm, 50)
                    });
                }
            } catch (e) {
                // Skip files that can't be read
            }
        }
    }

    return results;
}

/**
 * ดึงบริบทรอบคำค้นหา
 */
function extractContext(content, term, padding = 50) {
    const index = content.toLowerCase().indexOf(term.toLowerCase());
    if (index === -1) return null;

    const start = Math.max(0, index - padding);
    const end = Math.min(content.length, index + term.length + padding);

    return {
        before: content.substring(start, index),
        match: content.substring(index, index + term.length),
        after: content.substring(index + term.length, end)
    };
}

/**
 * Handle File Manager request
 */
async function handleFileManager(params) {
    const { ctx, data, userId, logToTerminal } = params;
    const action = data.action;

    try {
        let result;

        switch (action) {
            case 'read':
                result = await readFile(data.path, data.options);
                if (ctx) {
                    await ctx.reply(`📄 **อ่านไฟล์สำเร็จ:**\n📍 ${data.path}\n📏 ขนาด: ${result.size} bytes\n\n\`\`\`\n${result.content.substring(0, 2000)}${result.content.length > 2000 ? '...' : ''}\n\`\`\``);
                }
                break;

            case 'write':
                result = await writeFile(data.path, data.content, data.options);
                if (ctx) {
                    await ctx.reply(`✅ **เขียนไฟล์สำเร็จ:**\n📍 ${result.path}\n📏 ขนาด: ${result.size} bytes`);
                }
                break;

            case 'delete':
                result = await deleteFile(data.path);
                if (ctx) {
                    await ctx.reply(`🗑️ **ลบไฟล์สำเร็จ:**\n📍 ${result.path}`);
                }
                break;

            case 'createFolder':
                result = await createFolder(data.path);
                if (ctx) {
                    await ctx.reply(`📁 **สร้างโฟลเดอร์สำเร็จ:**\n📍 ${result.path}`);
                }
                break;

            case 'deleteFolder':
                result = await deleteFolder(data.path, data.force);
                if (ctx) {
                    await ctx.reply(`🗑️ **ลบโฟลเดอร์สำเร็จ:**\n📍 ${result.path}`);
                }
                break;

            case 'list':
                result = await listFiles(data.path, data.options);
                if (ctx) {
                    const summary = result.slice(0, 20).map(item =>
                        `${item.type === 'folder' ? '📁' : '📄'} ${item.name}`
                    ).join('\n');
                    await ctx.reply(`📂 **รายการในโฟลเดอร์:**\n📍 ${data.path}\n\n${summary}${result.length > 20 ? `\n... และอีก ${result.length - 20} รายการ` : ''}`);
                }
                break;

            case 'copy':
                result = await copyFile(data.source, data.destination);
                if (ctx) {
                    await ctx.reply(`📋 **คัดลอกไฟล์สำเร็จ:**\n📍 ${data.source} → ${data.destination}`);
                }
                break;

            case 'move':
                result = await moveFile(data.source, data.destination);
                if (ctx) {
                    await ctx.reply(`📦 **ย้ายไฟล์สำเร็จ:**\n📍 ${data.source} → ${data.destination}`);
                }
                break;

            case 'createHTML':
                result = await createHTMLFile(data.path, data.content, data.options);
                if (ctx) {
                    await ctx.reply(`🌐 **สร้างไฟล์ HTML สำเร็จ:**\n📍 ${result.path}`);
                }
                break;

            case 'createMarkdown':
                result = await createMarkdownFile(data.path, data.content, data.options);
                if (ctx) {
                    await ctx.reply(`📝 **สร้างไฟล์ Markdown สำเร็จ:**\n📍 ${result.path}`);
                }
                break;

            case 'createJSON':
                result = await createJSONFile(data.path, data.data, data.options);
                if (ctx) {
                    await ctx.reply(`📊 **สร้างไฟล์ JSON สำเร็จ:**\n📍 ${result.path}`);
                }
                break;

            case 'search':
                result = await searchFiles(data.path, data.searchTerm, data.options);
                if (ctx) {
                    const summary = result.slice(0, 10).map(item =>
                        `${item.type === 'folder' ? '📁' : '📄'} ${item.name} (${item.matchType})`
                    ).join('\n');
                    await ctx.reply(`🔍 **ผลการค้นหา "${data.searchTerm}":**\n\n${summary}${result.length > 10 ? `\n... และอีก ${result.length - 10} รายการ` : ''}`);
                }
                break;

            default:
                throw new Error(`Unknown action: ${action}`);
        }

        if (logToTerminal) {
            await logToTerminal(userId, `FILE_${action.toUpperCase()}`, JSON.stringify(result));
        }

        return result;

    } catch (error) {
        console.error('[FILE_MANAGER] Error:', error);
        if (ctx) {
            await ctx.reply(`❌ **ข้อผิดพลาด:** ${error.message}`);
        }
        throw error;
    }
}

module.exports = {
    handleFileManager,
    readFile,
    writeFile,
    deleteFile,
    createFolder,
    deleteFolder,
    listFiles,
    copyFile,
    moveFile,
    createHTMLFile,
    createMarkdownFile,
    createJSONFile,
    searchFiles,
    isPathAllowed
};