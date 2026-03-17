const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

async function testCalendar() {
    const keyPath = path.join(__dirname, 'google-calendar-key.json');
    if (!fs.existsSync(keyPath)) {
        console.error("Key file not found");
        return;
    }

    const auth = new google.auth.GoogleAuth({
        keyFile: keyPath,
        scopes: ['https://www.googleapis.com/auth/calendar.events'],
    });

    const calendar = google.calendar({ version: 'v3', auth });
    const calendarId = 'mocca007x@gmail.com';

    try {
        console.log(`Testing calendar access for: ${calendarId}`);
        const res = await calendar.events.insert({
            calendarId: calendarId,
            resource: {
                summary: 'Test from Stacy Local',
                description: 'Checking if service account has access',
                start: { dateTime: new Date().toISOString(), timeZone: 'Asia/Bangkok' },
                end: { dateTime: new Date(Date.now() + 3600000).toISOString(), timeZone: 'Asia/Bangkok' },
            },
        });
        console.log(`✅ Success! Event created: ${res.data.htmlLink}`);
    } catch (err) {
        console.error(`❌ Failed: ${err.message}`);
        if (err.errors) console.error(JSON.stringify(err.errors, null, 2));
    }
}

testCalendar();
