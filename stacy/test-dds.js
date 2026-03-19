const { search } = require('duck-duck-scrape');

async function test() {
    try {
        console.log("Searching with duck-duck-scrape...");
        const response = await search('พยากรณ์อากาศที่ร้อยเอ็ด');
        console.log(`Found ${response.results.length} results.`);
        response.results.slice(0, 3).forEach(r => console.log(`- ${r.title}\n  ${r.description}\n  ${r.url}`));
    } catch (e) {
        console.error("Error:", e.message);
    }
}
test();
