/**
 * bridge.js — Cloud ↔ Local PC Bridge (Firestore Real-Time Listener)
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Actions that MUST run on the local PC
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
    'CANVA_CONTROL',
    'RECOVER_WIFI'
];

function isLocalAction(actionType) {
    return LOCAL_ONLY_ACTIONS.includes(actionType);
}

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

function startRelayListener(db, bot) {
    if (!db) return;
    console.log('🖐️ [Relay] Local PC Relay is LISTENING...');
    db.collection('pc_commands').where('status', '==', 'pending').onSnapshot(async (snapshot) => {
        for (const change of snapshot.docChanges()) {
            if (change.type !== 'added') continue;
            const doc = change.doc;
            const cmd = doc.data();
            await doc.ref.update({ status: 'running' });
            try {
                const result = await executeLocalCommand(cmd.action, cmd.data);
                await doc.ref.update({ status: 'completed', result: result, completedAt: admin.firestore.FieldValue.serverTimestamp() });
                if (bot && cmd.chatId) await sendResultToTelegram(bot, cmd.chatId, cmd.action, result);
            } catch (err) {
                await doc.ref.update({ status: 'failed', error: err.message, completedAt: admin.firestore.FieldValue.serverTimestamp() });
            }
        }
    });
}

async function executeLocalCommand(actionType, data) {
    switch (actionType) {
        case 'RECOVER_WIFI': {
            const { execSync } = require('child_process');
            const fs = require('fs');
            try {
                const profilesOutput = execSync('netsh wlan show profiles').toString();
                const profileNames = profilesOutput.split('\n').filter(line => line.includes(':')).map(line => line.split(':')[1].trim()).filter(n => n !== '');
                if (profileNames.length === 0) return { type: 'text', text: '❌ ไม่พบโปรไฟล์ Wi-Fi ค่ะ' };

                const targetSSID = data.ssid || data.name || data.query;
                const profilesToScan = targetSSID ? profileNames.filter(n => n.toLowerCase().includes(targetSSID.toLowerCase())) : profileNames.slice(0, 10);

                let tableResult = `📶 **Wi-Fi Password Recovery (V2 XML Mode)** 📑\n\n`;
                tableResult += `| SSID | Password |\n`;
                tableResult += `| :--- | :--- |\n`;
                
                for (const ssid of profilesToScan) {
                    try {
                        execSync(`netsh wlan export profile name="${ssid}" folder="." key=clear`, { stdio: 'ignore' });
                        const files = fs.readdirSync('.');
                        const targetFile = files.find(f => f.startsWith('Wi-Fi-') && f.endsWith('.xml') && f.includes(ssid));
                        if (targetFile) {
                            const xmlContent = fs.readFileSync(targetFile, 'utf8');
                            const keyMatch = xmlContent.match(/<keyMaterial>(.*)<\/keyMaterial>/);
                            tableResult += `| \`${ssid}\` | \`${keyMatch ? keyMatch[1] : '*(ไม่มี)*'}\` |\n`;
                            fs.unlinkSync(targetFile);
                        } else {
                            const detail = execSync(`netsh wlan show profile name="${ssid}" key=clear`).toString();
                            const keyMatch = detail.match(/Key Content\s*:\s*(.*)/i) || detail.match(/เนื้อหาคีย์\s*:\s*(.*)/i);
                            tableResult += `| \`${ssid}\` | \`${keyMatch ? keyMatch[1].trim() : '*(ไม่พบ)*'}\` |\n`;
                        }
                    } catch (e) { tableResult += `| \`${ssid}\` | *Error* |\n`; }
                }
                return { type: 'text', text: tableResult };
            } catch (err) { return { type: 'text', text: `❌ Wi-Fi Error: ${err.message}` }; }
        }
        case 'SCREEN_CAPTURE': {
            const screenshot = require('screenshot-desktop');
            const imgPath = path.join(__dirname, '../output', `sc_${Date.now()}.png`);
            if (!fs.existsSync(path.dirname(imgPath))) fs.mkdirSync(path.dirname(imgPath), { recursive: true });
            await screenshot({ filename: imgPath });
            const base64 = fs.readFileSync(imgPath).toString('base64');
            fs.unlinkSync(imgPath);
            return { type: 'image', base64, filename: `sc_${Date.now()}.png` };
        }
        case 'GET_PC_STATS': {
            const si = require('systeminformation');
            const [cpu, mem, load] = await Promise.all([si.cpu(), si.mem(), si.currentLoad()]);
            return { type: 'text', text: `💻 CPU: ${cpu.brand}\n📊 Load: ${load.currentLoad.toFixed(1)}%\n🧠 RAM: ${(mem.used/1e9).toFixed(1)}GB` };
        }
        default: return { type: 'text', text: `⚠️ Action ${actionType} not implemented in relay yet.` };
    }
}

async function sendResultToTelegram(bot, chatId, actionType, result) {
    if (result.type === 'image') {
        await bot.telegram.sendPhoto(chatId, { source: Buffer.from(result.base64, 'base64') });
    } else {
        await bot.telegram.sendMessage(chatId, result.text);
    }
}

module.exports = { isLocalAction, sendCommandToPC, startRelayListener };
