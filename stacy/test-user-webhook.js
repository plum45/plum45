const axios = require('axios');
const webhookUrl = 'https://script.google.com/macros/s/AKfycbyQkDizJKDUMPpFOlC1ow8XpTrVIcyGZnVUoRPmvVA870oWEH9LTTl8I4akF5VJbahiZQ/exec';

async function test() {
    try {
        console.log('Testing Webhook:', webhookUrl);
        const res = await axios.post(webhookUrl, {
            action: 'ADD_CALENDAR',
            title: 'Stacy Webhook Test',
            start: new Date().toISOString(),
            description: 'Direct test from dashboard'
        });
        console.log('Result:', res.data);
    } catch (e) {
        console.error('Error:', e.message);
    }
}
test();
