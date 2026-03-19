const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const serviceAccount = require('./serviceAccountKey.json');

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();
const userId = '8245980204'; // Your ID found in logs

async function updateSkills() {
    const skills = [
        {
            name: 'code-architect',
            description: 'วิญญาณสถาปนิกโค้ด: วิเคราะห์โครงสร้าง แก้ไข Bug และอัปเกรดระบบตัวเอง',
            instructions: 'ใช้เมื่อต้องอ่านโค้ดซับซ้อน หรือแก้ไขไฟล์ในโปรเจกต์ เน้นความปลอดภัยและความสวยงามของโค้ด',
            type: 'function'
        },
        {
            name: 'skill-manager',
            description: 'ระบบติดตั้งทักษะ: ค้นหา เรียนรู้ และสร้าง Skill.md ให้ตัวเองพัฒนาไม่หยุดยั้ง',
            instructions: 'ใช้เมื่อเจ้านายต้องการให้เรียนรู้สิ่งใหม่ ให้ใช้ WEB_BROWSE ไปอ่านคู่มือแล้วสร้างเป็นสกิลเก็บไว้',
            type: 'function'
        }
    ];

    for (const skill of skills) {
        await db.collection('userActivities').doc(userId).collection('skills').doc(skill.name).set({
            ...skill,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`✅ Updated Skill: ${skill.name}`);
    }
}

updateSkills().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
