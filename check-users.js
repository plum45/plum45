const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function checkUsers() {
    try {
        const snapshot = await db.collection('users').get();
        snapshot.forEach(doc => {
            console.log(`User ${doc.id}:`, JSON.stringify(doc.data()).substring(0, 200));
        });
    } catch (e) {
        console.error('Error:', e.message);
    }
}

checkUsers();
