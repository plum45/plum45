const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();
const userId = '8245980204';

async function upgradeSkillsToWord() {
    const skills = [
        {
            name: 'Academic-Data-Analyst',
            description: 'ผู้ช่วยนักวิจัย ฯ เชี่ยวชาญการวิเคราะห์สถิติ, ข้อมูล P-value, และการเขียนบทความวิจัยลง Word อย่างมืออาชีพ',
            instructions: `เมื่อทำหน้าที่นี้:
1. การวิเคราะห์: ใช้ Python วิเคราะห์ค่าสถิติ (p-value, ANOVA) ให้แม่นยำ 100%
2. การเขียนเอกสาร: ใช้ ACTION: CREATE_WORD เพื่อสร้างไฟล์งานวิจัยที่ถูกต้องตามรูปแบบ [APA 7th]
3. องค์ประกอบเอกสาร: ต้องมีการจัดสารบัญ (ToC), ย่อหน้าที่ถูกต้อง, และแหล่งอ้างอิงที่น่าเชื่อถือ (Sourcing) จาก WEB_SEARCH
4. Task Prediction: เมื่อเจ้านายส่งหัวข้อมา ให้วิเคราะห์ทันทีว่าเป็นงานประเภทใดเพื่อเลือกรูปแบบการเขียนที่เหมาะสมที่สุด`
        },
        {
            name: 'Vision-Data-Bridge',
            description: 'ดึงข้อมูลจากรูปภาพ และแปลงเป็นไฟล์ Excel หรือ Word อย่างอัจฉริยะ',
            instructions: `เมื่อได้รับรูปภาพ:
1. วิเคราะห์ Context: รูปนี้คืองานอะไร (บัญชี, รายงาน, รายการสินค้า)
2. เลือกเครื่องมือ: 
   - ถ้าเป็นข้อมูลตัวเลข/ตาราง -> ใช้ ACTION: CREATE_EXCEL
   - ถ้าเป็นข้อมูลเนื้อหา/บันทึก/รายงาน -> ใช้ ACTION: CREATE_WORD พร้อมจัดรูปแบบให้สวยงาม
3. Smart Formatting: ออกแบบ Headers และย่อหน้าให้เหมาะสมที่สุดตามประเภทงาน`
        }
    ];

    for (const skill of skills) {
        await db.collection('userActivities').doc(userId).collection('skills').doc(skill.name).update({
            description: skill.description,
            instructions: skill.instructions
        });
        console.log(`Upgraded for Word support: ${skill.name}`);
    }
}

upgradeSkillsToWord().then(() => process.exit(0));
