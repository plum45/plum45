const axios = require('axios');

const url = 'https://script.google.com/macros/s/AKfycbyQkDizJKDUMPpFOlC1ow8XpTrVIcyGZnVUoRPmvVA870oWEH9LTTl8I4akF5VJbahiZQ/exec';
const testData = {
    action: 'ADD_CALENDAR',
    title: 'นัดสำเร็จแล้วจ้าเจ้านาย!',
    start: '2026-03-16T14:00:00Z',
    description: 'ทดสอบซิงค์ครั้งสุดท้ายแบบเด็ดขาด!'
};

async function testFinal() {
    try {
        console.log('--- FINAL TEST START ---');
        const res = await axios.post(url, testData);
        console.log('STATUS:', res.status);
        console.log('DATA:', JSON.stringify(res.data));
        console.log('--- FINAL TEST END ---');
    } catch (e) {
        console.log('--- FINAL TEST FAILED ---');
        console.log('MSG:', e.message);
        if (e.response) {
            console.log('CODE:', e.response.status);
            console.log('HTML SNIPPET:', String(e.response.data).substring(0, 200));
        }
    }
}

testFinal();
