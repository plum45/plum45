const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

async function checkLogs() {
    const snap = await db.collection('userActivities').doc('8245980204').collection('terminalLogs').orderBy('timestamp', 'desc').limit(20).get();
    snap.forEach(doc => {
        const d = doc.data();
        console.log(`[${d.timestamp?.toDate().toISOString()}] CMD: ${d.command}`);
        console.log(`Output: ${d.output}\n`);
    });
    process.exit(0);
}

checkLogs();
