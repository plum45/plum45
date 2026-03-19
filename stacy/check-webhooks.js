const admin = require('firebase-admin');
const path = require('path');
const serviceAccount = require('./serviceAccountKey.json');

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function checkWebhooks() {
    try {
        const snapshot = await db.collection('userActivities').get();
        if (snapshot.empty) {
            console.log('No user activities found.');
            return;
        }
        snapshot.forEach(doc => {
            const data = doc.data();
            console.log(`User ${doc.id}: Webhook = ${data.webhookUrl || 'Not Set'}`);
        });
    } catch (e) {
        console.error('Error:', e.message);
    }
}

checkWebhooks();
