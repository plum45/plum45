const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function checkUserActivities() {
    try {
        const snapshot = await db.collection('userActivities').get();
        for (const doc of snapshot.docs) {
            console.log(`User ${doc.id}:`);
            console.log(JSON.stringify(doc.data(), null, 2));
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}

checkUserActivities();
