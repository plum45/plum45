const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

async function testConnection() {
    try {
        console.log('--- STARTING SERVICE ACCOUNT TEST ---');
        const keyPath = path.join(__dirname, 'google-calendar-key.json');
        
        const auth = new google.auth.GoogleAuth({
            keyFile: keyPath,
            scopes: ['https://www.googleapis.com/auth/calendar.events'],
        });
        
        const calendar = google.calendar({ version: 'v3', auth });
        
        // We will try to list calendars or events to see if we have access
        // Note: 'primary' for service account won't show the USER'S calendar.
        // But since the user shared their calendar, if we can insert an event 
        // into the service account's email as the calendarId, it often works or we use the user's email.
        
        const event = {
            summary: '🚀 Stacy Final Launch: ภารกิจพิชิตปฏิทินสำเร็จ!',
            description: 'ระบบเชื่อมต่อแบบ Service Account ทำงานสมบูรณ์แบบแล้วค่ะเจ้านาย!',
            start: { dateTime: new Date().toISOString() },
            end: { dateTime: new Date(Date.now() + 3600000).toISOString() },
        };

        // Try inserting into the service account's own calendar first to verify auth
        console.log('Attempting to insert event...');
        const res = await calendar.events.insert({
            calendarId: 'primary',
            resource: event,
        });

        console.log('✅ Success! Event created.');
        console.log('Event Link:', res.data.htmlLink);
        console.log('--- TEST COMPLETED ---');
    } catch (err) {
        console.error('--- TEST FAILED ---');
        console.error('Error Message:', err.message);
        if (err.errors) console.error('Details:', JSON.stringify(err.errors));
    }
}

testConnection();
