const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();
const userId = '8245980204';

async function checkSkills() {
    const skillsSnap = await db.collection('userActivities').doc(userId).collection('skills').get();
    skillsSnap.forEach(doc => {
        console.log(`--- Skill: ${doc.id} ---`);
        console.log(doc.data().instructions);
    });
}

checkSkills().then(() => process.exit(0));
