const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

const API_KEY = process.env.NVIDIA_API_KEY;

async function testNvidiaImage() {
    console.log('Testing NVIDIA NIM Image Generation...');
    try {
        const response = await axios.post(
            'https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-xl',
            {
                text_prompts: [{ text: "a beautiful sunset over a futuristic city", weight: 1 }],
                cfg_scale: 7,
                seed: 0,
                steps: 30,
                width: 1024,
                height: 1024
            },
            {
                headers: {
                    "Accept": "application/json",
                    "Authorization": `Bearer ${API_KEY}`
                }
            }
        );

        if (response.data && response.data.artifacts && response.data.artifacts.length > 0) {
            const base64Data = response.data.artifacts[0].base64;
            const buffer = Buffer.from(base64Data, 'base64');
            fs.writeFileSync('test_nvidia.png', buffer);
            console.log('✅ Success! Image saved to test_nvidia.png');
        } else {
            console.log('❌ Unexpected response format:', response.data);
        }
    } catch (e) {
        console.error('❌ Error:', e.response ? e.response.data : e.message);
    }
}

testNvidiaImage();
