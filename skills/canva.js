const axios = require('axios');
const path = require('path');

/**
 * Canva Skill Module for Stacy
 * Handles template discovery and smart search.
 */
module.exports = async function handleCanvaAction({ ctx, data, userId, logToTerminal }) {
    // Handle various field names the AI might use
    const action = data.action || (data.template ? 'OPEN' : (data.query ? 'SEARCH' : 'SEARCH'));
    const query = data.query || data.template || '';
    const type = data.type || 'all'; 

    // Mapping of friendly types to Canva search categories
    const categoryMap = {
        'presentation': 'presentations',
        'poster': 'posters',
        'instagram': 'instagram-posts',
        'facebook': 'facebook-posts',
        'logo': 'logos',
        'video': 'videos'
    };

    const targetCategory = categoryMap[type.toLowerCase()] || '';
    let url = 'https://www.canva.com/';

    if (action === 'SEARCH') {
        // Construct search URL
        // Example: https://www.canva.com/search?q=minimalist%20presentation
        const encodedQuery = encodeURIComponent(query);
        url = `https://www.canva.com/search?q=${encodedQuery}`;
        if (targetCategory) {
            // Some categories have specific search paths in Canva
            // url = `https://www.canva.com/${targetCategory}/search?q=${encodedQuery}`;
        }
    } else if (action === 'TEMPLATE') {
        // Open specific category page
        url = targetCategory ? `https://www.canva.com/${targetCategory}/` : 'https://www.canva.com/templates/';
    }

    try {
        // Open the URL directly on the user's PC (Windows)
        const { exec } = require('child_process');
        exec(`start ${url}`);
        
        await ctx.reply(`🎨 **[Canva Designer]**\nหนูเปิด Canva สำหรับ **${query || type}** ให้เจ้านายบนเครื่องเรียบร้อยแล้วนะคะ! \n\n(หากไม่ขึ้น เจ้านายคลิกเองได้ที่นี่ค่ะ: ${url})`, { parse_mode: 'Markdown' });
        
        // Success log
        if (logToTerminal) {
            await logToTerminal(userId, 'CANVA_CONTROL', `Directly opened Canva URL: ${url}`);
        }
    } catch (err) {
        ctx.reply(`❌ ไม่สามารถเปิด Canva บนเครื่องได้: ${err.message}`);
    }
};
