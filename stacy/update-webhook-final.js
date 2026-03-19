const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();
const userId = '8245980204';
const finalWebhookUrl = 'https://script.google.com/macros/s/AKfycbyQkDizJKDUMPpFOlC1ow8XpTrVIcyGZnVUoRPmvVA870oWEH9LTTl8I4akF5VJbahiZQ/exec';

async function updateWebhook() {
    await db.collection('userActivities').doc(userId).set({
        calendarWebhookUrl: finalWebhookUrl
    }, { merge: true });
    console.log(`✅ Webhook updated to FINAL URL for user ${userId}`);
}

updateWebhook().then(() => process.exit(0));
