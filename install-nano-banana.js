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

const nanoBananaProMD = `# Nano Banana Pro (Gemini 3 Pro Artist) 🎨🍌

This skill enables Stacy to generate ultra-high-quality images using the Gemini 3 Pro Image model. It is more powerful than the standard generator.

## Capabilities
- **Ultra-HQ Generation**: High-resolution (1K, 2K, 4K) image creation.
- **Image Editing**: Can take an input image and modify it based on prompts.
- **Creative Control**: Deep understanding of complex lighting, textures, and artistic styles.

## How to use (Internal Logic)
1. **Identify**: Use when master asks for "Nano Banana Pro" or "วาดรูปสวยๆ/ระดับโปร".
2. **Execute**: Use \`EXECUTE_COMMAND\` to run the Python script.
   - Command: \`uv run c:\\Users\\lgopl\\.codex\\skills\\nano-banana-pro\\scripts\\generate_image.py -p "PROMPT" -f "output.png" -r "1K"\`
3. **Delivery**: Use \`SCREEN_CAPTURE\` or \`READ_FILE\` logic (Stacy already handles this if the file is in her workspace).

## Guidance
- Use for masterpiece-level requests.
- Always inform the Boss when 'Nano Banana Pro' is being summoned.`;

async function addNanoBanana() {
    await db.collection('userActivities').doc(userId).collection('skills').doc('nano-banana-pro').set({
        name: 'nano-banana-pro',
        description: 'ศิลปินระดับโปร: เจนภาพล้ำสมัยด้วย Gemini 3 Pro Image (สวยกว่า คมกว่า)',
        instructions: nanoBananaProMD,
        type: 'function',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('✅ Installed Nano Banana Pro Skill');
}

addNanoBanana().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
