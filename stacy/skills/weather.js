const axios = require('axios');

module.exports = async function handleWeather({ ctx, data, userId, logToTerminal }) {
    try {
        const location = data.location || "Bangkok";
        // Added lang=th to get Thai descriptions from wttr.in
        const res = await axios.get(`https://wttr.in/${encodeURIComponent(location)}?format=j1&lang=th`);
        
        // wttr.in format=j1 usually wraps everything in a 'data' object
        const dataObj = res.data.data ? res.data.data : res.data;
        const weather = dataObj.current_condition[0];
        const area = dataObj.nearest_area[0];
        
        // Get Thai description if available, otherwise fallback to English
        const desc = weather.lang_th ? weather.lang_th[0].value : weather.weatherDesc[0].value;
        
        const report = `🌤️ **รายงานสภาพอากาศเรียลไทม์: ${location}**\n\n` +
            `📌 สถานที่: ${area.areaName[0].value}, ${area.country[0].value}\n` +
            `🌡️ อุณหภูมิ: ${weather.temp_C}°C (รู้สึกเหมือน ${weather.FeelsLikeC}°C)\n` +
            `☁️ สภาพอากาศ: ${desc}\n` +
            `💧 ความชื้น: ${weather.humidity}%\n` +
            `🌬️ ความเร็วลม: ${weather.windspeedKmph} km/h\n` +
            `🕒 ข้อมูลล่าสุดเมื่อ: ${weather.localObsDateTime}`;
        
        await ctx.reply(report);
        await logToTerminal(userId, 'GET_WEATHER', `Fetched weather for ${location}`);
    } catch (err) {
        console.error('Weather Error:', err);
        ctx.reply(`❌ ไม่สามารถดึงข้อมูลสภาพอากาศได้ค่ะ: ${err.message}`);
    }
};
