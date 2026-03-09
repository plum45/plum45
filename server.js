const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const google = require('googlethis');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ========== Config (use ENV for security) ==========
const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || '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';

// ========== Agent System Prompt ==========
const SYSTEM_PROMPT = `You are Qwen, an expert AI coding agent built on Qwen 3.5-122B. You are a pair programmer and software architect who writes production-ready code.

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
const SCHEDULES_FILE = path.join(__dirname, 'schedules.json');
let schedules = [];
let cronJobs = {};

function loadSchedules() {
    try {
        if (fs.existsSync(SCHEDULES_FILE)) {
            schedules = JSON.parse(fs.readFileSync(SCHEDULES_FILE, 'utf8'));
        }
    } catch (e) { schedules = []; }
}

function saveSchedules() {
    try { fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(schedules, null, 2)); } catch (e) { }
}

function setupCronJobs() {
    // Clear existing jobs
    Object.values(cronJobs).forEach(job => job.stop());
    cronJobs = {};

    schedules.filter(s => s.active).forEach(s => {
        const [hour, min] = s.time.split(':').map(Number);
        const cronExpr = `${min} ${hour} * * *`; // Every day at HH:MM

        if (cron.validate(cronExpr)) {
            cronJobs[s.id] = cron.schedule(cronExpr, async () => {
                console.log(`⏰ Running scheduled task: "${s.query}" at ${s.time}`);
                try {
                    const result = await runQuery(s.query);
                    // Store result
                    s.lastRun = new Date().toISOString();
                    s.lastResult = result.substring(0, 2000); // Keep last 2000 chars
                    saveSchedules();
                    console.log(`✅ Scheduled task completed: "${s.query}"`);
                } catch (e) {
                    console.error(`❌ Scheduled task failed: ${e.message}`);
                    s.lastRun = new Date().toISOString();
                    s.lastResult = `Error: ${e.message}`;
                    saveSchedules();
                }
            }, { timezone: 'Asia/Bangkok' });
            console.log(`  📅 Cron scheduled: "${s.query}" at ${s.time} (${cronExpr})`);
        }
    });
}

async function runQuery(query) {
    const response = await axios.post(NVIDIA_API_URL, {
        model: 'qwen/qwen3.5-122b-a10b',
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
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
app.get('/api/schedules', (req, res) => {
    res.json(schedules);
});

app.post('/api/schedules', (req, res) => {
    const { time, query } = req.body;
    if (!time || !query) return res.status(400).json({ error: 'time and query required' });

    const sched = {
        id: 's' + Date.now(),
        time,
        query,
        active: true,
        createdAt: new Date().toISOString(),
        lastRun: null,
        lastResult: null,
    };
    schedules.push(sched);
    saveSchedules();
    setupCronJobs();
    res.json(sched);
});

app.put('/api/schedules/:id', (req, res) => {
    const s = schedules.find(x => x.id === req.params.id);
    if (!s) return res.status(404).json({ error: 'Not found' });
    if (req.body.active !== undefined) s.active = req.body.active;
    if (req.body.time) s.time = req.body.time;
    if (req.body.query) s.query = req.body.query;
    saveSchedules();
    setupCronJobs();
    res.json(s);
});

app.delete('/api/schedules/:id', (req, res) => {
    schedules = schedules.filter(x => x.id !== req.params.id);
    saveSchedules();
    setupCronJobs();
    res.json({ ok: true });
});

// ========== Chat Endpoint with Retry ==========
app.post('/api/chat', async (req, res) => {
    const { messages, temperature = 0.6, top_p = 0.95, max_tokens = 16384, enable_thinking = true, web_search = false } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'Messages array is required' });
    }

    if (web_search) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.role === 'user') {
            try {
                console.log(`🌐 Performing Google Search for: "${lastMsg.content}"`);
                const searchRes = await google.search(lastMsg.content, { page: 0, parse_ads: false });
                if (searchRes && searchRes.results && searchRes.results.length > 0) {
                    const topResults = searchRes.results.slice(0, 5).map(r => `Title: ${r.title}\nDescription: ${r.description}`).join('\n\n');
                    console.log(`✅ Search found ${searchRes.results.length} results.`);
                    lastMsg.content = `[REAL-TIME WEB DATA FROM GOOGLE SEARCH]\n${topResults}\n\n---\n[USER QUERY]:\n${lastMsg.content}\n\nINSTRUCTION: You HAVE access to the real-time internet data above. Use it to answer the user query accurately. DO NOT say you don't have access to real-time info.`;
                } else {
                    console.log('⚠️ Search returned no results.');
                }
            } catch (e) { console.error('❌ Web search failed:', e.message); }
        }
    }

    const trimmedMessages = trimMessages(messages);
    const fullMessages = [{ role: 'system', content: SYSTEM_PROMPT }, ...trimmedMessages];

    const payload = {
        model: 'qwen/qwen3.5-122b-a10b',
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
            model: 'qwen/qwen3.5-122b-a10b',
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
        console.log(`  📅 Active schedules: ${schedules.filter(s => s.active).length}\n`);
        setupCronJobs();
    });
} else {
    // On Vercel, setup cron jobs as memory fallback (though they will sleep)
    setupCronJobs();
}

module.exports = app;
