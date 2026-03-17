const { google } = require('googleapis');
const path = require('path');

async function debugCalendarAccess() {
    const keyPath = path.join(__dirname, 'google-calendar-key.json');
    const auth = new google.auth.GoogleAuth({
        keyFile: keyPath,
        scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    });
    const calendar = google.calendar({ version: 'v3', auth });

    try {
        console.log('--- Checking Calendar Metadata ---');
        const calId = 'mocca007x@gmail.com';
        const metadata = await calendar.calendars.get({ calendarId: calId });
        console.log(`✅ Access Confirmed!`);
        console.log(`Summary: ${metadata.data.summary}`);
        console.log(`TimeZone: ${metadata.data.timeZone}`);
        
        console.log('\n--- Listing Recent Events ---');
        const now = new Date();
        const res = await calendar.events.list({
            calendarId: calId,
            timeMin: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(), // 24 hours ago
            maxResults: 5,
            singleEvents: true,
            orderBy: 'startTime',
        });
        
        const events = res.data.items;
        if (!events || events.length === 0) {
            console.log('No upcoming events found.');
        } else {
            events.forEach(e => console.log(`- [${e.start.dateTime || e.start.date}] ${e.summary}`));
        }
    } catch (err) {
        console.error('❌ Access Denied or Calendar Not Found:', err.message);
        if (err.message.includes('404')) {
            console.log('💡 ปัญหาชัดเจนค่ะ: หนูยังเข้าไม่ถึงปฏิทินนี้ รบกวนคุณ Snow แชร์ให้สิทธิ์ "Make changes to events" อีกทีนะคะ');
        }
    }
}

debugCalendarAccess();
