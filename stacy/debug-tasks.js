const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function checkTasks() {
    const userActivities = await db.collection('userActivities').get();
    console.log(`Found ${userActivities.size} user activities.`);
    
    for (const doc of userActivities.docs) {
        const tasks = await doc.ref.collection('tasks').get();
        console.log(`User ID: ${doc.id}, Tasks Count: ${tasks.size}`);
        tasks.forEach(t => {
            console.log(`  - ${t.data().title} (${t.data().time})`);
        });
    }
}

checkTasks().then(() => process.exit(0));
