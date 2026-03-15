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
const identity = 'Stacy (เลขาขี้เล่น)';

async function updateProfile() {
    await db.collection('userActivities').doc(userId).set({
        calendarWebhookUrl: webhookUrl,
        identity: identity
    }, { merge: true });
    console.log(`✅ Profile updated for user ${userId}: Identity set to ${identity}`);
}

updateProfile().then(() => process.exit(0));
