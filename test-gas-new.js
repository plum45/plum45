const axios = require('axios');

const url = 'https://script.google.com/macros/s/AKfycbz4rjumVCw30t1N_8osEGIGVnMm5bsw4UMZIFIrDFneUcb1vTdmj0jWAU8IMgA0z9cOQQ/exec';
const testData = {
    action: 'ADD_CALENDAR',
    title: 'Test New Stacy Deployment',
    start: new Date().toISOString(),
    description: 'Testing the new sync connection'
};

async function testWebhook() {
    try {
        console.log('Sending test POST to NEW GAS Deployment...');
        const res = await axios.post(url, testData, {
            headers: { 'Content-Type': 'application/json' }
        });
        console.log('Response Status:', res.status);
        console.log('Response Data:', res.data);
    } catch (e) {
        console.error('Test Failed:', e.message);
        if (e.response) {
            console.error('Response Status:', e.response.status);
            console.error('Response Data:', e.response.data);
        }
    }
}

testWebhook();
