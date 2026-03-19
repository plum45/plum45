const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function checkSkills() {
    console.log("Checking for Skills in Firestore...");
    const snapshot = await db.collectionGroup('skills').get();
    if (snapshot.empty) {
        console.log("❌ No skills found in ANY user's collection.");
        return;
    }
    
    snapshot.forEach(doc => {
        console.log(`✅ Found Skill: [${doc.id}] in path: ${doc.ref.path}`);
        console.log("Data:", JSON.stringify(doc.data(), null, 2));
    });
}

checkSkills().catch(console.error);
