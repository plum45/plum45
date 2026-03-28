/**
 * bridge.js — Cloud ↔ Local PC Bridge (Firestore Real-Time Listener)
 * 
 * This module enables the "Hybrid Mode" for Stacy AI:
 * - When running on CLOUD (Render): Use `sendCommandToPC()` to queue commands.
 * - When running on LOCAL PC (Relay): Use `startRelayListener()` to execute queued commands.
 * 
 * Commands flow through Firestore collection: `pc_commands`
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Actions that MUST run on the local PC (not on Cloud)
const LOCAL_ONLY_ACTIONS = [
    'SCREEN_CAPTURE',
    'GET_PC_STATS',
    'SYSTEM_CONTROL',
    'RUN_COMMAND',
    'EXEC_COMMAND',
    'SAVE_FILE_LOCAL',
    'YOUTUBE_OPEN',
    'YOUTUBE_CONTROL',
    'YOUTUBE_LIST_TABS',
    'BROWSER_INTERACT',
    'CANVA_CONTROL'
];

/**
 * Check if an action requires the local PC
 */
function isLocalAction(actionType) {
    return LOCAL_ONLY_ACTIONS.includes(actionType);
}

/**
 * CLOUD SIDE: Send a command to the local PC via Firestore
 */
async function sendCommandToPC(db, userId, actionType, actionData, chatId) {
    if (!db) throw new Error('Firebase ไม่ได้เชื่อมต่อค่ะ กรุณาเช็คค่า FIREBASE_SERVICE_ACCOUNT ใน Render นะคะ');

    try {
        const commandRef = await db.collection('pc_commands').add({
            userId: String(userId),
            chatId: chatId,
            action: actionType,
            data: actionData || {},
            status: 'pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            result: null,
            error: null
        });

        console.log(`📡 [Bridge] Command queued for PC: ${actionType} (ID: ${commandRef.id})`);
        return commandRef.id;
    } catch (err) {
        console.error('[Bridge] Error queuing command:', err.message);
        throw err;
    }
}

/**
 * CLOUD SIDE: Wait for a command result (Optional, used if the Cloud bot needs the result to continue)
 */
async function waitForCommandResult(db, commandId, timeoutMs = 45000) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            unsubscribe();
            resolve({ status: 'timeout', result: 'คำสั่งหมดเวลาค่ะ (PC อาจจะไม่ได้เปิดอยู่)' });
        }, timeoutMs);

        const unsubscribe = db.collection('pc_commands').doc(commandId)
            .onSnapshot(snap => {
                const data = snap.data();
                if (data && (data.status === 'completed' || data.status === 'failed')) {
                    clearTimeout(timeout);
                    unsubscribe();
                    resolve(data);
                }
            }, err => {
                clearTimeout(timeout);
                reject(err);
            });
    });
}

/**
 * LOCAL PC SIDE: Start listening for commands from Cloud
 */
function startRelayListener(db, bot) {
    if (!db) {
        console.error('❌ [Relay] Cannot start: Firebase not connected!');
        return;
    }

    console.log('🖐️ [Relay] Local PC Relay is now LISTENING for commands...');

    // Subscribe to pending commands for any user
    db.collection('pc_commands')
        .where('status', '==', 'pending')
        .onSnapshot(async (snapshot) => {
            for (const change of snapshot.docChanges()) {
                if (change.type === 'added') {
                    const doc = change.doc;
                    const cmd = doc.data();
                    const commandId = doc.id;

                    console.log(`📥 [Relay] Received command: ${cmd.action} (ID: ${commandId})`);

                    // Mark as 'running' immediately
                    try {
                        await doc.ref.update({ 
                            status: 'running',
                            startedAt: admin.firestore.FieldValue.serverTimestamp()
                        });

                        // Execute the corresponding local logic
                        const result = await executeLocalCommand(cmd.action, cmd.data);

                        // Update Firestore with result
                        await doc.ref.update({
                            status: 'completed',
                            result: result,
                            completedAt: admin.firestore.FieldValue.serverTimestamp()
                        });

                        // Send result back to Telegram if bot is available
                        if (bot && cmd.chatId) {
                            await sendResultToTelegram(bot, cmd.chatId, cmd.action, result);
                        }

                        console.log(`✅ [Relay] Command ${cmd.action} completed successfully.`);

                    } catch (err) {
                        console.error(`❌ [Relay] Command ${cmd.action} failed:`, err.message);
                        await doc.ref.update({
                            status: 'failed',
                            error: err.message,
                            completedAt: admin.firestore.FieldValue.serverTimestamp()
                        });

                        if (bot && cmd.chatId) {
                            try {
                                await bot.telegram.sendMessage(cmd.chatId, `❌ คำสั่ง ${cmd.action} ล้มเหลว: ${err.message}`);
                            } catch (e) {}
                        }
                    }
                }
            }
        }, (err) => {
            console.error('❌ [Relay] Firestore listener error:', err.message);
        });
}

/**
 * Execute a command on the local PC
 */
async function executeLocalCommand(actionType, data) {
    switch (actionType) {
        case 'SCREEN_CAPTURE': {
            const screenshot = require('screenshot-desktop');
            const outputDir = path.join(__dirname, '../output');
            if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
            const imgPath = path.join(outputDir, `relay_screenshot_${Date.now()}.png`);
            await screenshot({ filename: imgPath });
            
            // Convert to base64 for transmission
            const imgBuffer = fs.readFileSync(imgPath);
            const base64 = imgBuffer.toString('base64');
            
            // Cleanup local file
            fs.unlinkSync(imgPath);
            
            return { type: 'image', base64: base64, filename: `screenshot_${Date.now()}.png` };
        }

        case 'GET_PC_STATS': {
            const si = require('systeminformation');
            const [cpu, mem, load, battery, osInfo] = await Promise.all([
                si.cpu(), si.mem(), si.currentLoad(), si.battery(), si.osInfo()
            ]);
            
            let stats = `💻 **Laptop Status (Live from PC)**\n`;
            stats += `- 🖥️ OS: ${osInfo.distro}\n`;
            stats += `- ⚡ CPU: ${cpu.brand}\n`;
            stats += `- 📊 Load: ${load.currentLoad.toFixed(1)}%\n`;
            stats += `- 🧠 RAM: ${(mem.used / 1e9).toFixed(1)} / ${(mem.total / 1e9).toFixed(1)} GB (${((mem.used/mem.total)*100).toFixed(0)}%)\n`;
            if (battery && battery.hasBattery) {
                stats += `- 🔋 Battery: ${battery.percent}% ${battery.isCharging ? '⚡ Charging' : '🔌 On Battery'}\n`;
            }
            
            return { type: 'text', text: stats };
        }

        case 'SYSTEM_CONTROL': {
            if (data.action === 'SHUTDOWN') exec('shutdown /s /t 30');
            else if (data.action === 'RESTART') exec('shutdown /r /t 30');
            else if (data.action === 'SLEEP') exec('rundll32.exe powrprof.dll,SetSuspendState 0,1,0');
            else if (data.action === 'LOCK') exec('rundll32.exe user32.dll,LockWorkStation');
            return { type: 'text', text: `⚙️ ดำเนินการ ${data.action} ให้แล้วนะคะเจ้านาย` };
        }

        case 'RUN_COMMAND':
        case 'EXEC_COMMAND': {
            return new Promise((resolve, reject) => {
                exec(data.command, { timeout: 30000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
                    if (err) return reject(new Error(`Command failed: ${err.message}`));
                    resolve({ type: 'text', text: `🖥️ **Output:**\n\`\`\`\n${(stdout || stderr || 'No output').substring(0, 3000)}\n\`\`\`` });
                });
            });
        }

        case 'SAVE_FILE_LOCAL': {
            // Save a file to the local machine (e.g. OneDrive/Documents)
            const targetDir = data.targetDir || path.join(__dirname, '../Documents');
            if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
            
            const filePath = path.join(targetDir, data.filename);
            const buffer = Buffer.from(data.base64, 'base64');
            fs.writeFileSync(filePath, buffer);
            
            return { type: 'text', text: `💾 ไฟล์ ${data.filename} ถูกบันทึกลงเครื่องแล้วที่: ${filePath}` };
        }

        case 'YOUTUBE_OPEN':
        case 'YOUTUBE_CONTROL':
        case 'YOUTUBE_LIST_TABS': {
            try {
                const youtube = require('../skills/youtubeSmartController');
                const result = await youtube.handleYoutubeAction(actionType, data);
                return { type: 'text', text: `📺 **YouTube:** ${result || 'ดำเนินการเสร็จสิ้นค่ะ'}` };
            } catch (err) {
                return { type: 'text', text: `❌ YouTube Error: ${err.message}` };
            }
        }

        case 'BROWSER_INTERACT': {
            try {
                const browser = require('../skills/browserInteract');
                const result = await browser({ data, logToTerminal: console.log });
                return { type: 'text', text: `🌐 **Browser:** ${result || 'ดำเนินการเสร็จสิ้นค่ะ'}` };
            } catch (err) {
                return { type: 'text', text: `❌ Browser Error: ${err.message}` };
            }
        }

        case 'CANVA_CONTROL': {
            try {
                const canva = require('../skills/canva');
                const result = await canva({ data, logToTerminal: console.log });
                return { type: 'text', text: `🎨 **Canva:** ${result || 'ดำเนินการเสร็จสิ้นค่ะ'}` };
            } catch (err) {
                return { type: 'text', text: `❌ Canva Error: ${err.message}` };
            }
        }

        default:
            return { type: 'text', text: `⚠️ Unknown command: ${actionType}` };
    }
}

/**
 * Send result back to Telegram from Local PC
 */
async function sendResultToTelegram(bot, chatId, actionType, result) {
    if (!result) return;

    if (result.type === 'image' && result.base64) {
        const buffer = Buffer.from(result.base64, 'base64');
        await bot.telegram.sendPhoto(chatId, { source: buffer }, {
            caption: `📸 **ภาพจากคอมพิวเตอร์ที่บ้าน (Real-Time)**`
        });
    } else if (result.type === 'text') {
        await bot.telegram.sendMessage(chatId, result.text);
    }
}

module.exports = {
    LOCAL_ONLY_ACTIONS,
    isLocalAction,
    sendCommandToPC,
    waitForCommandResult,
    startRelayListener,
    executeLocalCommand
};
