const formHelper = require('./lib/actions/formHelper');
const path = require('path');
const fs = require('fs');

// Mock context for the runner
const ctx = {
    reply: async (msg) => console.log('💬 REPLY:', msg),
    telegram: {
        editMessageText: async () => console.log('✏️ EDITING MESSAGE...')
    }
};

const sendSmartImage = async (ctx, imgPath, caption) => {
    console.log('🖼️ IMAGE SAVED AT:', imgPath);
    console.log('📝 CAPTION:', caption);
};

const logToTerminal = async (userId, action, msg) => console.log(`[LOG] ${userId} ${action}: ${msg}`);

const data = {
    url: 'https://docs.google.com/forms/d/e/1FAIpQLSfYiyfmCILD8zFISEWgwnyiZ2moBjZc4keSy-8mPyBcBmRLcw/viewform',
    suggestion: `🧠 **บทวิเคราะห์ Brain-Based Learning (BBL)**

1. **ข้อใดคือการเรียนรู้โดยใช้สมองเป็นฐาน**
   - 💡 เลือก: **Brain-based Learning**

2. **ข้อใดเป็นการจัดการเรียนรู้โดยใช้สมองเป็นฐาน**
   - 💡 เลือก: **สมองนั้นทำงานพร้อมกันหลายๆ ส่วน ซึ่งสมองจะเกิดการเรียนรู้ได้ดีในสภาพแวดล้อมที่มีสิ่งเร้าอย่างหลากหลาย**

3. **หลักการ BBL** เน้นสภาพแวดล้อมที่ผ่อนคลายและมีความท้าทายที่เหมาะสมค่ะ!`
};

formHelper({ ctx, data, userId: 'runner', sendSmartImage, logToTerminal })
    .then(() => console.log('✅ Runner finished'))
    .catch(err => console.error('❌ Runner error:', err));
