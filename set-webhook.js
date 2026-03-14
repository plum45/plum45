const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();
const webhookUrl = "https://script.google.com/macros/s/AKfycbwdoSzd6Tk2eYEmCB-9t1UVjB7mShl6dZdRuY36o7kEmzGSqbdrHJTgQMWn4cHE8cLYxg/exec";

async function setWebhook() {
    try {
        // Since we don't know the exact user ID from Telegram, but we know 'me' exists in users, 
        // and the bot uses String(userId) in userActivities.
        // I will set it for a generic user activity or search for the active user if possible.
        // Actually, looking at server.js, it uses collection 'userActivities' with doc(String(userId)).
        
        // I'll update it for 'me' in users as a placeholder if needed, 
        // but the bot logic looks specifically at 'userActivities' collection.
        // Let's list documents in userActivities first to be precise.
        
        const snapshot = await db.collection('userActivities').get();
        if (snapshot.empty) {
            console.log('No user activities found yet. Setting up a default one.');
            // We'll wait for the user to chat through Telegram which creates the doc, 
            // OR we can create a generic one if we had the ID.
            // But since the user provided the URL here, I'll update all existing docs in userActivities
            // to ensure their current session is connected.
        } else {
            for (const doc of snapshot.docs) {
                await db.collection('userActivities').doc(doc.id).update({ webhookUrl });
                console.log(`✅ Webhook updated for user: ${doc.id}`);
            }
        }
        
        // Also update 'users' collection 'me' doc if it exists as a backup
        try {
            await db.collection('users').doc('me').set({ webhookUrl }, { merge: true });
            console.log('✅ Webhook updated for user: me');
        } catch(e) {}

    } catch (e) {
        console.error('Error:', e.message);
    }
}

setWebhook();
