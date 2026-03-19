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
const userId = '8245980204'; // Default User ID (Snow)

const musicMasterMD = `# Music Master Skill 🎵

This skill allows Stacy to control music playback and YouTube session on the Master's PC.

## Capabilities
- **YouTube Smart Discovery**: Open any video by specifying **topic** and **channel name** for precise results.
- **Media Control**: Toggle Play/Pause, Next Track, Previous Track, and Volume adjustments.
- **System-wide Support**: Controls any active media session (Chrome, Edge, Spotify, etc.) via PowerShell.

## Actions
- \`YOUTUBE_OPEN\`: {"topic": "what to watch", "channel": "specific channel", "query": "..."}
- \`MEDIA_CONTROL\`: {"action": "PLAY_PAUSE | NEXT | PREV | VOL_UP | VOL_DOWN | CLOSE"}

## Workflow
1. When the Master says "Play [topic] from [channel]", use \`YOUTUBE_OPEN\` with both fields.
2. When the Master says "Find a video about [topic]", use \`YOUTUBE_OPEN\` with topic.
3. When the Master says "Stop" or "Toggle", use \`MEDIA_CONTROL\` with \`PLAY_PAUSE\`.
4. When the Master says "ปิดเพลง" or "Close YouTube", use \`MEDIA_CONTROL\` with action \`CLOSE\` to close the tab directly.`;

async function updateMusicSkill() {
    const skill = {
        name: 'music-master',
        description: 'ดีเจสเตซี่ (Smart Edition): ค้นหาคลิป YouTube ตามหัวข้อและชื่อช่องที่ระบุ พร้อมคุมสื่อแบบอัจฉริยะ',
        instructions: musicMasterMD,
        type: 'function'
    };

    await db.collection('userActivities').doc(userId).collection('skills').doc(skill.name).set({
        ...skill,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`✅ Skill Installed: ${skill.name}`);
}

updateMusicSkill().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
