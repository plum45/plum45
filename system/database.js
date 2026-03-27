const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let db;
let firebaseStatus = "Disconnected";

function initFirebase() {
    try {
        let serviceAccount = null;
        const fbKey = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT;
        if (fbKey) {
            console.log(`📡 [Firebase] Found environment variable (Length: ${fbKey.length})`);
            try {
                serviceAccount = JSON.parse(fbKey);
                console.log("✅ [Firebase] JSON parsed successfully.");
            } catch (e) {
                console.error("❌ [Firebase] JSON parse failed. checking if raw fields exist...");
            }
        }
        
        if (!serviceAccount) {
            if (process.env.FIREBASE_PRIVATE_KEY) {
                serviceAccount = {
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
                };
            } else {
                const keyPath = path.join(__dirname, '../config/serviceAccountKey.json');
                if (fs.existsSync(keyPath)) {
                    serviceAccount = require(keyPath);
                }
            }
        }

        if (serviceAccount) {
            if (serviceAccount.privateKey) {
                serviceAccount.privateKey = serviceAccount.privateKey.replace(/\\n/g, '\n');
            }
            
            if (admin.apps.length === 0) {
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount)
                });
                console.log("🔥 [Firebase] New connection established.");
            } else {
                console.log("🔥 [Firebase] Using existing connection.");
            }
            
            db = admin.firestore();
            db.settings({ ignoreUndefinedProperties: true });
            firebaseStatus = "🟢 Connected (Ready)";
            console.log(`🔥 [Firebase] Active Project: ${serviceAccount.project_id || serviceAccount.projectId}`);
        }
    } catch (e) {
        console.error("❌ Firebase Init Failed:", e.message);
        firebaseStatus = `🔴 Init Failed: ${e.message}`;
    }
    return { db, firebaseStatus };
}

const LOCAL_DB_PATH = path.join(__dirname, '../config/local_db.json');

function getLocalData() {
    try {
        if (fs.existsSync(LOCAL_DB_PATH)) {
            return JSON.parse(fs.readFileSync(LOCAL_DB_PATH, 'utf8'));
        }
    } catch (e) { console.error("⚠️ [LocalDB] Read error:", e.message); }
    return { userActivities: {} };
}

function saveLocalData(data) {
    try {
        fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(data, null, 2));
    } catch (e) { console.error("⚠️ [LocalDB] Write error:", e.message); }
}

async function getBotMemory(userId) {
    const defaultMemory = { identity: "AI หญิงสาวอัจฉริยะ (Recovery Mode)", facts: [] };
    if (!db) {
        // Local Fallback
        const data = getLocalData();
        return data.userActivities[userId]?.memory || defaultMemory;
    }
    try {
        const userRef = db.collection('userActivities').doc(String(userId));
        const doc = await userRef.get();
        if (!doc.exists) return defaultMemory;
        const data = doc.data();
        return {
            identity: data.identity || "AI หญิงสาวอัจฉริยะ",
            facts: data.facts || []
        };
    } catch (e) {
        console.error("⚠️ [getBotMemory] Failed (using default):", e.message);
        return defaultMemory;
    }
}

async function saveBotMemory(userId, userMsg, botReply) {
    // 1. Local Save (Always save locally as backup or primary)
    const data = getLocalData();
    if (!data.userActivities[userId]) data.userActivities[userId] = { memory: { identity: "Stacy AI", facts: [] }, history: [] };
    const user = data.userActivities[userId];
    
    user.history.push({ user: userMsg, bot: botReply, timestamp: new Date().toISOString() });
    if (user.history.length > 50) user.history.shift();
    
    // Heuristic Fact Extraction
    const factPatterns = [
        { re: /(?:ฉันชื่อ|ผมชื่อ|เรียกผมว่า)\s*([^\n.,!]+)/i, fact: "ชื่อเจ้านายคือ $1" },
        { re: /(?:จำไว้ว่า|อย่าลืมว่า|เตือนฉันว่า)\s*([^\n.,!]+)/i, fact: "$1" },
        { re: /(?:ฉันชอบ|ผมชอบ)\s*([^\n.,!]+)/i, fact: "เจ้านายชอบ $1" }
    ];

    for (const p of factPatterns) {
        const match = userMsg.match(p.re);
        if (match && match[1]) {
            const fact = p.fact.replace('$1', match[1].trim());
            if (!user.memory.facts.includes(fact)) user.memory.facts.push(fact);
            console.log(`[Local Memory Extracted]: ${fact}`);
        }
    }
    saveLocalData(data);

    // 2. Firebase Save (Optional)
    if (!db) return;
    try {
        const userRef = db.collection('userActivities').doc(String(userId));
        await userRef.collection('history').add({
            user: userMsg,
            bot: botReply,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        
        for (const p of factPatterns) {
            const match = userMsg.match(p.re);
            if (match && match[1]) {
                const fact = p.fact.replace('$1', match[1].trim());
                await userRef.update({ facts: admin.firestore.FieldValue.arrayUnion(fact) });
            }
        }
    } catch (e) { console.error('Firebase Save Error:', e); }
}

async function getChatHistory(userId, limit = 20) {
    if (!db) {
        // Local Fallback
        const data = getLocalData();
        const history = data.userActivities[userId]?.history || [];
        return history.slice(-limit).map(h => [
            { role: 'user', content: h.user },
            { role: 'assistant', content: h.bot }
        ]).flat();
    }
    try {
        const historySnap = await db.collection('userActivities').doc(String(userId))
            .collection('history')
            .orderBy('timestamp', 'desc')
            .limit(limit)
            .get();
        if (historySnap.empty) return [];
        return historySnap.docs.map(doc => {
            const data = doc.data();
            return [
                { role: 'user', content: data.user },
                { role: 'assistant', content: data.bot }
            ];
        }).flat().reverse();
    } catch (e) {
        console.error('⚠️ [getChatHistory] Failed (returning empty):', e.message);
        return [];
    }
}

module.exports = { initFirebase, getBotMemory, saveBotMemory, getChatHistory, admin, db, firebaseStatus };
