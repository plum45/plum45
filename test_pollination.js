const axios = require('axios');
const fs = require('fs');

async function test() {
    const prompt = 'cute dog';
    const seed = Math.floor(Math.random() * 1000000);
    const url = `https://pollinations.ai/p/${encodeURIComponent(prompt)}?width=1024&height=1024&seed=${seed}&model=flux&nologo=true`;
    
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
        console.log('First 8 bytes:', Buffer.from(response.data.slice(0, 8)).toString('hex'));
        
        fs.writeFileSync('test_pollination.bin', response.data);
    } catch (e) {
        console.error('Error:', e.message);
    }
}

test();
