const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function checkTasks() {
    try {
        const userId = '8245980204';
        const snapshot = await db.collection('userActivities').doc(userId).collection('tasks').orderBy('createdAt', 'desc').limit(5).get();
        console.log(`Recent tasks for ${userId}:`);
        snapshot.forEach(doc => {
            const data = doc.data();
            console.log(`- Title: ${data.title} | Time: ${data.time} | Type: ${data.type}`);
        });
    } catch (e) {
        console.error('Error:', e.message);
    }
}

checkTasks();
