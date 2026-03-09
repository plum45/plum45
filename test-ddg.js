const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    const ddgRes = await axios.get('https://html.duckduckgo.com/html/?q=พยากรณ์อากาศที่ร้อยเอ็ด', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        },
        timeout: 8000
    });

    const $ = cheerio.load(ddgRes.data);
    const results = [];
    $('.result__snippet').each((i, el) => {
        const description = $(el).text().trim();
        const title = $(el).closest('.result').find('.result__title').text().trim();
        if (description.length > 5) results.push(`Title: ${title}\nDescription: ${description}`);
    });
    console.log("Length: " + results.length);
    console.log(results);
}

test();
