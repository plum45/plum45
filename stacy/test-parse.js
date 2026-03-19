const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    try {
        console.log("Searching DDG Lite...");
        const res = await axios.post(`https://lite.duckduckgo.com/lite/`, 'q=' + encodeURIComponent('ร้อยเอ็ด ฝนตกไหม'), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        const $ = cheerio.load(res.data);
        const results = [];
        $('.result-snippet').each((i, el) => {
            const description = $(el).text().trim();
            const title = $(el).parent().prev().find('.result-link').text().trim();
            if (description.length > 5) results.push(`Title: ${title}\nDescription: ${description}`);
        });
        console.log(`Found ${results.length} results.`);
        console.log(results.slice(0, 3));
    } catch (e) {
        console.error("Error:", e.message);
    }
}
test();
