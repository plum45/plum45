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
    'SAVE_FILE_LOCAL'
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
    if (!db) throw new Error('Firebase ไม่ได้เชื่อมต่อค่ะ');

    const commandRef = await db.collection('pc_commands').add({
        userId: String(userId),
        chatId: chatId,
        action: actionType,
        data: actionData,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        result: null,
        error: null
    });

    console.log(`📡 [Bridge] Command sent to PC: ${actionType} (ID: ${commandRef.id})`);
    return commandRef.id;
}

/**
 * CLOUD SIDE: Wait for a command result with timeout
 */
async function waitForCommandResult(db, commandId, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            unsubscribe();
            resolve({ status: 'timeout', result: null });
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

    db.collection('pc_commands')
        .where('status', '==', 'pending')
        .onSnapshot(async (snapshot) => {
            for (const change of snapshot.docChanges()) {
                if (change.type !== 'added') continue;

                const doc = change.doc;
                const cmd = doc.data();
                const commandId = doc.id;

                console.log(`📥 [Relay] Received command: ${cmd.action} (ID: ${commandId})`);

                // Mark as 'running'
                await doc.ref.update({ status: 'running' });

                try {
                    const result = await executeLocalCommand(cmd.action, cmd.data);

                    await doc.ref.update({
                        status: 'completed',
                        result: result,
                        completedAt: admin.firestore.FieldValue.serverTimestamp()
                    });

                    if (bot && cmd.chatId) {
                        await sendResultToTelegram(bot, cmd.chatId, cmd.action, result);
                    }

                } catch (err) {
                    console.error(`❌ [Relay] Command ${cmd.action} failed:`, err.message);
                    await doc.ref.update({
                        status: 'failed',
                        error: err.message,
                        completedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                }
            }
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
            const imgBuffer = fs.readFileSync(imgPath);
            const base64 = imgBuffer.toString('base64');
            fs.unlinkSync(imgPath);
            return { type: 'image', base64: base64, filename: `screenshot_${Date.now()}.png` };
        }
        case 'GET_PC_STATS': {
            const si = require('systeminformation');
            const [cpu, mem, load, battery, osInfo] = await Promise.all([si.cpu(), si.mem(), si.currentLoad(), si.battery(), si.osInfo()]);
            let stats = `💻 **Laptop Status (Live)**\n- OS: ${osInfo.distro}\n- CPU: ${cpu.brand}\n- Load: ${load.currentLoad.toFixed(1)}%\n- RAM: ${(mem.used / 1e9).toFixed(1)} / ${(mem.total / 1e9).toFixed(1)} GB`;
            return { type: 'text', text: stats };
        }
        case 'SYSTEM_CONTROL': {
            if (data.action === 'SHUTDOWN') exec('shutdown /s /t 30');
            else if (data.action === 'RESTART') exec('shutdown /r /t 30');
            return { type: 'text', text: `⚙️ ดำเนินการ ${data.action} ให้แล้วค่ะ` };
        }
        case 'SAVE_FILE_LOCAL': {
            const targetDir = data.targetDir || path.join(__dirname, '../Documents');
            if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
            const filePath = path.join(targetDir, data.filename);
            fs.writeFileSync(filePath, Buffer.from(data.base64, 'base64'));
            return { type: 'text', text: `💾 บันทึกไฟล์ที่: ${filePath}` };
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
        await bot.telegram.sendPhoto(chatId, { source: buffer }, { caption: `📸 **ภาพจากคอมพิวเตอร์ที่บ้าน**` });
    } else if (result.type === 'text') {
        await bot.telegram.sendMessage(chatId, result.text);
    }
}

module.exports = { LOCAL_ONLY_ACTIONS, isLocalAction, sendCommandToPC, waitForCommandResult, startRelayListener, executeLocalCommand };
