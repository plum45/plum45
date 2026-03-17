const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

async function testCalendarInsert() {
    const keyPath = path.join(__dirname, 'serviceAccountKey.json');
    if (!fs.existsSync(keyPath)) {
        console.error('serviceAccountKey.json not found!');
        return;
    }

    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: keyPath,
            scopes: ['https://www.googleapis.com/auth/calendar.events'],
        });
        const calendar = google.calendar({ version: 'v3', auth });

        const calendarId = 'mocca007x@gmail.com'; 
        console.log(`Checking access to calendar: ${calendarId}`);

        const event = {
            summary: 'Stacy Connection Test',
            description: 'Checking if Stacy can write to Google Calendar',
            start: { dateTime: new Date().toISOString(), timeZone: 'Asia/Bangkok' },
            end: { dateTime: new Date(Date.now() + 3600000).toISOString(), timeZone: 'Asia/Bangkok' },
        };

        const res = await calendar.events.insert({
            calendarId: calendarId,
            resource: event,
        });

        console.log('✅ Success! Event created:', res.data.htmlLink);
    } catch (err) {
        console.error('❌ Error testing calendar:', err.message);
        if (err.message.includes('404') || err.message.includes('Not Found')) {
            console.log('\n💡 Tip: This usually means the calendar is not shared with the Service Account email.');
            console.log('Please share your calendar with the client_email found in google-calendar-key.json');
        }
    }
}

testCalendarInsert();
