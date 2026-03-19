const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();
const userId = '8245980204';
const webhookUrl = 'https://script.google.com/macros/s/AKfycbw-CcIsl9j8sGhaCz8VLaLgqcCWkDyduEUiAIrZENk3wXyPRpkdJXKmKITSvFpIyMt-ww/exec';

async function setWebhook() {
    await db.collection('userActivities').doc(userId).set({
        calendarWebhookUrl: webhookUrl
    }, { merge: true });
    console.log(`✅ Webhook updated for user ${userId}`);
}

setWebhook().then(() => process.exit(0));
