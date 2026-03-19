const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
const docx = require('docx');
const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = docx;

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const userId = '8245980204';

async function createHerbReport() {
    const doc = new Document({
        sections: [{
            properties: {},
            children: [
                new Paragraph({
                    text: "รายงานการศึกษาพืชสมุนไพรท้องถิ่น",
                    heading: HeadingLevel.TITLE,
                    alignment: AlignmentType.CENTER,
                }),
                new Paragraph({
                    text: "อำเภอสุวรรณภูมิ จังหวัดร้อยเอ็ด",
                    heading: HeadingLevel.HEADING_1,
                    alignment: AlignmentType.CENTER,
                }),
                new Paragraph({ text: "" }),
                new Paragraph({
                    text: "โดย: Stacy AI (Architect Evolution)",
                    alignment: AlignmentType.RIGHT,
                }),
                new Paragraph({ text: "" }),
                new Paragraph({
                    text: "บทนำ",
                    heading: HeadingLevel.HEADING_2,
                }),
                new Paragraph({
                    children: [
                        new TextRun("อำเภอสุวรรณภูมิ จังหวัดร้อยเอ็ด เป็นพื้นที่ที่มีความหลากหลายทางชีวภาพ โดยเฉพาะพืชสมุนไพรพื้นบ้าน ซึ่งมีความสำคัญต่อระบบภูมิปัญญาท้องถิ่นและการแพทย์พื้นเมือง ภายใต้นโยบาย 'สุวรรณภูมิเมืองสมุนไพร' ของทางภาครัฐ"),
                    ],
                }),
                new Paragraph({ text: "" }),
                new Paragraph({
                    text: "ผลการสำรวจและความหลากหลาย",
                    heading: HeadingLevel.HEADING_2,
                }),
                new Paragraph({
                    children: [
                        new TextRun("จากการศึกษาข้อมูลพบว่าในพื้นที่อำเภอสุวรรณภูมิ มีพืชสมุนไพรมากถึง 81 ชนิด จาก 49 วงศ์ โดยวงศ์ที่พบมากที่สุดคือ Fabaceae (วงศ์ถั่ว) สมุนไพรที่นิยมนำมาใช้มากที่สุดคือ มะนาว และตะไคร้ นิยมใช้ส่วนใบมาต้มดื่มหรือประกอบอาหาร"),
                    ],
                }),
                new Paragraph({ text: "" }),
                new Paragraph({
                    text: "กลุ่มวิสาหกิจชุมชนที่สำคัญ",
                    heading: HeadingLevel.HEADING_2,
                }),
                new Paragraph({
                    text: "• กลุ่มปลูกพืชสมุนไพรบ้านหญ้าหน่อง (ขมิ้นชันส่งออกโรงพยาบาล)",
                }),
                new Paragraph({
                    text: "• วิสาหกิจชุมชนกลุ่มปลูกพืชสมุนไพรบ้านโพนสูง",
                }),
                new Paragraph({ text: "" }),
                new Paragraph({
                    text: "สรุปผล",
                    heading: HeadingLevel.HEADING_2,
                }),
                new Paragraph({
                    children: [
                        new TextRun("การอนุรักษ์พืชสมุนไพรในอำเภอสุวรรณภูมิมีความสำคัญอย่างยิ่งต่อเศรษฐกิจฐานรากและการแพทย์ทางเลือกในอนาคต"),
                    ],
                }),
                new Paragraph({ text: "" }),
                new Paragraph({
                    text: "อ้างอิง",
                    heading: HeadingLevel.HEADING_2,
                }),
                new Paragraph({
                    text: "[1] drkaeng.com - ข้อมูลกลุ่มปลูกพืชสมุนไพรบ้านหญ้าหน่อง",
                }),
                new Paragraph({
                    text: "[2] tci-thaijo.org - งานวิจัยความหลากหลายของพืชสมุนไพรในเขตพื้นที่ชุมชนไทลาว",
                }),
            ],
        }],
    });

    const buffer = await Packer.toBuffer(doc);
    const fileName = `Herb_Report_Suwannaphum.docx`;
    fs.writeFileSync(fileName, buffer);
    console.log(`Generated: ${fileName}`);
}

createHerbReport().then(() => process.exit(0));
