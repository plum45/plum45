const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const cron = require('node-cron');
const cheerio = require('cheerio');
const admin = require('firebase-admin');
const fs = require('fs');

// Initialize Firebase Admin
let adminConfig = { projectId: "ai--agent-12d7a" };

try {
    const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
    if (fs.existsSync(serviceAccountPath)) {
        adminConfig.credential = admin.credential.cert(require(serviceAccountPath));
        console.log("Firebase Admin: Initialized with local serviceAccountKey.json");
    } else {
        console.log("Firebase Admin: Initialized with default credentials (needs GOOGLE_APPLICATION_CREDENTIALS locally)");
    }
} catch (e) {
    console.error("Firebase Admin Config Error:", e.message);
}

if (admin.apps.length === 0) {
    admin.initializeApp(adminConfig);
}
const db = admin.firestore();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ========== Config (use ENV for security) ==========
const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || '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';

const SYSTEM_PROMPT_CODING = `You are Qwen, an expert AI coding agent built on Qwen 3.5-122B. You are a pair programmer and software architect who writes production-ready code.

## Identity & Behavior:
- You are an AI **agent** — proactive, thorough, and code-first.
- When asked to build something, you write the **complete, working code** — not pseudocode or partial snippets.
- You think step-by-step before coding, considering architecture, edge cases, and best practices.
- You respond in the same language the user writes in (e.g., Thai → Thai, English → English).

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
- **Real-time Data**: If WEB SEARCH CONTEXT is provided in the user's message, YOU MUST use it to answer the question. Do not say you don't have real-time data.

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
- Be polite, professional, and helpful.
- When given [CRITICAL REAL-TIME DATA] or other search contexts, always incorporate that data smoothly into your response without apologizing for lacking real-time capabilities. Your answers should sound confident based on the provided data.

## Response Format:
- Use simple, easy-to-read formatting.
- Use **bold** for emphasis.
- Use tables or bullet points for structured data.`;

// ========== Context Management ==========
function trimMessages(messages, maxTokenEstimate = 12000) {
    let totalChars = 0;
    const trimmed = [];
    for (let i = messages.length - 1; i >= 0; i--) {
        const msgChars = messages[i].content.length;
        if (totalChars + msgChars > maxTokenEstimate * 4 && trimmed.length >= 4) break;
        totalChars += msgChars;
        trimmed.unshift(messages[i]);
    }
    return trimmed;
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

async function runQuery(query) {
    const response = await axios.post(NVIDIA_API_URL, {
        model: 'qwen/qwen3.5-122b-a10b',
        messages: [
            { role: 'system', content: SYSTEM_PROMPT_AGENT },
            { role: 'user', content: query },
        ],
        max_tokens: 4096,
        temperature: 0.6,
        top_p: 0.95,
        stream: false,
        chat_template_kwargs: { enable_thinking: false },
    }, {
        headers: { 'Authorization': `Bearer ${NVIDIA_API_KEY}`, 'Accept': 'application/json' },
        timeout: 60000,
    });
    return response.data?.choices?.[0]?.message?.content || 'No response';
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
            try {
                console.log(`🌐 Performing Web Search for: "${lastMsg.content}"`);

                const ddgRes = await axios.post(`https://lite.duckduckgo.com/lite/`, 'q=' + encodeURIComponent(lastMsg.content), {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    timeout: 8000
                });

                const $ = cheerio.load(ddgRes.data);
                const results = [];
                $('.result-snippet').each((i, el) => {
                    const description = $(el).text().trim();
                    const title = $(el).parent().prev().find('.result-link').text().trim();
                    if (description.length > 5) results.push(`Title: ${title}\nDescription: ${description}`);
                });

                if (results.length > 0) {
                    const topResults = results.slice(0, 5).join('\n\n');
                    console.log(`✅ Search found ${results.length} results.`);
                    searchContextStr = `\n\n[CRITICAL REAL-TIME DATA]:\nYou MUST use the following search results to answer the user's upcoming question. DO NOT apologize or say you don't have real-time access. The system has provided this data for you.\n\n${topResults}\n`;
                } else {
                    console.log('⚠️ Search returned no results.');
                }
            } catch (e) { console.error('❌ Web search failed:', e.message); }
        }
    }

    const trimmedMessages = trimMessages(messages);
    const selectedPrompt = mode === 'agent' ? SYSTEM_PROMPT_AGENT : SYSTEM_PROMPT_CODING;
    const fullMessages = [
        { role: 'system', content: selectedPrompt + searchContextStr },
        ...trimmedMessages
    ];

    const payload = {
        model: req.body.model || 'qwen/qwen3.5-122b-a10b',
        messages: fullMessages,
        max_tokens, temperature, top_p,
        stream: true,
        chat_template_kwargs: { enable_thinking },
    };

    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await axios.post(NVIDIA_API_URL, payload, {
                headers: { 'Authorization': `Bearer ${NVIDIA_API_KEY}`, 'Accept': 'text/event-stream' },
                responseType: 'stream',
                timeout: 120000,
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
        const response = await axios.post(NVIDIA_API_URL, {
            model: req.body.model || 'qwen/qwen3.5-122b-a10b',
            messages: [
                { role: 'system', content: 'Generate a very short title (max 6 words) for this conversation. Return ONLY the title, nothing else. No quotes.' },
                { role: 'user', content: message },
            ],
            max_tokens: 30, temperature: 0.3, top_p: 0.9, stream: false,
            chat_template_kwargs: { enable_thinking: false },
        }, {
            headers: { 'Authorization': `Bearer ${NVIDIA_API_KEY}`, 'Accept': 'application/json' },
            timeout: 15000,
        });
        res.json({ title: response.data?.choices?.[0]?.message?.content?.trim() || 'New Chat' });
    } catch (error) {
        res.json({ title: message.substring(0, 40) + (message.length > 40 ? '...' : '') });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        model: 'qwen/qwen3.5-122b-a10b',
        features: ['streaming', 'thinking', 'smart-titles', 'retry', 'scheduler'],
        activeSchedules: schedules.filter(s => s.active).length,
        uptime: process.uptime(),
    });
});

// SPA fallback
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========== Start (or Export for Vercel) ==========
loadSchedules();

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`\n  🚀 Qwen Agent running at http://localhost:${PORT}`);
        console.log(`  🧠 Model: Qwen 3.5-122B (Agent mode)`);
        console.log(`  ⚡ Features: Streaming, Thinking, Scheduler, Auto-titles`);
    });
} else {
    // On Vercel, setup cron jobs as memory fallback (though they will sleep)
    setupCronJobs();
}

module.exports = app;
