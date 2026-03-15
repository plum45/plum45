const axios = require('axios');

const url = 'https://script.google.com/macros/s/AKfycbw-CcIsl9j8sGhaCz8VLaLgqcCWkDyduEUiAIrZENk3wXyPRpkdJXKmKITSvFpIyMt-ww/exec';
const testData = {
    title: 'Test Appointment from Stacy',
    time: new Date().toISOString(),
    description: 'Testing the sync connection'
};

async function testWebhook() {
    try {
        console.log('Sending test POST to GAS...');
        const res = await axios.post(url, testData, {
            headers: { 'Content-Type': 'application/json' }
        });
        console.log('Response Status:', res.status);
        console.log('Response Data:', res.data);
    } catch (e) {
        console.error('Test Failed:', e.message);
        if (e.response) {
            console.error('Response Status:', e.response.status);
            console.error('Response Headers:', e.response.headers);
        }
    }
}

testWebhook();
