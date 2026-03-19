const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

async function getGoogleCalendarEvents() {
    try {
        const keyPath = path.join(__dirname, '../config/google-calendar-key.json');
        if (!fs.existsSync(keyPath)) return [];
        
        const auth = new google.auth.GoogleAuth({
            keyFile: keyPath,
            scopes: ['https://www.googleapis.com/auth/calendar.readonly']
        });
        const calendar = google.calendar({ version: 'v3', auth });
        const calendarId = process.env.CALENDAR_ID || 'primary';
        
        const res = await calendar.events.list({
            calendarId: calendarId,
            timeMin: (new Date()).toISOString(),
            maxResults: 50,
            singleEvents: true,
            orderBy: 'startTime',
        });
        
        return res.data.items.map(item => ({
            id: item.id,
            title: item.summary,
            start: item.start.dateTime || item.start.date,
            end: item.end.dateTime || item.end.date,
            description: item.description || '',
            location: item.location || '',
            type: 'google'
        }));
    } catch (e) {
        console.error('Google Calendar Error:', e.message);
        return [];
    }
}

module.exports = { getGoogleCalendarEvents };
