const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();
const userId = '8245980204';
const newWebhookUrl = 'https://script.google.com/macros/s/AKfycbz4rjumVCw30t1N_8osEGIGVnMm5bsw4UMZIFIrDFneUcb1vTdmj0jWAU8IMgA0z9cOQQ/exec';

async function updateWebhook() {
    await db.collection('userActivities').doc(userId).set({
        calendarWebhookUrl: newWebhookUrl
    }, { merge: true });
    console.log(`✅ Webhook updated to new URL for user ${userId}`);
}

updateWebhook().then(() => process.exit(0));
