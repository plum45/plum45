const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { isLocalAction, sendCommandToPC } = require('./bridge');

function extractActions(text) {
    if (!text) return { cleanText: "", actions: [] };
    const marker = '[ACTION:';
    const actions = [];
    let cleanText = text;

    let searchFrom = 0;
    while (true) {
        const start = text.indexOf(marker, searchFrom);
        if (start === -1) break;

        let depth = 0;
        let end = -1;
        for (let i = start; i < text.length; i++) {
            if (text[i] === '[') depth++;
            else if (text[i] === ']') {
                depth--;
                if (depth === 0) {
                    end = i;
                    break;
                }
            }
        }

        if (end !== -1) {
            const fullMatch = text.substring(start, end + 1);
            const content = fullMatch.substring(marker.length, fullMatch.length - 1).trim();
            const spaceIdx = content.indexOf(' ');
            const type = spaceIdx === -1 ? content : content.substring(0, spaceIdx);
            const dataStr = spaceIdx === -1 ? '{}' : content.substring(spaceIdx).trim();

            try {
                const data = JSON.parse(dataStr);
                actions.push({ type, data });
                cleanText = cleanText.replace(fullMatch, '');
            } catch (e) { console.error("Action Parse Fail:", e.message); }
            searchFrom = end + 1;
        } else break;
    }
    return { cleanText: cleanText.trim(), actions };
}

async function handleAgentActions(ctx, type, data, userId, options) {
    const { db, IS_RENDER } = options;

    if (IS_RENDER && isLocalAction(type)) {
        await sendCommandToPC(db, userId, type, data, ctx.chat?.id);
        return;
    }

    switch (type) {
        case 'RECOVER_WIFI':
            try {
                const profilesOutput = execSync('netsh wlan show profiles').toString();
                const profileNames = profilesOutput.split('\n').filter(line => line.includes(':')).map(line => line.split(':')[1].trim()).filter(n => n !== '');
                
                const targetSSID = data.ssid || data.name || data.query;
                const profilesToScan = targetSSID ? profileNames.filter(n => n.toLowerCase().includes(targetSSID.toLowerCase())) : profileNames.slice(0, 10);

                let res = `📶 **Wi-Fi Recovery (V2 XML)**\n\n| SSID | Password |\n| :--- | :--- |\n`;
                for (const ssid of profilesToScan) {
                    try {
                        execSync(`netsh wlan export profile name="${ssid}" folder="." key=clear`, { stdio: 'ignore' });
                        const files = fs.readdirSync('.');
                        const targetFile = files.find(f => f.startsWith('Wi-Fi-') && f.endsWith('.xml') && f.includes(ssid));
                        if (targetFile) {
                            const xml = fs.readFileSync(targetFile, 'utf8');
                            const key = xml.match(/<keyMaterial>(.*)<\/keyMaterial>/);
                            res += `| \`${ssid}\` | \`${key ? key[1] : '*(ไม่มี)*'}\` |\n`;
                            fs.unlinkSync(targetFile);
                        } else {
                            const detail = execSync(`netsh wlan show profile name="${ssid}" key=clear`).toString();
                            const keyMatch = detail.match(/Key Content\s*:\s*(.*)/i) || detail.match(/เนื้อหาคีย์\s*:\s*(.*)/i);
                            res += `| \`${ssid}\` | \`${keyMatch ? keyMatch[1].trim() : '*(ไม่พบ)*'}\` |\n`;
                        }
                    } catch (e) { res += `| \`${ssid}\` | *Error* |\n`; }
                }
                await ctx.reply(res, { parse_mode: 'Markdown' });
            } catch (err) { await ctx.reply(`❌ Wi-Fi Error: ${err.message}`); }
            break;

        case 'WEB_SEARCH':
            const { smartSearch } = require('./utils');
            const searchRes = await smartSearch(data.query);
            await ctx.reply(searchRes);
            break;

        default:
            console.log(`Action ${type} not handled here.`);
    }
}

module.exports = { extractActions, handleAgentActions };
