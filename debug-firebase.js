const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
const cert = require(serviceAccountPath);

try {
    console.log("Testing Firebase Initialization...");
    console.log("Project ID:", cert.project_id);
    console.log("Private Key (first 50 chars):", cert.private_key.substring(0, 50));
    
    admin.initializeApp({
        credential: admin.credential.cert(cert)
    });
    console.log("✅ Initialization Successful!");
} catch (e) {
    console.error("❌ Initialization Failed:", e.message);
    if (e.stack) console.error(e.stack);
}
