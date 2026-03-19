const axios = require('axios');
const fs = require('fs');

async function test() {
    try {
        console.log("Searching DDG Lite...");
        const res = await axios.post(`https://lite.duckduckgo.com/lite/`, 'q=' + encodeURIComponent('พยากรณ์อากาศที่ร้อยเอ็ด'), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        fs.writeFileSync('out.html', res.data);
        console.log("Written to out.html");
    } catch (e) {
        console.error("Error:", e.message);
    }
}
test();
