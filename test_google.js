const google = require('googlethis');

async function test() {
    console.log("Searching...");
    const res = await google.search('รักใครไม่เป็น youtube');
    console.log("RESULTS URLS:", res.results.map(r => r.url));
    if (res.videos) {
        console.log("VIDEOS URLS:", res.videos.map(v => v.url));
    }
}

test();
