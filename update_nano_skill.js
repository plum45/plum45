const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();
const instructions = 'วิธีใช้: ใช้ ACTION: IMAGE_GEN หรือใช้ EXECUTE_COMMAND เพื่อรันสคริปต์\n- เจนใหม่: uv run ./lib/skills/nano-banana-pro/scripts/generate_image.py --prompt "คำบรรยาย" --filename "ชื่อไฟล์.png" --resolution 1K\n- แก้ไขภาพ: uv run ./lib/skills/nano-banana-pro/scripts/generate_image.py --prompt "คำสั่งแก้" --filename "ชื่อไฟล์ใหม่.png" --input-image "พาธไฟล์เดิม"\n(ต้องการ GEMINI_API_KEY ใน Environment)';

db.collection('userActivities').doc('8245980204').collection('skills').doc('Nano-Banana-Pro').update({
    instructions: instructions
}).then(() => {
    console.log('Skill Updated');
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
