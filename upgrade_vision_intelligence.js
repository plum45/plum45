const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();
const userId = '8245980204';

async function upgradeSkillIntelligence() {
    const skillRef = db.collection('userActivities').doc(userId).collection('skills').doc('Vision-Data-Bridge');
    
    await skillRef.update({
        description: 'ดึงข้อมูลจากรูปภาพ และวิเคราะห์ประเภทงานเพื่อจัดลง Excel อย่างอัจฉริยะ',
        instructions: `เมื่อได้รับรูปภาพ:
1. การวิเคราะห์ (Context Prediction): วิเคราะห์ว่าภาพนี้คืองานอะไร (เช่น ใบเสร็จ, รายงานสรุปผลวิจัย, ตารางเวร, รายการสต็อก)
2. การสกัดข้อมูล: ดึงข้อความและตัวเลขออกมาให้ครบถ้วน
3. การออกแบบตาราง (Smart Structuring): ออกแบบหัวข้อตาราง (Headers) ที่เหมาะสมที่สุดโดยอัตโนมัติ เพื่อสร้างไฟล์ Excel ที่ใช้งานได้ทันที
4. การดำเนินการ: ใช้ ACTION: CREATE_EXCEL เพื่อสร้างไฟล์ส่งให้เจ้านาย พร้อมสรุปสั้นๆ ว่าหนูวิเคราะห์ว่าเป็นงานอะไร`
    });
    
    console.log('Skill Intellectual Intelligence Upgraded: Vision-Data-Bridge');
}

upgradeSkillIntelligence().then(() => process.exit(0));
