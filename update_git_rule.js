const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();
const userId = '8245980204';

async function updateGitRule() {
    const skillRef = db.collection('userActivities').doc(userId).collection('skills').doc('code-architect');
    const doc = await skillRef.get();
    let instructions = doc.exists ? doc.data().instructions : "";
    
    instructions += `\n\n## Git Deployment Rule (CRITICAL)
- **Always ask Master for permission** before using 'git push' to deploy changes to the cloud.
- Only perform 'git add' and 'git commit' for local backups if needed, but the 'push' step MUST be authorized by Master first.`;

    await skillRef.update({ instructions });
    console.log("Updated Code-Architect with Git permission rule.");
}

updateGitRule().then(() => process.exit(0));
