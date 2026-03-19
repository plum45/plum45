const axios = require('axios');
const fs = require('fs');

async function test() {
    const prompt = 'cute dog';
    const seed = Math.floor(Math.random() * 1000000);
    // Try the image subdomain and prompt path
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&seed=${seed}&model=flux&nologo=true`;
    
    console.log('Fetching:', url);
    try {
        const response = await axios.get(url, { 
            responseType: 'arraybuffer',
            timeout: 30000, 
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        
        console.log('Status:', response.status);
        console.log('Content-Type:', response.headers['content-type']);
        console.log('Length:', response.data.length);
        const headerHex = Buffer.from(response.data.slice(0, 8)).toString('hex');
        console.log('First 8 bytes:', headerHex);
        
        if (headerHex.startsWith('89504e47')) {
            console.log('Detected PNG');
        } else if (headerHex.startsWith('ffd8ff')) {
            console.log('Detected JPEG');
        } else if (headerHex.includes('52494646') && headerHex.includes('57454250')) {
             console.log('Detected WebP');
        }
        
    } catch (e) {
        console.error('Error:', e.message);
    }
}

test();
