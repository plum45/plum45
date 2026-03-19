const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

async function check() {
    const keyPath = path.join(__dirname, 'serviceAccountKey.json');
    const serviceAccount = require(keyPath);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    const db = admin.firestore();
    
    const docRef = db.collection('artifacts').doc('murder-mystery-game')
        .collection('public').doc('data')
        .collection('rooms').doc('room-01');
        
    const snap = await docRef.get();
    if (snap.exists) {
        console.log("Room Data:", JSON.stringify(snap.data(), null, 2));
    } else {
        console.log("No room data found.");
    }
    process.exit(0);
}
check();
