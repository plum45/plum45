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

async function addGoogleCalendarEvent(title, start, end, description = '') {
    try {
        const keyPath = path.join(__dirname, '../config/google-calendar-key.json');
        if (!fs.existsSync(keyPath)) throw new Error('Google Calendar key missing');
        
        const auth = new google.auth.GoogleAuth({
            keyFile: keyPath,
            scopes: ['https://www.googleapis.com/auth/calendar']
        });
        const calendar = google.calendar({ version: 'v3', auth });
        const calendarId = process.env.CALENDAR_ID || 'primary';
        
        const event = {
            summary: title,
            description: description,
            start: { dateTime: new Date(start).toISOString() },
            end: { dateTime: new Date(end).toISOString() },
        };
        
        const res = await calendar.events.insert({
            calendarId: calendarId,
            resource: event,
        });
        
        return res.data;
    } catch (e) {
        console.error('Add Calendar Event Error:', e.message);
        throw e;
    }
}

module.exports = { getGoogleCalendarEvents, addGoogleCalendarEvent };
