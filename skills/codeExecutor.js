/**
 * Stacy AI - Code Executor Module
 * ฟังก์ชั่นรันโค้ด Python และ JavaScript อัตโนมัติ
 * Version: 2.0.0
 */

const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// โฟลเดอร์สำหรับเก็บสคริปต์ชั่วคราว
const TEMP_DIR = path.join(os.tmpdir(), 'stacy_scripts');

// สร้างโฟลเดอร์ถ้ายังไม่มี
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * รันโค้ด Python
 */
async function runPython(code, options = {}) {
    const {
        timeout = 60000,
        pythonPath = 'python',
        args = [],
        env = {}
    } = options;

    return new Promise((resolve, reject) => {
        // สร้างไฟล์สคริปต์ชั่วคราว
        const scriptPath = path.join(TEMP_DIR, `script_${Date.now()}.py`);
        fs.writeFileSync(scriptPath, code, 'utf8');

        const allArgs = [scriptPath, ...args];
        const processEnv = { ...process.env, ...env };

        const proc = spawn(pythonPath, allArgs, {
            timeout,
            env: processEnv,
            shell: true
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            // ลบไฟล์สคริปต์
            try {
                fs.unlinkSync(scriptPath);
            } catch (e) {
                // Ignore cleanup errors
            }

            resolve({
                success: code === 0,
                code,
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                executionTime: Date.now() - proc.startTime
            });
        });

        proc.on('error', (err) => {
            try {
                fs.unlinkSync(scriptPath);
            } catch (e) {}
            reject(err);
        });

        proc.startTime = Date.now();
    });
}

/**
 * รันโค้ด JavaScript (Node.js)
 */
async function runJavaScript(code, options = {}) {
    const {
        timeout = 30000,
        nodePath = 'node',
        args = [],
        env = {}
    } = options;

    return new Promise((resolve, reject) => {
        // สร้างไฟล์สคริปต์ชั่วคราว
        const scriptPath = path.join(TEMP_DIR, `script_${Date.now()}.js`);
        fs.writeFileSync(scriptPath, code, 'utf8');

        const allArgs = [scriptPath, ...args];
        const processEnv = { ...process.env, ...env };

        const proc = spawn(nodePath, allArgs, {
            timeout,
            env: processEnv,
            shell: true
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            // ลบไฟล์สคริปต์
            try {
                fs.unlinkSync(scriptPath);
            } catch (e) {}

            resolve({
                success: code === 0,
                code,
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                executionTime: Date.now() - proc.startTime
            });
        });

        proc.on('error', (err) => {
            try {
                fs.unlinkSync(scriptPath);
            } catch (e) {}
            reject(err);
        });

        proc.startTime = Date.now();
    });
}

/**
 * รันโค้ดตามภาษาที่ระบุ
 */
async function runCode(code, language = 'python', options = {}) {
    switch (language.toLowerCase()) {
        case 'python':
        case 'py':
            return await runPython(code, options);
        case 'javascript':
        case 'js':
        case 'node':
        case 'nodejs':
            return await runJavaScript(code, options);
        default:
            throw new Error(`Unsupported language: ${language}`);
    }
}

/**
 * ติดตั้ง Python package
 */
async function installPythonPackage(packageName, options = {}) {
    const { pipPath = 'pip', upgrade = false } = options;

    return new Promise((resolve, reject) => {
        const args = ['install', packageName];
        if (upgrade) args.push('--upgrade');

        const proc = spawn(pipPath, args, { shell: true });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            resolve({
                success: code === 0,
                code,
                stdout: stdout.trim(),
                stderr: stderr.trim()
            });
        });

        proc.on('error', reject);
    });
}

/**
 * ติดตั้ง Node.js package
 */
async function installNodePackage(packageName, options = {}) {
    const { npmPath = 'npm', save = true, dev = false } = options;

    return new Promise((resolve, reject) => {
        const args = ['install', packageName];
        if (dev) args.push('--save-dev');
        else if (save) args.push('--save');

        const proc = spawn(npmPath, args, { shell: true });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            resolve({
                success: code === 0,
                code,
                stdout: stdout.trim(),
                stderr: stderr.trim()
            });
        });

        proc.on('error', reject);
    });
}

/**
 * รันโค้ดและส่งผลลัพธ์แบบ real-time
 */
async function runCodeWithCallback(code, language, options = {}, callback) {
    const {
        timeout = 60000,
        onStdout = null,
        onStderr = null
    } = options;

    const scriptPath = path.join(TEMP_DIR, `script_${Date.now()}.${language === 'python' ? 'py' : 'js'}`);
    fs.writeFileSync(scriptPath, code, 'utf8');

    const runner = language === 'python' ? 'python' : 'node';
    const proc = spawn(runner, [scriptPath], { shell: true });

    if (onStdout) {
        proc.stdout.on('data', (data) => {
            onStdout(data.toString());
            if (callback) callback('stdout', data.toString());
        });
    }

    if (onStderr) {
        proc.stderr.on('data', (data) => {
            onStderr(data.toString());
            if (callback) callback('stderr', data.toString());
        });
    }

    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            proc.kill();
            reject(new Error('Timeout'));
        }, timeout);

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            clearTimeout(timeoutId);
            try {
                fs.unlinkSync(scriptPath);
            } catch (e) {}

            resolve({
                success: code === 0,
                code,
                stdout: stdout.trim(),
                stderr: stderr.trim()
            });
        });

        proc.on('error', (err) => {
            clearTimeout(timeoutId);
            try {
                fs.unlinkSync(scriptPath);
            } catch (e) {}
            reject(err);
        });
    });
}

/**
 * ตรวจสอบว่าติดตั้ง Python แล้วหรือไม่
 */
async function checkPythonInstallation() {
    return new Promise((resolve) => {
        exec('python --version', (error, stdout, stderr) => {
            if (error) {
                resolve({
                    installed: false,
                    version: null,
                    message: 'Python not installed'
                });
            } else {
                const version = stdout.trim() || stderr.trim();
                resolve({
                    installed: true,
                    version,
                    message: `Python installed: ${version}`
                });
            }
        });
    });
}

/**
 * ตรวจสอบว่าติดตั้ง Node.js แล้วหรือไม่
 */
async function checkNodeInstallation() {
    return new Promise((resolve) => {
        exec('node --version', (error, stdout, stderr) => {
            if (error) {
                resolve({
                    installed: false,
                    version: null,
                    message: 'Node.js not installed'
                });
            } else {
                const version = stdout.trim();
                resolve({
                    installed: true,
                    version,
                    message: `Node.js installed: ${version}`
                });
            }
        });
    });
}

/**
 * Handle Code Executor request
 */
async function handleCodeExecutor(params) {
    const { ctx, data, userId, logToTerminal } = params;

    try {
        const action = data.action || 'run';
        let result;

        switch (action) {
            case 'run':
                const language = data.language || 'python';
                const code = data.code;

                if (!code) {
                    throw new Error('ต้องระบุโค้ดที่จะรัน');
                }

                if (ctx) {
                    await ctx.reply(`💻 **กำลังรันโค้ด ${language.toUpperCase()}...**\n\`\`\`${language}\n${code.substring(0, 500)}${code.length > 500 ? '...' : ''}\n\`\`\``);
                }

                result = await runCode(code, language, data.options || {});

                if (ctx) {
                    if (result.success) {
                        await ctx.reply(`✅ **รันโค้ดสำเร็จ!**\n\n**Output:**\n\`\`\`\n${result.stdout.substring(0, 3000)}${result.stdout.length > 3000 ? '...' : ''}\n\`\`\``);
                    } else {
                        await ctx.reply(`❌ **รันโค้ดไม่สำเร็จ**\n\n**Error:**\n\`\`\`\n${result.stderr.substring(0, 2000)}\n\`\`\``);
                    }
                }
                break;

            case 'install':
                const pkgName = data.package;
                const pkgLanguage = data.language || 'python';

                if (!pkgName) {
                    throw new Error('ต้องระบุชื่อ package');
                }

                if (ctx) {
                    await ctx.reply(`📦 **กำลังติดตั้ง ${pkgName}...**`);
                }

                if (pkgLanguage === 'python' || pkgLanguage === 'pip') {
                    result = await installPythonPackage(pkgName, data.options || {});
                } else {
                    result = await installNodePackage(pkgName, data.options || {});
                }

                if (ctx) {
                    if (result.success) {
                        await ctx.reply(`✅ **ติดตั้ง ${pkgName} สำเร็จ!**`);
                    } else {
                        await ctx.reply(`❌ **ติดตั้งไม่สำเร็จ:**\n${result.stderr}`);
                    }
                }
                break;

            case 'check':
                const pythonStatus = await checkPythonInstallation();
                const nodeStatus = await checkNodeInstallation();

                result = {
                    python: pythonStatus,
                    nodejs: nodeStatus
                };

                if (ctx) {
                    await ctx.reply(`🔍 **สถานะระบบ:**\n\n🐍 ${pythonStatus.message}\n🟢 ${nodeStatus.message}`);
                }
                break;

            default:
                throw new Error(`Unknown action: ${action}`);
        }

        if (logToTerminal) {
            await logToTerminal(userId, `CODE_${action.toUpperCase()}`, JSON.stringify(result));
        }

        return result;

    } catch (error) {
        console.error('[CODE_EXECUTOR] Error:', error);
        if (ctx) {
            await ctx.reply(`❌ **ข้อผิดพลาด:** ${error.message}`);
        }
        throw error;
    }
}

module.exports = {
    handleCodeExecutor,
    runCode,
    runPython,
    runJavaScript,
    installPythonPackage,
    installNodePackage,
    runCodeWithCallback,
    checkPythonInstallation,
    checkNodeInstallation
};