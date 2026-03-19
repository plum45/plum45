const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let db;
let firebaseStatus = "Disconnected";

function initFirebase() {
    try {
        let serviceAccount = null;
        if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
            serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        } else if (process.env.FIREBASE_PRIVATE_KEY) {
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

async function getBotMemory(userId) {
    if (!db) return { identity: "AI หญิงสาวอัจฉริยะ", facts: [] };
    const userRef = db.collection('userActivities').doc(String(userId));
    const doc = await userRef.get();
    if (!doc.exists) return { identity: "AI หญิงสาวอัจฉริยะ", facts: [] };
    const data = doc.data();
    return {
        identity: data.identity || "AI หญิงสาวอัจฉริยะ",
        facts: data.facts || []
    };
}

async function saveBotMemory(userId, userMsg, botReply) {
    if (!db) return;
    try {
        const userRef = db.collection('userActivities').doc(String(userId));
        await userRef.collection('history').add({
            user: userMsg,
            bot: botReply,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

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
                await userRef.update({
                    facts: admin.firestore.FieldValue.arrayUnion(fact)
                });
                console.log(`[Memory Extracted]: ${fact}`);
            }
        }
    } catch (e) {
        console.error('Save Memory Error:', e);
    }
}

async function getChatHistory(userId, limit = 20) {
    if (!db) return [];
    try {
        const historySnap = await db.collection('userActivities').doc(String(userId))
            .collection('history')
            .orderBy('timestamp', 'desc')
            .limit(limit)
            .get();
        if (historySnap.empty) return [];
        // Map to OpenAI format and reverse to get chronological order
        return historySnap.docs.map(doc => {
            const data = doc.data();
            return [
                { role: 'user', content: data.user },
                { role: 'assistant', content: data.bot }
            ];
        }).flat().reverse();
    } catch (e) {
        console.error('Fetch History Error:', e);
        return [];
    }
}

module.exports = { initFirebase, getBotMemory, saveBotMemory, getChatHistory, admin, db, firebaseStatus };
