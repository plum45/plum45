const axios = require('axios');

const NVIDIA_API_KEY = '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';

async function listModels() {
    try {
        const res = await axios.get('https://integrate.api.nvidia.com/v1/models', {
            headers: { 'Authorization': `Bearer ${NVIDIA_API_KEY}` }
        });
        console.log("Available Models:");
        res.data.data.forEach(m => {
            if (m.id.toLowerCase().includes('qwen') || m.id.toLowerCase().includes('glm')) {
                console.log(`- ${m.id}`);
            }
        });
    } catch (e) {
        console.error("Failed to list models:", e.response?.status, e.message);
        if (e.response?.data) console.error(JSON.stringify(e.response.data));
    }
}

listModels();
