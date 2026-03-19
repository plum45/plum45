const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    try {
        console.log("Searching Yahoo...");
        const res = await axios.get(`https://search.yahoo.com/search?p=${encodeURIComponent('พยากรณ์อากาศที่ร้อยเอ็ด')}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        const $ = cheerio.load(res.data);
        const results = [];
        $('.algo-sr').each((i, el) => {
            const title = $(el).find('h3.title').text().trim();
            const description = $(el).find('.compText').text().trim() || $(el).find('.fc-falcon').text().trim() || $(el).find('div.compTitle ~ div').text().trim();
            if (title && description) {
                results.push({ title, description });
            }
        });
        console.log(`Found ${results.length} results.`);
        results.slice(0, 3).forEach(r => console.log(`- ${r.title}\n  ${r.description}`));
    } catch (e) {
        console.error("Error:", e.message);
    }
}
test();
