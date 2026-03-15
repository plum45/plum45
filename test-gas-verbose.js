const axios = require('axios');

const url = 'https://script.google.com/macros/s/AKfycbz4rjumVCw30t1N_8osEGIGVnMm5bsw4UMZIFIrDFneUcb1vTdmj0jWAU8IMgA0z9cOQQ/exec';
const testData = {
    action: 'ADD_CALENDAR',
    title: 'หนู Stacy มาแล้วจ้า!',
    start: '2026-03-16T10:00:00Z',
    description: 'ทดสอบการเชื่อมต่อแบบเด็ดขาด!'
};

async function testWebhook() {
    try {
        console.log('--- START TEST ---');
        console.log('Target URL:', url);
        const res = await axios.post(url, testData);
        console.log('STATUS:', res.status);
        console.log('DATA:', JSON.stringify(res.data));
        console.log('--- END TEST ---');
    } catch (e) {
        console.log('--- TEST FAILED ---');
        console.log('MSG:', e.message);
        if (e.response) {
            console.log('RES STATUS:', e.response.status);
            console.log('RES DATA:', e.response.data);
        }
    }
}

testWebhook();
