const axios = require('axios');

const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_API_KEY = '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';
const MODEL = 'qwen/qwen3.5-122b-a10b';

async function testModel() {
    console.log(`Testing model: ${MODEL}`);
    
    const payloads = [
        {
            name: "Basic request",
            data: {
                model: MODEL,
                messages: [{ role: 'user', content: 'Say hello' }],
                max_tokens: 100
            }
        },
        {
            name: "Request with enable_thinking: true",
            data: {
                model: MODEL,
                messages: [{ role: 'user', content: 'How are you?' }],
                max_tokens: 100,
                chat_template_kwargs: { enable_thinking: true }
            }
        },
        {
            name: "Request with enable_thinking: false",
            data: {
                model: MODEL,
                messages: [{ role: 'user', content: 'What is 2+2?' }],
                max_tokens: 100,
                chat_template_kwargs: { enable_thinking: false }
            }
        }
    ];

    for (const p of payloads) {
        console.log(`\n--- Running: ${p.name} ---`);
        try {
            const res = await axios.post(NVIDIA_API_URL, p.data, {
                headers: { 'Authorization': `Bearer ${NVIDIA_API_KEY}`, 'Accept': 'application/json' },
                timeout: 10000
            });
            console.log("Success! Status:", res.status);
            console.log("Response:", res.data.choices[0].message.content);
        } catch (e) {
            console.error("Failed!");
            if (e.response) {
                console.error("Status:", e.response.status);
                console.error("Data:", JSON.stringify(e.response.data, null, 2));
            } else {
                console.error("Message:", e.message);
            }
        }
    }
}

testModel();
