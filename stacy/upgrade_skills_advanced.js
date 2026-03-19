const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();
const userId = '8245980204';

async function upgradeSkillsAdvancedEditing() {
    const skills = [
        {
            name: 'Academic-Data-Analyst',
            description: 'ผู้ช่วยวิจัยระดับสูง จัดการเอกสารซับซ้อน (Word/Excel) และวิเคราะห์สถิติ',
            instructions: `ความสามารถขั้นสูง:
1. Excel (Advanced): รองรับการสร้างหลาย Sheet ในไฟล์เดียว และการ "ผสานเซลล์ (Merge Cells)" เพื่อจัดรูปแบบตารางให้สวยงาม
2. Word (Advanced): รองรับการสร้าง "ตาราง (Tables)" ในเอกสาร, การจัดทำสารบัญ (ToC), และการแบ่งหัวข้อที่ชัดเจน
3. Data Splitting: สามารถวิเคราะห์ข้อมูลดิบที่ปนกันแล้วสั่ง "แยกข้อมูล (Cell Splitting)" ลงในแต่ละคอลัมน์ของ Excel ได้อย่างแม่นยำ
เมื่อได้รับคำสั่ง ให้พิจารณาใช้ฟีเจอร์ขั้นสูงเหล่านี้เสมอเพื่อให้งานดูเป็นมืออาชีพที่สุด`
        },
        {
            name: 'Vision-Data-Bridge',
            description: 'สกัดข้อมูลจากภาพและจัดโครงสร้างลง Excel/Word ขั้นสูง',
            instructions: `การทำงานขั้นสูง:
1. การสกัดและแยก: ถ้าข้อมูลในภาพปนกัน (เช่น ที่อยู่ยาวๆ) ให้ใช้ปัญญาประดิษฐ์สั่ง "แยกคอลัมน์" (Cell Splitting) ให้เจ้านายทันที
2. โครงสร้างตาราง: ใช้ Merges และ Multiple Sheets หากข้อมูลมีความซับซ้อน หรือมีหลายหมวดหมู่ในภาพเดียว
3. เอกสาร Word: ถ้าภาพเป็นบทความ/บันทึก ให้ใช้การจัดตารางใน Word เพื่อคงรูปแบบเดิมให้มากที่สุด`
        }
    ];

    for (const skill of skills) {
        await db.collection('userActivities').doc(userId).collection('skills').doc(skill.name).update({
            description: skill.description,
            instructions: skill.instructions
        });
        console.log(`Upgraded for Advanced Editing: ${skill.name}`);
    }
}

upgradeSkillsAdvancedEditing().then(() => process.exit(0));
