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
const userId = '8245980204';

const codeArchitectMD = `# Code Architect Skill\n\nThis skill enables Stacy to analyze, debug, and modify code with the precision of a software architect.\n\n## Capabilities\n- **Deep Code Analysis**: Understanding system architecture and data flow.\n- **Root Cause Analysis (RCA)**: Investigating bugs by tracing execution paths.\n- **Refactoring & Optimization**: Improving code quality and performance.\n- **Self-Modification**: Safely updating her own logic.\n\n## Workflows\n1. **Bug Investigation**: Locate file -> grep_search -> Analyze logic.\n2. **Architecture Review**: Map structures -> Identify tech debt.\n3. **Upgrade Deployment**: Plan multi-file changes -> Verify.`;

const skillManagerMD = `# Skill Manager: Installer & Discovery 🛠️\n\nThis skill defines how Stacy installs new capabilities for herself.\n\n## How it Works\n1. **Discovery**: Scan the skills/ folder to see what you know.\n2. **Installation**: Create new capability by writing a SKILL.md file or creating a Firestore document.\n3. **Execution**: Read the SKILL.md/Document to gain immediate expertise.\n\n## Workflow: Installing a New Skill\n1. **Identify the Need**.\n2. **Write the SKILL.md** (include # Title, Capabilities, Workflows).\n3. **Verification**.`;

async function updateSkills() {
    const skills = [
        {
            name: 'code-architect',
            description: 'วิญญาณสถาปนิกโค้ด: วิเคราะห์โครงสร้าง แก้ไข Bug และอัปเกรดระบบตัวเอง',
            instructions: codeArchitectMD,
            type: 'function'
        },
        {
            name: 'skill-manager',
            description: 'ระบบติดตั้งทักษะ: ค้นหา เรียนรู้ และสร้าง Skill.md ให้ตัวเองพัฒนาไม่หยุดยั้ง',
            instructions: skillManagerMD,
            type: 'function'
        }
    ];

    for (const skill of skills) {
        await db.collection('userActivities').doc(userId).collection('skills').doc(skill.name).set({
            ...skill,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`✅ Deep Updated Skill: ${skill.name}`);
    }
}

updateSkills().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
