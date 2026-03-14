require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const cron = require('node-cron');
const cheerio = require('cheerio');
const admin = require('firebase-admin');
const fs = require('fs');
const { Telegraf } = require('telegraf');

// ========== Global Bot Status ==========
let tgBotStatus = "Initializing";
let tgBotError = null;
const IS_RENDER = !!process.env.RENDER;
const RENDER_URL = process.env.RENDER_EXTERNAL_URL; // e.g., https://qwen-chat.onrender.com

const adminConfig = { projectId: "ai--agent-12d7a" };
try {
    const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
    if (fs.existsSync(serviceAccountPath)) {
        adminConfig.credential = admin.credential.cert(require(serviceAccountPath));
        if (admin.apps.length === 0) admin.initializeApp(adminConfig);
        console.log("✅ Firebase Admin: Cloud Sync Enabled");
    } else {
        if (admin.apps.length === 0) admin.initializeApp({ projectId: adminConfig.projectId });
        console.log("ℹ️ Firebase Admin: Local Mode (No Credentials)");
    }
} catch (e) {
    if (admin.apps.length === 0) admin.initializeApp({ projectId: adminConfig.projectId });
    console.log("ℹ️ Firebase Admin: Minimal Mode");
}
const db = admin.firestore();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ========== Telegram Bot Setup (Render/Vercel Compatible) ==========
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const bot = TELEGRAM_TOKEN ? new Telegraf(TELEGRAM_TOKEN) : null;
const tgContexts = new Map();

// ========== Long-term Memory Logic ==========
async function getBotMemory(userId) {
    try {
        const doc = await db.collection('botMemories').doc(String(userId)).get();
        return doc.exists ? doc.data().facts || [] : [];
    } catch (e) { return []; }
}

async function saveBotMemory(userId, userMsg, botReply) {
    try {
        // Extract 1-3 key facts about the user in the background
        const res = await axios.post(NVIDIA_API_URL, {
            model: 'qwen/qwen2.5-7b-instruct',
            messages: [
                { role: 'system', content: 'Identify 1-3 important details about the user. STIRCTLY USE THAI (ภาษาไทยเท่านั้น). NO CHINESE CHARACTERS.' },
                { role: 'user', content: `Message: ${userMsg}\nResponse: ${botReply}` }
            ],
            max_tokens: 150
        }, { headers: { 'Authorization': `Bearer ${NVIDIA_API_KEY}` }, timeout: 5000 });

        const extracted = res.data.choices[0].message.content.split('\n').filter(l => l.includes('-')).map(l => l.trim());
        if (extracted.length > 0) {
            const memRef = db.collection('botMemories').doc(String(userId));
            const current = await memRef.get();
            let facts = current.exists ? current.data().facts || [] : [];
            facts = [...new Set([...facts, ...extracted])].slice(-20); // Keep last 20 memories
            await memRef.set({ facts, updatedAt: new Date() }, { merge: true });
            console.log(`🧠 Memory Updated for ${userId}: ${extracted.length} new facts`);
        }
    } catch (e) { console.error('Memory Save Error:', e.message); }
}

if (bot) {
    bot.start((ctx) => ctx.reply('สวัสดีครับ! ผมคือ GLM AI Agent ยินดีที่ได้รู้จักครับ (Super Stable Mode)'));
    
    // Webhook Route
    app.post('/api/telegram-webhook', async (req, res) => {
        try {
            await bot.handleUpdate(req.body, res);
        } catch (err) {
            console.error('Webhook Error:', err);
            if (!res.writableEnded) res.status(200).send('OK');
        }
    });

    // 1. Connectivity Commands
    bot.command('ping', (ctx) => ctx.reply('Pong! 🏓 ระบบออนไลน์ปกติครับ'));
    bot.on('text', async (ctx) => {
        const userId = ctx.from.id;
        const userMsg = ctx.message.text;
        if (userMsg.toLowerCase() === 'test') return ctx.reply('✅ Infrastructure Link: OK');

        await ctx.sendChatAction('typing');
        
        try {
            // --- PILLAR 1 & 3: PERCEPTION & STATE ---
            if (!tgContexts.has(userId)) tgContexts.set(userId, { history: [], state: 'idle' });
            const userStore = tgContexts.get(userId);
            
            // --- PILLAR 2: MEMORY ARCHITECTURE (Long-term Recall) ---
            const [personalFacts, searchData] = await Promise.all([
                getBotMemory(userId),
                (async () => {
                    const isWeather = /อากาศ|ฝน|ตกไหม|พยากรณ์|weather|temp/i.test(userMsg);
                    const isNews = /ข่าว|ล่าสุด|news|update/i.test(userMsg);
                    if (isWeather || isNews || userMsg.length > 20) return await performSearch(userMsg);
                    return "";
                })()
            ]);

            // --- PILLAR 2: REASONING & PLANNING (Chain-of-Thought) ---
            const now = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
            const promptMessages = [
                { role: 'system', content: `[CORE ROLE]: You are a Reasoning AI Agent (Architecture Pillar 2).
                [CURRENT CONTEXT]: Time is ${now}. 
                [STATE]: ${userStore.state}
                
                [MEMORY]: User facts: ${personalFacts.join(' | ')}
                [INPUT/SEARCH]: ${searchData || "No new data."}

                [REASONING GUIDELINES]:
                1. Task Decomposition: Understand the goal.
                2. Self-Correction: Ensure facts match the current date.
                3. Connectivity: Maintain context with previous chats.
                4. LANGUAGE RULE: REPLY ONLY IN THAI (ภาษาไทย). 
                5. ABSOLUTE FORBIDDEN: DO NOT use Chinese characters (中文), even for technical terms.
                6. PERSONALITY: Use "ครับ" for politeness.` },
                ...userStore.history.slice(-8),
                { role: 'user', content: userMsg }
            ];

            // --- PILLAR 1: PROCESSING ENGINE (Probabilistic Logic via Qwen Turbo) ---
            const response = await axios.post(NVIDIA_API_URL, {
                model: 'qwen/qwen2.5-7b-instruct',
                messages: promptMessages,
                temperature: 0.7,
                max_tokens: 1024
            }, {
                headers: { 'Authorization': `Bearer ${NVIDIA_API_KEY}`, 'Content-Type': 'application/json' },
                timeout: 20000 
            });

            const reply = response.data.choices[0].message.content;
            if (!reply) throw new Error("Processing logic failed to yield output.");

            // --- PILLAR 4 & 5: SYSTEM SAFEGUARDS & STATE UPDATE ---
            userStore.history.push({ role: 'user', content: userMsg }, { role: 'assistant', content: reply });
            if (userStore.history.length > 20) userStore.history.splice(0, 2);
            
            // Operational Feedback Loop: Learn from this interaction
            saveBotMemory(userId, userMsg, reply);

            // Output Delivery
            if (reply.length > 4000) {
                const chunks = reply.match(/[\s\S]{1,4000}/g) || [];
                for (const chunk of chunks) await ctx.reply(chunk);
            } else {
                await ctx.reply(reply);
            }
            console.log(`📡 [PILLAR 5] Scalable Session Processed for User: ${userId}`);

        } catch (e) {
            console.error('❌ [PILLAR 4] Guardrail Error:', e.message);
            await ctx.reply('⚠️ ระบบ Thinking Loop เกิดข้อผิดพลาดชั่วคราว รบกวนลองใหม่อีกครั้งครับ');
        }
    });
}

// ========== Config (use ENV for security) ==========
const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_API_KEY = (process.env.NVIDIA_API_KEY && process.env.NVIDIA_API_KEY.length > 10) 
    ? process.env.NVIDIA_API_KEY 
    : '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';
const OPENAQ_API_KEY = process.env.OPENAQ_API_KEY || 'YOUR-OPENAQ-API-KEY'; // Replace with your key
const OPENAQ_API_URL = 'https://api.openaq.org/v3';
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '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';
const TAVILY_API_URL = 'https://api.tavily.com/search';

const DEFAULT_MODEL = 'z-ai/glm5';

const SYSTEM_PROMPT_CODING = `You are Qwen, an expert AI coding agent built on Qwen 3.5-122B. You are a pair programmer and software architect who writes production-ready code.

## Identity & Behavior:
- You are an AI **agent** — proactive, thorough, and code-first.
- When asked to build something, you write the **complete, working code** — not pseudocode or partial snippets.
- You think step-by-step before coding, considering architecture, edge cases, and best practices.
- You respond in the same language the user writes in (e.g., Thai → Thai, English → English). DO NOT use Chinese characters unless specifically asked.

## Code Writing Rules:
1. **Always write complete, runnable code** — never leave TODOs or placeholders unless asked.
2. **Include clear comments** explaining non-obvious logic.
3. **Handle errors and edge cases** — validate inputs, catch exceptions, provide fallbacks.
4. **Follow modern best practices** — use TypeScript types when relevant, proper naming conventions, SOLID principles.
5. **Use code blocks with language tags** (e.g., \`\`\`python, \`\`\`typescript, \`\`\`sql).
6. **For multi-file projects**, write each file in its own code block with the filename as a comment on the first line.

## Agent Capabilities:
- **Build full applications**: When asked, scaffold entire projects with all necessary files.
- **Debug & fix**: Identify root causes, explain the bug, show the fix with before/after.
- **Refactor**: Suggest architectural improvements and cleaner patterns.
- **Explain**: Break down complex systems with diagrams (using markdown), tables, and analogies.
- **Review code**: Point out bugs, security issues, performance problems, and suggest fixes.
- **Real-time Data**: If [CRITICAL REAL-TIME DATA] is provided, YOU MUST use it. If you are asked about real-time events (weather, news, stocks) and NO search context is provided or search failed, clearly state that you do not have live access to that information currently instead of using outdated training data.

## Response Format:
- Start with a **brief explanation** of your approach (1-3 sentences).
- Then provide the **complete code** in tagged code blocks.
- End with **key notes** about the implementation.
- Use **bold** for emphasis, \`inline code\` for technical terms.
- Use tables for comparisons, numbered lists for steps.
- Use > blockquotes for warnings or important notes.`;

const SYSTEM_PROMPT_AGENT = `You are Qwen, a highly intelligent and helpful AI assistant built on Qwen 3.5-122B. Your primary goal is to help users with their general queries, answer questions accurately, and converse naturally.

## Identity & Behavior:
- You are a knowledgeable assistant. You answer clearly and concisely.
- Do NOT generate code unless explicitly asked by the user to do so. Focus on answering the question directly.
- You think step-by-step to provide accurate and detailed answers.
- You respond in the same language the user writes in (e.g., Thai → Thai, English → English). 
- FORBIDDEN: NEVER use Chinese characters (中文).
- Be polite, professional, and helpful. Use Thai particles like "ครับ" for politeness.
- CRITICAL: You MUST compare [CURRENT DATE & TIME] with any search results you find. If you find data for a different year or month than the current one, inform the user it is old.
- For weather/news: Only use [CRITICAL REAL-TIME DATA]. If search returns no current results, tell the user you don't have up-to-the-minute information.

## Response Format:
- Use Thai (ภาษาไทย) as primary language.
- Use simple, easy-to-read formatting.
- Use **bold** for emphasis.
- Use tables or bullet points for structured data.`;

// ========== Context Management ==========
function trimMessages(messages, maxChars = 100000) {
    if (!messages || messages.length === 0) return [];

    // Always keep the first user message (topic anchor)
    const firstUserMsg = messages.find(m => m.role === 'user');

    // Calculate total chars
    let totalChars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);

    // If everything fits, return as-is
    if (totalChars <= maxChars) return messages;

    // Strategy: keep first user msg + as many recent messages as possible
    const result = [];
    let usedChars = 0;

    // Collect recent messages (from newest to oldest)
    const recentMsgs = [];
    for (let i = messages.length - 1; i >= 0; i--) {
        const msgLen = messages[i].content?.length || 0;
        if (usedChars + msgLen > maxChars * 0.85 && recentMsgs.length >= 6) break;
        usedChars += msgLen;
        recentMsgs.unshift(messages[i]);
    }

    // Check if first user message is already included
    const firstMsgIncluded = firstUserMsg && recentMsgs.some(
        m => m.role === firstUserMsg.role && m.content === firstUserMsg.content
    );

    // Count how many messages were trimmed
    const trimmedCount = messages.length - recentMsgs.length;

    if (trimmedCount > 0) {
        // Summarize what was cut
        const trimmedMsgs = messages.slice(0, messages.length - recentMsgs.length);
        const topics = trimmedMsgs
            .filter(m => m.role === 'user')
            .map(m => m.content.substring(0, 80))
            .slice(0, 5);

        const summaryText = `[CONVERSATION CONTEXT: This chat has ${messages.length} messages total. ` +
            `The earlier ${trimmedCount} messages were condensed. ` +
            `Earlier topics discussed: ${topics.join(' | ')}. ` +
            `Continue the conversation naturally, maintaining awareness of previous context.]`;

        result.push({ role: 'user', content: summaryText });
        result.push({ role: 'assistant', content: 'Understood. I remember our earlier discussion and will maintain continuity.' });

        // Add first user message if not in recent (for topic memory)
        if (!firstMsgIncluded && firstUserMsg) {
            result.push({ role: 'user', content: `[Original first message]: ${firstUserMsg.content.substring(0, 300)}` });
            result.push({ role: 'assistant', content: 'I recall this was how our conversation started.' });
        }
    }

    result.push(...recentMsgs);
    return result;
}

// ========== Server-Side Scheduler ==========
let activeJobs = {};

function loadSchedules() {
    setupCronJobs();
}

function setupCronJobs() {
    // Clear existing jobs
    Object.values(activeJobs).forEach(job => job.stop());
    activeJobs = {};

    db.collection('schedules').where('active', '==', true).get().then(snapshot => {
        snapshot.forEach(doc => {
            const s = { id: doc.id, ...doc.data() };
            if (!s.time) return;
            const [hour, min] = s.time.split(':').map(Number);
            const cronExpr = `${min} ${hour} * * *`;

            if (cron.validate(cronExpr)) {
                activeJobs[s.id] = cron.schedule(cronExpr, async () => {
                    console.log(`⏰ Running scheduled task: "${s.query}" at ${s.time}`);
                    try {
                        const result = await runQuery(s.query);
                        await db.collection('schedules').doc(s.id).update({
                            lastRun: new Date().toISOString(),
                            lastResult: result.substring(0, 2000)
                        });
                        console.log(`✅ Scheduled task completed: "${s.query}"`);
                    } catch (e) {
                        console.error(`❌ Scheduled task failed: ${e.message}`);
                    }
                }, { timezone: 'Asia/Bangkok' });
            }
        });
    }).catch(e => console.error("Error loading schedules:", e.message));
}

async function getAirQuality(locationIdOrCity) {
    if (!OPENAQ_API_KEY || OPENAQ_API_KEY === 'YOUR-OPENAQ-API-KEY') return null;
    try {
        console.log(`🌍 Fetching Air Quality for: ${locationIdOrCity}`);
        // If it's a number, assume location ID, otherwise search for locations in city
        let locationId = locationIdOrCity;
        if (isNaN(locationIdOrCity)) {
            const locRes = await axios.get(`${OPENAQ_API_URL}/locations?limit=1&countries_id=141&city=${encodeURIComponent(locationIdOrCity)}`, {
                headers: { 'X-API-Key': OPENAQ_API_KEY }
            });
            if (locRes.data.results?.length > 0) {
                locationId = locRes.data.results[0].id;
            } else return null;
        }

        const res = await axios.get(`${OPENAQ_API_URL}/locations/${locationId}/latest`, {
            headers: { 'X-API-Key': OPENAQ_API_KEY }
        });

        const data = res.data.results;
        if (!data || data.length === 0) return "No recent air quality data available for this location.";

        return data.map(r => `${r.parameter.displayName}: ${r.value} ${r.parameter.units}`).join('\n');
    } catch (e) {
        console.error("OpenAQ Error:", e.response?.data || e.message);
        return null;
    }
}

async function callNvidiaAPI({ model, messages, max_tokens, temperature, top_p, stream = false, enable_thinking = false }) {
    const payload = {
        model: model || DEFAULT_MODEL,
        messages,
        max_tokens: max_tokens || 4096,
        temperature: temperature ?? 1,
        top_p: top_p ?? 1,
        stream,
        chat_template_kwargs: { enable_thinking, clear_thinking: false },
    };

    return axios.post(NVIDIA_API_URL, payload, {
        headers: {
            'Authorization': `Bearer ${NVIDIA_API_KEY}`,
            'Accept': stream ? 'text/event-stream' : 'application/json'
        },
        responseType: stream ? 'stream' : 'json',
        timeout: stream ? 120000 : 30000,
    });
}

async function runQuery(query) {
    try {
        const response = await callNvidiaAPI({
            messages: [
                { role: 'system', content: SYSTEM_PROMPT_AGENT },
                { role: 'user', content: query },
            ]
        });
        return response.data?.choices?.[0]?.message?.content || 'No response';
    } catch (e) {
        console.error("runQuery Error:", e.message);
        return 'Error running query';
    }
}

// ========== Schedule API Endpoints ==========
app.get('/api/schedules', async (req, res) => {
    try {
        const snap = await db.collection('schedules').get();
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        res.json(docs);
    } catch (e) { res.status(500).json([]); }
});

app.post('/api/schedules', async (req, res) => {
    const { time, query } = req.body;
    if (!time || !query) return res.status(400).json({ error: 'time and query required' });
    try {
        const sched = {
            time, query, active: true,
            createdAt: new Date().toISOString(),
            lastRun: null, lastResult: null
        };
        const doc = await db.collection('schedules').add(sched);
        setupCronJobs();
        res.json({ id: doc.id, ...sched });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/schedules/:id', async (req, res) => {
    try {
        const updates = {};
        if (req.body.active !== undefined) updates.active = req.body.active;
        if (req.body.time) updates.time = req.body.time;
        if (req.body.query) updates.query = req.body.query;
        await db.collection('schedules').doc(req.params.id).update(updates);
        setupCronJobs();
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/schedules/:id', async (req, res) => {
    try {
        await db.collection('schedules').doc(req.params.id).delete();
        setupCronJobs();
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== Bot Status Endpoint ==========
app.get('/api/telegram-status', (req, res) => {
    res.json({
        status: tgBotStatus,
        error: tgBotError,
        token_found: !!process.env.TELEGRAM_TOKEN,
        mode: process.env.VERCEL ? 'Webhook (Vercel)' : 'Polling (Local)',
        setup_url: process.env.VERCEL ? `${req.protocol}://${req.get('host')}/api/telegram-setup` : null
    });
});

// ========== Webhook Setup Endpoint (Run once after deploy) ==========
app.get('/api/telegram-setup', async (req, res) => {
    if (!process.env.TELEGRAM_TOKEN) return res.send("Error: TELEGRAM_TOKEN missing in Environment Variables");
    try {
        const host = req.get('host');
        const webhookUrl = `https://${host}/api/telegram-webhook`;
        const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
        await bot.telegram.setWebhook(webhookUrl);
        res.send(`✅ Webhook registration successful! Bot will now receive messages at: ${webhookUrl}`);
    } catch (e) {
        res.status(500).send(`❌ Webhook failed: ${e.message}`);
    }
});

// ========== Reusable Search Function ==========
async function performSearch(userQuery) {
    try {
        console.log(`🌐 Performing Multi-Stage Real-time Search for: "${userQuery}"`);
        const isWeatherQuery = /สภาพอากาศ|ฝน|ตกไหม|พยากรณ์|weather|rain|temp|อุณหภูมิ/i.test(userQuery);
        let weatherData = "";
        let searchResults = [];

        // 1. Precise Weather (Geocoding + Open-Meteo)
        if (isWeatherQuery) {
            try {
                // Improved City Extraction: Remove common keywords and find the city
                let city = "";
                const cleanForCity = userQuery.replace(/สภาพอากาศ|อากาศ|เช็ค|ดู|พยากรณ์|วันนี้|เย็นนี้|พรุ่งนี้|ตอนนี้/g, "").trim();
                const cityMatch = cleanForCity.match(/(?:ที่|ใน|เมือง|แถว|จังหวัด)?\s*([ก-๙a-zA-Z\s]{2,})/);
                
                if (cityMatch) {
                    city = cityMatch[1].trim();
                } else {
                    city = cleanForCity || "Bangkok";
                }

                console.log(`📍 Extracted City: "${city}" for query: "${userQuery}"`);

                const geoRes = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city)}&limit=1`, {
                    headers: { 'User-Agent': 'QwenChat/1.0' },
                    timeout: 5000
                });
                if (geoRes.data?.length > 0) {
                    const { lat, lon, display_name } = geoRes.data[0];
                    const wRes = await axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,showers,weather_code,cloud_cover,wind_speed_10m&timezone=auto`, { timeout: 5000 });
                    const cur = wRes.data.current;
                    weatherData = `[EXACT WEATHER DATA for ${display_name}]:
- Current Temp: ${cur.temperature_2m}°C (Feels like ${cur.apparent_temperature}°C)
- Humidity: ${cur.relative_humidity_2m}%
- Condition: ${cur.rain > 0 ? 'Rainy' : cur.showers > 0 ? 'Showers' : cur.cloud_cover > 50 ? 'Cloudy' : 'Clear'}
- Wind: ${cur.wind_speed_10m} km/h
(Data as of: ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })})\n\n`;
                }
            } catch (e) { console.error('Weather logic failed:', e.message); }
        }

        // Bypass search for very short messages or greetings
        if (userQuery.length < 5 || /สวัสดี|hi|hello|ดีครับ|ดีค่ะ/i.test(userQuery)) {
            return "";
        }

        // 2. Tavily AI Search (AI-optimized, no scraping needed)
        try {
            const tavilyRes = await axios.post(TAVILY_API_URL, {
                api_key: TAVILY_API_KEY,
                query: userQuery,
                search_depth: "basic",
                max_results: 3
            }, { timeout: 5000 });

            if (tavilyRes.data?.results) {
                tavilyRes.data.results.forEach(r => {
                    searchResults.push(`[Source: ${r.url}] ${r.title}: ${r.content}`);
                });
            }
        } catch (e) {
            console.error('Tavily Search Failed:', e.message);
            searchResults.push(`[SYSTEM NOTE: Tavily Search failed. Fallback to general knowledge.]`);
        }

        if (weatherData || searchResults.length > 0) {
            return `\n\n[CRITICAL REAL-TIME DATA]:\n${weatherData}${searchResults.join('\n\n')}\n`;
        }
        return `\n\n[SYSTEM NOTE: Search returned no results.]\n`;
    } catch (e) {
        return `\n\n[SYSTEM NOTE: Search FAILED due to technical error.]\n`;
    }
}

// ========== Chat Endpoint with Retry ==========
app.post('/api/chat', async (req, res) => {
    const { messages, temperature = 0.6, top_p = 0.95, max_tokens = 16384, enable_thinking = true, web_search = false, mode = 'coding' } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'Messages array is required' });
    }

    let searchContextStr = "";

    if (web_search) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.role === 'user') {
            searchContextStr = await performSearch(lastMsg.content);
        }
    }

    const trimmedMessages = trimMessages(messages);
    const selectedPrompt = mode === 'agent' ? SYSTEM_PROMPT_AGENT : SYSTEM_PROMPT_CODING;
    const toolsPrompt = !process.env.VERCEL ? FILE_TOOLS_PROMPT : '';

    // Calculate current time in Thailand
    const now = new Date();
    const thaiTime = now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'full', timeStyle: 'medium' });
    const timeContext = `\n\n[CURRENT DATE & TIME]: ${thaiTime}\n`;

    const fullMessages = [
        { role: 'system', content: selectedPrompt + toolsPrompt + timeContext + searchContextStr },
        ...trimmedMessages
    ];

    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await callNvidiaAPI({
                model: req.body.model,
                messages: fullMessages,
                max_tokens, temperature, top_p,
                stream: true,
                enable_thinking
            });

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache, no-store');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');
            res.flushHeaders();

            response.data.on('data', chunk => res.write(chunk));
            response.data.on('end', () => res.end());
            response.data.on('error', err => { console.error('Stream error:', err.message); res.end(); });
            req.on('close', () => response.data.destroy());
            return;
        } catch (error) {
            console.error(`Attempt ${attempt + 1} failed:`, error.response?.status, error.message);
            if (attempt === maxRetries) {
                const status = error.response?.status || 500;
                const message = error.response?.data?.error || error.message || 'Internal server error';
                if (!res.headersSent) res.status(status).json({ error: message });
            } else {
                await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
            }
        }
    }
});

// ========== Title Generation ==========
app.post('/api/generate-title', async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });
    try {
        const response = await callNvidiaAPI({
            model: req.body.model,
            messages: [
                { role: 'system', content: 'Generate a very short title (max 6 words) for this conversation. Return ONLY the title, nothing else. No quotes.' },
                { role: 'user', content: message },
            ],
            max_tokens: 30, temperature: 0.3, top_p: 0.9,
        });
        res.json({ title: response.data?.choices?.[0]?.message?.content?.trim() || 'New Chat' });
    } catch (error) {
        res.json({ title: message.substring(0, 40) + (message.length > 40 ? '...' : '') });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    const isLocal = !process.env.VERCEL;
    res.json({
        status: 'ok',
        model: DEFAULT_MODEL,
        features: ['streaming', 'thinking', 'smart-titles', 'retry', 'scheduler', ...(isLocal ? ['file-tools'] : [])],
        activeSchedules: Object.keys(activeJobs).length,
        uptime: process.uptime(),
    });
});

// ========== File System Tools (Local Only) ==========
const USER_HOME = process.env.USERPROFILE || process.env.HOME || 'C:\\Users';
const BLOCKED_PATHS = ['windows', 'system32', 'program files', 'programdata', '$recycle', 'appdata\\local\\temp'];
const BLOCKED_EXTENSIONS = ['.exe', '.dll', '.sys', '.bat', '.cmd', '.ps1', '.reg', '.msi'];

function isPathSafe(targetPath) {
    const normalized = path.resolve(targetPath).toLowerCase();
    // Block system-critical paths
    if (BLOCKED_PATHS.some(bp => normalized.includes(bp))) return false;
    return true;
}

function isWriteSafe(targetPath) {
    if (!isPathSafe(targetPath)) return false;
    const ext = path.extname(targetPath).toLowerCase();
    if (BLOCKED_EXTENSIONS.includes(ext)) return false;
    return true;
}

// List directory
app.post('/api/tools/list-dir', (req, res) => {
    if (process.env.VERCEL) return res.status(403).json({ error: 'File tools only work locally' });
    const { dirPath } = req.body;
    const target = path.resolve(dirPath || USER_HOME);
    if (!isPathSafe(target)) return res.status(403).json({ error: 'Access denied to this path' });

    try {
        const items = fs.readdirSync(target, { withFileTypes: true }).slice(0, 100);
        const result = items.map(item => {
            const fullPath = path.join(target, item.name);
            let size = null;
            try { if (item.isFile()) size = fs.statSync(fullPath).size; } catch (e) { }
            return { name: item.name, isDir: item.isDirectory(), size };
        });
        res.json({ path: target, items: result });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// Read file
app.post('/api/tools/read-file', (req, res) => {
    if (process.env.VERCEL) return res.status(403).json({ error: 'File tools only work locally' });
    const { filePath, maxChars } = req.body;
    const target = path.resolve(filePath);
    if (!isPathSafe(target)) return res.status(403).json({ error: 'Access denied to this path' });

    try {
        const stat = fs.statSync(target);
        if (stat.size > 2 * 1024 * 1024) return res.status(400).json({ error: 'File too large (>2MB)' });
        const content = fs.readFileSync(target, 'utf-8').substring(0, maxChars || 50000);
        res.json({ path: target, size: stat.size, content });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// Search files
app.post('/api/tools/search', (req, res) => {
    if (process.env.VERCEL) return res.status(403).json({ error: 'File tools only work locally' });
    const { query, searchPath, maxDepth } = req.body;
    const target = path.resolve(searchPath || USER_HOME);
    if (!isPathSafe(target)) return res.status(403).json({ error: 'Access denied' });

    const results = [];
    const depth = maxDepth || 3;

    function walk(dir, level) {
        if (level > depth || results.length >= 50) return;
        try {
            const items = fs.readdirSync(dir, { withFileTypes: true });
            for (const item of items) {
                if (results.length >= 50) break;
                if (item.name.startsWith('.') || item.name === 'node_modules') continue;
                const full = path.join(dir, item.name);
                if (item.name.toLowerCase().includes(query.toLowerCase())) {
                    results.push({ name: item.name, path: full, isDir: item.isDirectory() });
                }
                if (item.isDirectory() && !BLOCKED_PATHS.some(bp => full.toLowerCase().includes(bp))) {
                    walk(full, level + 1);
                }
            }
        } catch (e) { /* skip inaccessible dirs */ }
    }

    walk(target, 0);
    res.json({ query, searchPath: target, results });
});

// Create file
app.post('/api/tools/create-file', (req, res) => {
    if (process.env.VERCEL) return res.status(403).json({ error: 'File tools only work locally' });
    const { filePath, content } = req.body;
    const target = path.resolve(filePath);
    if (!isWriteSafe(target)) return res.status(403).json({ error: 'Cannot create this file type or path' });

    try {
        const dir = path.dirname(target);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        if (fs.existsSync(target)) return res.status(400).json({ error: 'File already exists. Use move/rename instead.' });
        fs.writeFileSync(target, content || '', 'utf-8');
        res.json({ success: true, path: target });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// Move/rename file
app.post('/api/tools/move-file', (req, res) => {
    if (process.env.VERCEL) return res.status(403).json({ error: 'File tools only work locally' });
    const { from, to } = req.body;
    const fromPath = path.resolve(from);
    const toPath = path.resolve(to);
    if (!isPathSafe(fromPath) || !isWriteSafe(toPath)) return res.status(403).json({ error: 'Access denied' });

    try {
        if (!fs.existsSync(fromPath)) return res.status(404).json({ error: 'Source file not found' });
        const dir = path.dirname(toPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.renameSync(fromPath, toPath);
        res.json({ success: true, from: fromPath, to: toPath });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// ========== Agentic Tool-calling Loop ==========
const FILE_TOOLS_PROMPT = `
## File System Tools (Available when running locally):
You have access to the user's local file system. You can use these tools by outputting special commands:

To use a tool, output EXACTLY this format on its own line:
[TOOL:tool_name:arg1|arg2]

Available tools:
- [TOOL:list_dir:path] — List files in a directory. Example: [TOOL:list_dir:C:\\Users\\lgopl\\Documents]
- [TOOL:read_file:path] — Read a text file. Example: [TOOL:read_file:C:\\Users\\lgopl\\notes.txt]
- [TOOL:search:query|path] — Search for files by name. Example: [TOOL:search:report|C:\\Users\\lgopl\\Documents]
- [TOOL:create_file:path|content] — Create a new file. Example: [TOOL:create_file:C:\\Users\\lgopl\\Desktop\\todo.txt|Buy groceries]
- [TOOL:move_file:from|to] — Move or rename a file. Example: [TOOL:move_file:C:\\old.txt|C:\\new.txt]

RULES:
1. NEVER delete files. There is no delete tool.
2. Only use tools when the user specifically asks about files on their computer.
3. After receiving tool results, summarize them clearly in natural language.
4. Be careful with paths — always use absolute paths.
5. The user's home directory is: ${USER_HOME}
`;

app.post('/api/tools/execute', async (req, res) => {
    if (process.env.VERCEL) return res.status(403).json({ error: 'File tools only work locally' });
    const { tool, args } = req.body;

    try {
        switch (tool) {
            case 'list_dir': {
                const items = fs.readdirSync(path.resolve(args[0] || USER_HOME), { withFileTypes: true }).slice(0, 80);
                const result = items.map(i => `${i.isDirectory() ? '📁' : '📄'} ${i.name}`).join('\n');
                return res.json({ result: `Files in ${args[0]}:\n${result}` });
            }
            case 'read_file': {
                const target = path.resolve(args[0]);
                if (!isPathSafe(target)) return res.json({ result: 'Error: Access denied' });
                const stat = fs.statSync(target);
                if (stat.size > 1024 * 1024) return res.json({ result: 'Error: File too large' });
                const content = fs.readFileSync(target, 'utf-8').substring(0, 30000);
                return res.json({ result: `Content of ${args[0]} (${stat.size} bytes):\n${content}` });
            }
            case 'search': {
                const query = args[0];
                const searchDir = path.resolve(args[1] || USER_HOME);
                if (!isPathSafe(searchDir)) return res.json({ result: 'Error: Access denied' });
                const results = [];
                function walk(dir, level) {
                    if (level > 3 || results.length >= 30) return;
                    try {
                        for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
                            if (results.length >= 30) break;
                            if (item.name.startsWith('.') || item.name === 'node_modules') continue;
                            const full = path.join(dir, item.name);
                            if (item.name.toLowerCase().includes(query.toLowerCase())) results.push(full);
                            if (item.isDirectory() && !BLOCKED_PATHS.some(bp => full.toLowerCase().includes(bp))) walk(full, level + 1);
                        }
                    } catch (e) { }
                }
                walk(searchDir, 0);
                return res.json({ result: results.length > 0 ? `Found ${results.length} matches:\n${results.join('\n')}` : `No files matching "${query}" found in ${searchDir}` });
            }
            case 'create_file': {
                const target = path.resolve(args[0]);
                if (!isWriteSafe(target)) return res.json({ result: 'Error: Cannot create this file type' });
                const dir = path.dirname(target);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(target, args[1] || '', 'utf-8');
                return res.json({ result: `✅ Created file: ${target}` });
            }
            case 'move_file': {
                const fromP = path.resolve(args[0]), toP = path.resolve(args[1]);
                if (!isPathSafe(fromP) || !isWriteSafe(toP)) return res.json({ result: 'Error: Access denied' });
                fs.renameSync(fromP, toP);
                return res.json({ result: `✅ Moved: ${fromP} → ${toP}` });
            }
            default: return res.json({ result: `Unknown tool: ${tool}` });
        }
    } catch (e) { res.json({ result: `Error: ${e.message}` }); }
});

// SPA fallback
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========== Start (or Export for Vercel) ==========
loadSchedules();

// ========== Start Logic ==========
loadSchedules();

if (IS_RENDER || (!process.env.VERCEL && process.env.NODE_ENV !== 'production')) {
    app.listen(PORT, async () => {
        console.log(`\n🚀 Server running on port ${PORT}`);
        
        if (IS_RENDER && RENDER_URL && bot) {
            try {
                const webhookUrl = `${RENDER_URL}/api/telegram-webhook`;
                await bot.telegram.setWebhook(webhookUrl);
                console.log(`✅ Render Webhook Auto-Set: ${webhookUrl}`);
            } catch (e) {
                console.log(`⚠️ Render Webhook Auto-Set Failed: ${e.message}`);
            }
        }
    });
} else {
    setupCronJobs();
}

// Polling mode for true local development (not Render/Vercel)
if (bot && !process.env.VERCEL && !IS_RENDER) {
    tgBotStatus = "Starting Polling (Local)";
    bot.telegram.deleteWebhook().then(() => bot.launch());
}

module.exports = app;
