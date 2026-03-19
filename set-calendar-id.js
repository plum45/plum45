const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();
const userId = '8245980204';
const calendarId = 'mocca007x@gmail.com';

async function updateCalendarId() {
    await db.collection('userActivities').doc(userId).set({
        googleCalendarId: calendarId
    }, { merge: true });
    console.log(`✅ Google Calendar ID updated to ${calendarId} for user ${userId}`);
}

updateCalendarId().then(() => process.exit(0));
