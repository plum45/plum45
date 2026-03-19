const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function listCollections() {
    try {
        const collections = await db.listCollections();
        console.log('Collections:', collections.map(c => c.id).join(', '));
    } catch (e) {
        console.error('Error:', e.message);
    }
}

listCollections();
