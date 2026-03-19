const smartYT = require('./lib/actions/youtubeSmartController');

async function test() {
    try {
        console.log("Starting test...");
        const url = await smartYT.play_youtube_music("รักใครไม่เป็น");
        console.log("SUCCESS URL:", url);
        process.exit(0);
    } catch(err) {
        console.error("ERROR:", err);
        process.exit(1);
    }
}
test();
