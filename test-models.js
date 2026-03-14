const axios = require('axios');

const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_API_KEY = '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'; // User's key

async function checkModels() {
    const models = ['z-ai/glm5', 'nvidia/qwen3.5-35b-a3b', 'nvidia/qwen3.5-122b-a10b'];
    
    for (const m of models) {
        console.log(`Checking model: ${m}...`);
        try {
            const res = await axios.post(NVIDIA_API_URL, {
                model: m,
                messages: [{ role: 'user', content: 'hi' }],
                max_tokens: 10
            }, {
                headers: { 'Authorization': `Bearer ${NVIDIA_API_KEY}`, 'Accept': 'application/json' },
                timeout: 10000
            });
            console.log(`✅ ${m} is available! Status: ${res.status}`);
        } catch (e) {
            console.error(`❌ ${m} failed! Status: ${e.response?.status || 'No response'}`);
            if (e.response?.data) console.error("Data:", JSON.stringify(e.response.data));
        }
    }
}

checkModels();
