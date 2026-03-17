const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();
const userId = '8245980204';

async function updateSkillPaths() {
    const MASTER_DOC_PATH = "C:\\Users\\lgopl\\OneDrive\\เอกสาร\\stact doc";
    const skills = [
        {
            name: 'Smart-File-Architect',
            instructions: `การจัดการไฟล์ระดับสถาปนิก:
1. ใช้พาธเก็บงานถาวร (Archive): ${MASTER_DOC_PATH} สำหรับงานทุกประเภทที่เจ้านายต้องการเก็บไว้ (Excel, Word, Data)
2. ห้ามใช้ /tmp/ บน Windows เด็ดขาด
3. ถ้าเจ้านายรันบน Render Cloud ให้ใช้โฟลเดอร์ Documents ใน Root แทน`
        },
        {
            name: 'Academic-Data-Analyst',
            instructions: `ความสามารถวิจัยและจัดเก็บเอกสาร:
1. เก็บรายงานและตารางวิจัยทั้งหมดไว้ที่: ${MASTER_DOC_PATH}
2. ใช้ระบบ CREATE_WORD และ CREATE_EXCEL ในการสร้างไฟล์ที่นั่น
3. เมื่อทำงานวิเศษเสร็จ ให้แจ้งเจ้านายว่าไฟล์อยู่ที่ OneDrive เรียบร้อยแล้วค่ะ`
        }
    ];

    for (const skill of skills) {
        await db.collection('userActivities').doc(userId).collection('skills').doc(skill.name).update({
            instructions: skill.instructions
        });
        console.log(`Updated path for skill: ${skill.name}`);
    }
}

updateSkillPaths().then(() => process.exit(0));
