const google = require('googlethis');

async function test() {
    try {
        console.log("Searching with googlethis...");
        const response = await google.search('พยากรณ์อากาศที่ร้อยเอ็ด', {
            page: 0,
            safe: false,
            parse_ads: false,
            additional_params: { hl: 'th' }
        });
        console.log(`Found ${response.results.length} results.`);
        response.results.slice(0, 3).forEach(r => console.log(`- ${r.title}\n  ${r.description}`));
    } catch (e) {
        console.error("Error:", e.message);
    }
}
test();
