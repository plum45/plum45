const { google } = require('googleapis');
const path = require('path');

async function listCalendars() {
    try {
        const keyPath = path.join(__dirname, 'google-calendar-key.json');
        const auth = new google.auth.GoogleAuth({
            keyFile: keyPath,
            scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
        });
        const calendar = google.calendar({ version: 'v3', auth });

        console.log('Listing available calendars...');
        const res = await calendar.calendarList.list();
        const calendars = res.data.items;

        if (!calendars || calendars.length === 0) {
            console.log('No calendars found. Did you share the calendar with the service account correctly?');
            return;
        }

        calendars.forEach((cal) => {
            console.log(`- ID: ${cal.id} | Summary: ${cal.summary} | AccessRole: ${cal.accessRole}`);
        });
    } catch (err) {
        console.error('Error listing calendars:', err.message);
    }
}

listCalendars();
