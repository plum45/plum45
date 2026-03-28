const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { OpenAI } = require('openai');
require('dotenv').config({ path: path.join(__dirname, 'config/.env') });

const token = (process.env.TELEGRAM_TOKEN || "").trim();
const nvidiaKey = (process.env.NVIDIA_API_KEY || "").trim();
const snowId = "7211116238";

async function testConnectivity() {
    console.log("🧪 Starting Comprehensive Connectivity Test...");

    // 1. Test Telegram Send Message
    console.log("\n1️⃣ Testing Telegram [sendMessage]...");
    try {
        const res = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: snowId,
            text: "🧪 **Stacy System Diagnostic:** หนูกำลังทดสอบการส่งข้อความพื้นฐานค่ะ เจ้านายได้รับข้อความนี้ไหมคะ?"
        });
        console.log("✅ Telegram Send: SUCCESS");
    } catch (e) {
        console.error("❌ Telegram Send: FAILED", e.response ? e.response.data : e.message);
    }

    // 2. Test NVIDIA AI Engine
    console.log("\n2️⃣ Testing NVIDIA AI [completions]...");
    try {
        const client = new OpenAI({
            apiKey: nvidiaKey,
            baseURL: 'https://integrate.api.nvidia.com/v1'
        });
        const aiRes = await client.chat.completions.create({
            model: "mistralai/ministral-14b-instruct-2512",
            messages: [{ role: "user", content: "Say 'AI_WORKING'" }],
            max_tokens: 10
        });
        console.log("✅ NVIDIA AI: SUCCESS -", aiRes.choices[0].message.content);
    } catch (e) {
        console.error("❌ NVIDIA AI: FAILED", e.message);
    }

    // 3. Check Firestore
    console.log("\n3️⃣ Testing Firestore [Initialization]...");
    try {
        const { initFirebase } = require('./system/database');
        const { db, firebaseStatus } = initFirebase();
        console.log(`✅ Firestore Status: ${firebaseStatus}`);
        if (db) {
            const snap = await db.collection('userActivities').doc(snowId).get();
            console.log("✅ Firestore Read: SUCCESS (Doc exists:", snap.exists, ")");
        }
    } catch (e) {
        console.error("❌ Firestore: FAILED", e.message);
    }

    console.log("\n🏁 Diagnostic Finished.");
}

testConnectivity();
