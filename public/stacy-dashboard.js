/* ============================================
   STACY SECRETARY DASHBOARD — JavaScript v2.0
   "เลขาสุดน่ารัก" — Real-time Data Engine
   Premium Sidebar + Mobile Nav Edition
   ============================================ */

// ========== STATE ==========
const AppState = {
    // เลือก Backend URL ตามโดเมนที่รันอยู่
    API_BASE: window.location.hostname.includes('vercel.app') 
              ? 'https://plum45.onrender.com' 
              : '',
    calendarEvents: [],
    currentMonth: new Date(),
    selectedDate: null,
    chatHistory: [],
    isStreaming: false,
};

// Tab label mapping for breadcrumbs
const TAB_LABELS = {
    dashboard: 'Dashboard',
    calendar: 'ปฏิทิน',
    search: 'ค้นหา',
    stocks: 'หุ้น & การเงิน',
    schedule: 'ตารางสอน',
    chat: 'แชท Stacy'
};

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', () => {
    initClock();
    initNavigation();
    loadDashboard();
    setupChatInput();
    setupSearchInput();
    setDefaultEventDate();
    loadPortfolio();
});

// ========== LIVE CLOCK ==========
function initClock() {
    function updateClock() {
        const now = new Date();
        const time = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        const el = document.getElementById('liveClock');
        if (el) el.textContent = time;
        
        // Sidebar clock (vertical short)
        const sideEl = document.getElementById('sidebarClock');
        if (sideEl) {
            sideEl.textContent = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
        }
    }
    updateClock();
    setInterval(updateClock, 1000);
}

// ========== NAVIGATION ==========
function initNavigation() {
    // Sidebar buttons
    document.querySelectorAll('.sidebar-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.tab;
            switchTab(target);
        });
    });

    // Mobile nav buttons already have onclick in HTML
}

function switchTab(tabName) {
    // Update sidebar
    document.querySelectorAll('.sidebar-btn').forEach(t => t.classList.remove('active'));
    const sideBtn = document.querySelector(`.sidebar-btn[data-tab="${tabName}"]`);
    if (sideBtn) sideBtn.classList.add('active');

    // Update mobile nav
    document.querySelectorAll('.mobile-nav-btn').forEach(t => t.classList.remove('active'));
    const mobBtn = document.querySelector(`.mobile-nav-btn[data-tab="${tabName}"]`);
    if (mobBtn) mobBtn.classList.add('active');

    // Switch panels
    document.querySelectorAll('.tab-panel').forEach(t => t.classList.remove('active'));
    const content = document.getElementById(`tab-${tabName}`);
    if (content) content.classList.add('active');

    // Update breadcrumb
    const breadcrumb = document.getElementById('pageBreadcrumb');
    if (breadcrumb) breadcrumb.textContent = `/ ${TAB_LABELS[tabName] || tabName}`;

    // Lazy load tab data
    if (tabName === 'calendar') loadCalendar();
    if (tabName === 'stocks') { loadPortfolio(); loadStockPrices(); loadStockBriefing(); loadForexCalendar(); }
    if (tabName === 'schedule') loadSchedule();
    if (tabName === 'search') document.getElementById('searchInput')?.focus();
    if (tabName === 'chat') {
        document.getElementById('chatInput')?.focus();
        scrollChatBottom();
    }
}

// ========== DASHBOARD LOAD ==========
async function loadDashboard() {
    try {
        // Load quick info
        const infoRes = await fetch(`${AppState.API_BASE}/api/quick-info`);
        const info = await infoRes.json();

        document.getElementById('greetingMsg').textContent = info.greeting + ' พี่ Snow ✨';
        document.getElementById('greetingDate').textContent = info.date;
        document.getElementById('fbStatus').textContent = info.firebase?.includes('Connected') ? 'Connected' : 'Offline';

        // Load calendar events
        await loadCalendarEvents();

        // Count today's events
        const today = new Date().toISOString().split('T')[0];
        const todayEvents = AppState.calendarEvents.filter(e => {
            if (!e.start) return false;
            return e.start.startsWith(today);
        });
        document.getElementById('eventCount').textContent = todayEvents.length;

        // Count pending tasks
        const pendingTasks = AppState.calendarEvents.filter(e => e.status === 'pending');
        document.getElementById('taskCount').textContent = pendingTasks.length;

        // Render upcoming events
        renderUpcomingEvents();

        // Load news
        refreshNews();

    } catch (e) {
        console.error('[Dashboard] Load error:', e);
        document.getElementById('greetingMsg').textContent = 'สวัสดีค่ะ พี่ Snow ✨';
    }
}

// ========== CALENDAR EVENTS ==========
async function loadCalendarEvents() {
    try {
        const res = await fetch(`${AppState.API_BASE}/api/calendar`);
        AppState.calendarEvents = await res.json();
        console.log(`✅ Loaded ${AppState.calendarEvents.length} events`);
    } catch (e) {
        console.error('[Calendar] Fetch error:', e);
        AppState.calendarEvents = [];
    }
}

function renderUpcomingEvents() {
    const container = document.getElementById('upcomingEvents');
    const now = new Date();
    const upcoming = AppState.calendarEvents
        .filter(e => e.start && new Date(e.start) >= new Date(now.toDateString()))
        .sort((a, b) => new Date(a.start) - new Date(b.start))
        .slice(0, 5);

    if (upcoming.length === 0) {
        container.innerHTML = '<p class="empty-state">ไม่มีนัดหมายที่ใกล้จะถึงค่ะ 🌸</p>';
        return;
    }

    container.innerHTML = upcoming.map(event => {
        const dt = new Date(event.start);
        const timeStr = dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        const dateStr = dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
        const typeClass = event.type === 'google' ? 'calendar' : event.type === 'work' ? 'work' : 'task';

        return `<div class="event-item">
            <div class="event-time-badge ${typeClass}">${timeStr}<br><small>${dateStr}</small></div>
            <div class="event-info">
                <div class="event-title">${escHtml(event.title)}</div>
                <div class="event-meta">${event.type === 'google' ? '📅 Google Calendar' : event.type === 'work' ? '💼 Work Log' : '✅ Task'}</div>
            </div>
        </div>`;
    }).join('');
}

// ========== FULL CALENDAR ==========
async function loadCalendar() {
    await loadCalendarEvents();
    renderCalendar();
}

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const titleEl = document.getElementById('calMonthTitle');
    if (!grid || !titleEl) return;

    const year = AppState.currentMonth.getFullYear();
    const month = AppState.currentMonth.getMonth();

    const thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    titleEl.textContent = `${thaiMonths[month]} ${year + 543}`;

    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    const thaiDaysShort = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

    grid.innerHTML = '';

    // Weekday headers
    thaiDaysShort.forEach(d => {
        const el = document.createElement('div');
        el.className = 'cal-cell head';
        el.textContent = d;
        grid.appendChild(el);
    });

    // Empty cells
    for (let i = 0; i < firstDay; i++) {
        const el = document.createElement('div');
        el.className = 'cal-cell empty';
        grid.appendChild(el);
    }

    // Day cells
    for (let d = 1; d <= lastDate; d++) {
        const el = document.createElement('div');
        el.className = 'cal-cell';
        el.textContent = d;

        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

        // Today highlight
        if (d === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
            el.classList.add('today');
        }

        // Selected
        if (AppState.selectedDate === dateStr) {
            el.classList.add('selected');
        }

        // Has events
        const dayEvents = AppState.calendarEvents.filter(e => e.start && e.start.startsWith(dateStr));
        if (dayEvents.length > 0) {
            el.classList.add('has-event');
        }

        el.addEventListener('click', () => {
            AppState.selectedDate = dateStr;
            renderCalendar();
            renderDayEvents(dateStr);
        });

        grid.appendChild(el);
    }

    // Bind nav buttons
    document.getElementById('calPrev').onclick = () => {
        AppState.currentMonth.setMonth(AppState.currentMonth.getMonth() - 1);
        renderCalendar();
    };
    document.getElementById('calNext').onclick = () => {
        AppState.currentMonth.setMonth(AppState.currentMonth.getMonth() + 1);
        renderCalendar();
    };

    // Auto-show today's events if no selection
    if (!AppState.selectedDate) {
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        renderDayEvents(todayStr);
    }
}

function renderDayEvents(dateStr) {
    const container = document.getElementById('dayEventsList');
    const titleEl = document.getElementById('selectedDateTitle');

    const dt = new Date(dateStr + 'T00:00:00');
    titleEl.textContent = `📋 ${dt.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' })}`;

    const dayEvents = AppState.calendarEvents.filter(e => e.start && e.start.startsWith(dateStr));

    if (dayEvents.length === 0) {
        container.innerHTML = '<p class="empty-state">วันนี้ไม่มีกิจกรรมค่ะ 🌸</p>';
        return;
    }

    container.innerHTML = dayEvents.map(event => {
        const dt2 = new Date(event.start);
        const timeStr = dt2.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        const typeClass = event.type === 'google' ? 'calendar' : event.type === 'work' ? 'work' : 'task';

        return `<div class="event-item">
            <div class="event-time-badge ${typeClass}">${timeStr}</div>
            <div class="event-info">
                <div class="event-title">${escHtml(event.title)}</div>
                <div class="event-meta">${event.description || event.type || ''}</div>
            </div>
        </div>`;
    }).join('');
}

// ========== SEARCH ==========
function setupSearchInput() {
    const input = document.getElementById('searchInput');
    if (input) {
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') performSearch();
        });
    }
}

async function performSearch() {
    const input = document.getElementById('searchInput');
    const query = input?.value?.trim();
    if (!query) return;

    const container = document.getElementById('searchResults');
    container.innerHTML = '<div class="spinner"></div>';

    try {
        const res = await fetch(`${AppState.API_BASE}/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();

        if (data.error) {
            container.innerHTML = `<p class="empty-state">❌ ${data.error}</p>`;
            return;
        }

        let html = '';

        // Answer box
        if (data.answerBox) {
            const answer = data.answerBox.answer || data.answerBox.snippet || '';
            if (answer) {
                html += `<div class="answer-box">
                    <div class="answer-box-title">✨ คำตอบด่วน</div>
                    <div class="answer-box-text">${escHtml(answer)}</div>
                </div>`;
            }
        }

        // Knowledge graph
        if (data.knowledgeGraph) {
            const kg = data.knowledgeGraph;
            if (kg.description) {
                html += `<div class="answer-box">
                    <div class="answer-box-title">📚 ${escHtml(kg.title || query)}</div>
                    <div class="answer-box-text">${escHtml(kg.description)}</div>
                </div>`;
            }
        }

        // Organic results
        if (data.organic && data.organic.length > 0) {
            html += data.organic.map(r => `
                <div class="result-card">
                    <div class="result-title"><a href="${escHtml(r.link)}" target="_blank" rel="noopener">${escHtml(r.title)}</a></div>
                    <div class="result-link">${escHtml(r.link)}</div>
                    <div class="result-snippet">${escHtml(r.snippet || '')}</div>
                </div>
            `).join('');
        }

        if (!html) {
            html = '<p class="empty-state">ไม่พบผลลัพธ์ที่เกี่ยวข้องค่ะ 🌸</p>';
        }

        container.innerHTML = html;
    } catch (e) {
        console.error('[Search] Error:', e);
        container.innerHTML = `<p class="empty-state">❌ เกิดข้อผิดพลาด: ${e.message}</p>`;
    }
}

function quickSearch(query) {
    switchTab('search');
    const input = document.getElementById('searchInput');
    if (input) {
        input.value = query;
        performSearch();
    }
}

// ========== NEWS ==========
async function refreshNews() {
    const container = document.getElementById('newsContainer');
    container.innerHTML = '<div class="loading-shimmer"><div></div><div></div><div></div></div>';

    try {
        // อัปเดตคำค้นหาเน้น หุ้น เศรษฐกิจ เทคโนโลยี และการศึกษา
        const res = await fetch(`${AppState.API_BASE}/api/news?q=ข่าวเศรษฐกิจ หุ้น เทคโนโลยี การศึกษา`);
        const data = await res.json();

        if (!data.news || data.news.length === 0) {
            container.innerHTML = '<p class="empty-state">ไม่พบข่าวล่าสุดค่ะ 📰</p>';
            return;
        }

        container.innerHTML = `<div class="news-grid">${data.news.map(n => `
            <a class="news-item" href="${escHtml(n.link)}" target="_blank" rel="noopener">
                <div class="news-title">${escHtml(n.title)}</div>
                <div class="news-source">
                    <span>📰 ${escHtml(n.source || '')}</span>
                    ${n.date ? `<span class="news-time">· ${escHtml(n.date)}</span>` : ''}
                </div>
            </a>
        `).join('')}</div>`;
    } catch (e) {
        console.error('[News] Error:', e);
        container.innerHTML = '<p class="empty-state">❌ ไม่สามารถโหลดข่าวได้ค่ะ</p>';
    }
}

// ========== CHAT ==========
function setupChatInput() {
    const input = document.getElementById('chatInput');
    if (input) {
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatFromInput();
            }
        });
        input.addEventListener('input', autoResizeChat);
    }
}

function autoResizeChat() {
    const input = document.getElementById('chatInput');
    if (input) {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    }
}

function scrollChatBottom() {
    const container = document.getElementById('chatMessages');
    if (container) container.scrollTop = container.scrollHeight;
}

function sendChatFromInput() {
    const input = document.getElementById('chatInput');
    const msg = input?.value?.trim();
    if (!msg || AppState.isStreaming) return;
    input.value = '';
    autoResizeChat();
    sendChatMessage(msg);
}

async function sendChatMessage(message) {
    if (AppState.isStreaming) return;

    const container = document.getElementById('chatMessages');

    // Remove welcome if present
    const welcome = container.querySelector('.chat-welcome');
    if (welcome) welcome.remove();

    // Add user message
    container.innerHTML += `
        <div class="chat-msg user">
            <div class="chat-avatar">👤</div>
            <div class="chat-bubble">${escHtml(message)}</div>
        </div>`;

    // Add typing indicator
    const typingId = 'typing-' + Date.now();
    container.innerHTML += `
        <div class="chat-msg stacy" id="${typingId}">
            <div class="chat-avatar">🌸</div>
            <div class="chat-bubble">
                <div class="typing-indicator">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>
        </div>`;
    scrollChatBottom();

    AppState.isStreaming = true;
    AppState.chatHistory.push({ role: 'user', content: message });

    try {
        const response = await fetch(`${AppState.API_BASE}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message,
                history: AppState.chatHistory.slice(-8)
            })
        });

        // Remove typing indicator
        const typingEl = document.getElementById(typingId);
        if (typingEl) typingEl.remove();

        if (!response.ok) {
            const err = await response.json();
            addStacyMessage(`❌ เกิดข้อผิดพลาดค่ะ: ${err.error || 'Unknown error'} 🥺`);
            AppState.isStreaming = false;
            return;
        }

        // Parse SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullReply = '';

        // Create stacy message element
        const msgEl = document.createElement('div');
        msgEl.className = 'chat-msg stacy';
        msgEl.innerHTML = `<div class="chat-avatar">🌸</div><div class="chat-bubble"></div>`;
        container.appendChild(msgEl);
        const bubbleEl = msgEl.querySelector('.chat-bubble');

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value, { stream: true });
            const lines = text.split('\n').filter(l => l.startsWith('data: '));

            for (const line of lines) {
                try {
                    const data = JSON.parse(line.substring(6));
                    if (data.content) {
                        fullReply += data.content;
                        // Clean think tags in real-time
                        let display = fullReply.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*/g, '').trim();
                        bubbleEl.innerHTML = formatChatText(display);
                        scrollChatBottom();
                    }
                    if (data.done) {
                        fullReply = data.fullReply || fullReply;
                        bubbleEl.innerHTML = formatChatText(fullReply);
                        scrollChatBottom();
                    }
                } catch (pe) { /* ignore parse errors from partial chunks */ }
            }
        }

        AppState.chatHistory.push({ role: 'assistant', content: fullReply });
        if (AppState.chatHistory.length > 20) AppState.chatHistory = AppState.chatHistory.slice(-16);

    } catch (e) {
        console.error('[Chat] Error:', e);
        const typingEl = document.getElementById(typingId);
        if (typingEl) typingEl.remove();
        addStacyMessage(`❌ ขอโทษค่ะ ระบบมีปัญหา: ${e.message} 🥺💔`);
    }

    AppState.isStreaming = false;
}

function addStacyMessage(text) {
    const container = document.getElementById('chatMessages');
    container.innerHTML += `
        <div class="chat-msg stacy">
            <div class="chat-avatar">🌸</div>
            <div class="chat-bubble">${formatChatText(text)}</div>
        </div>`;
    scrollChatBottom();
}

function formatChatText(text) {
    if (!text) return '';
    let h = escHtml(text);
    // Bold
    h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic
    h = h.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>');
    // Code
    h = h.replace(/`([^`]+)`/g, '<code style="background:rgba(99,102,241,0.1);padding:1px 6px;border-radius:4px;font-size:0.85em;font-family:\'JetBrains Mono\',monospace">$1</code>');
    // Links
    h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:#a855f7">$1</a>');
    // Line breaks
    h = h.replace(/\n/g, '<br>');
    return h;
}

// ========== ADD EVENT MODAL ==========
function setDefaultEventDate() {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    const dateInput = document.getElementById('eventDate');
    const endDateInput = document.getElementById('eventEndDate');
    if (dateInput) dateInput.value = dateStr;
    if (endDateInput) endDateInput.value = dateStr;
}

function openAddEventModal() {
    document.getElementById('addEventModal').classList.add('show');
    setDefaultEventDate();
    document.getElementById('eventTitle')?.focus();
}

function closeAddEventModal() {
    document.getElementById('addEventModal').classList.remove('show');
    // Clear form
    ['eventTitle', 'eventDesc', 'eventLocation'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

async function submitNewEvent() {
    const title = document.getElementById('eventTitle')?.value?.trim();
    const date = document.getElementById('eventDate')?.value;
    const time = document.getElementById('eventTime')?.value || '09:00';
    const endDate = document.getElementById('eventEndDate')?.value;
    const endTime = document.getElementById('eventEndTime')?.value || '10:00';
    const desc = document.getElementById('eventDesc')?.value?.trim();
    const location = document.getElementById('eventLocation')?.value?.trim();

    if (!title) {
        showToast('❌ กรุณาใส่ชื่อกิจกรรมค่ะ');
        return;
    }
    if (!date) {
        showToast('❌ กรุณาเลือกวันที่ค่ะ');
        return;
    }

    const submitBtn = document.querySelector('.btn-submit');
    const submitText = document.getElementById('submitEventText');
    submitBtn.disabled = true;
    submitText.textContent = '⏳ กำลังบันทึก...';

    try {
        const start = `${date}T${time}:00`;
        const end = `${endDate || date}T${endTime}:00`;

        const res = await fetch('/api/calendar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, start, end, description: desc, location })
        });

        const data = await res.json();

        if (data.error) {
            showToast(`❌ ${data.error}`);
        } else {
            showToast(`✅ บันทึกนัดหมาย "${title}" เรียบร้อยแล้วค่ะ! 📅✨`);
            closeAddEventModal();
            // Reload data
            await loadCalendarEvents();
            renderUpcomingEvents();
            if (document.getElementById('tab-calendar').classList.contains('active')) {
                renderCalendar();
            }
            // Update stats
            const today = new Date().toISOString().split('T')[0];
            const todayEvents = AppState.calendarEvents.filter(e => e.start && e.start.startsWith(today));
            document.getElementById('eventCount').textContent = todayEvents.length;
        }
    } catch (e) {
        console.error('[AddEvent] Error:', e);
        showToast(`❌ เกิดข้อผิดพลาด: ${e.message}`);
    }

    submitBtn.disabled = false;
    submitText.textContent = '📅 บันทึกนัดหมาย';
}

// ========== UTILITIES ==========
function escHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
}

// ========== STOCKS & PORTFOLIO ==========
let portfolioStocks = [];

async function loadPortfolio() {
    try {
        const res = await fetch(`${AppState.API_BASE}/api/portfolio`);
        const data = await res.json();
        portfolioStocks = data.stocks || [];
        renderPortfolioTags();
    } catch (e) {
        console.error('[Portfolio] Load error:', e);
    }
}

function renderPortfolioTags() {
    const container = document.getElementById('portfolioTags');
    if (!container) return;

    if (portfolioStocks.length === 0) {
        container.innerHTML = '<span class="portfolio-empty">ยังไม่มีหุ้นในพอร์ต — กด "+ จัดการพอร์ต" เพื่อเพิ่ม 📝</span>';
        return;
    }

    container.innerHTML = portfolioStocks.map(s => `
        <span class="stock-tag" onclick="quickSearch('${s} หุ้น ราคา วันนี้ 2026')">
            <span class="stock-tag-icon">📈</span>
            ${escHtml(s)}
        </span>
    `).join('');
}

function openPortfolioModal() {
    document.getElementById('portfolioModal').classList.add('show');
    const input = document.getElementById('portfolioInput');
    if (input) {
        input.value = portfolioStocks.join(', ');
        input.focus();
    }
}

function closePortfolioModal() {
    document.getElementById('portfolioModal').classList.remove('show');
}

async function savePortfolio() {
    const input = document.getElementById('portfolioInput');
    const raw = input?.value?.trim();
    if (!raw) {
        showToast('❌ กรุณาใส่รายชื่อหุ้นค่ะ');
        return;
    }

    const stocks = raw.split(',').map(s => s.trim().toUpperCase()).filter(s => s);

    try {
        const res = await fetch(`${AppState.API_BASE}/api/portfolio`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stocks })
        });
        const data = await res.json();
        if (data.success) {
            portfolioStocks = stocks;
            renderPortfolioTags();
            closePortfolioModal();
            showToast(`✅ บันทึกพอร์ตเรียบร้อย! (${stocks.length} หุ้น) 📊✨`);
            loadStockBriefing();
        } else {
            showToast(`❌ บันทึกไม่สำเร็จค่ะ: ${data.error}`);
        }
    } catch (e) {
        showToast(`❌ ข้อผิดพลาด: ${e.message}`);
    }
}

async function loadStockBriefing() {
    const container = document.getElementById('stockBriefingContainer');
    if (!container) return;

    const symbols = portfolioStocks.length > 0 ? portfolioStocks.join(',') : 'SET,หุ้นไทย';
    container.innerHTML = '<div class="spinner"></div><p style="text-align:center;color:var(--text-muted);margin-top:8px;">🔍 น้อง Stacy กำลังสแกนข่าวหุ้นให้พี่ Snow...</p>';

    try {
        const res = await fetch(`${AppState.API_BASE}/api/stock-briefing?symbols=${encodeURIComponent(symbols)}`);
        const data = await res.json();

        if (data.error) {
            container.innerHTML = `<p class="empty-state">❌ ${data.error}</p>`;
            return;
        }

        let html = '';
        for (const [sym, news] of Object.entries(data.briefing)) {
            html += `<div class="stock-section">
                <h4 class="stock-section-title">📊 ${escHtml(sym)}</h4>
                <div class="stock-news-list">`;

            if (news.length === 0) {
                html += '<p class="empty-state">ไม่พบข่าวล่าสุดค่ะ</p>';
            } else {
                html += news.map(n => `
                    <a class="stock-news-item" href="${escHtml(n.link || '#')}" target="_blank" rel="noopener">
                        <div class="stock-news-title">${escHtml(n.title || '')}</div>
                        <div class="stock-news-meta">
                            <span>📰 ${escHtml(n.source || 'Unknown')}</span>
                            ${n.date ? `<span>· ${escHtml(n.date)}</span>` : ''}
                        </div>
                        ${n.snippet ? `<div class="stock-news-snippet">${escHtml(n.snippet)}</div>` : ''}
                    </a>
                `).join('');
            }

            html += '</div></div>';
        }

        html += `<p style="text-align:right;color:var(--text-muted);font-size:0.75rem;margin-top:12px;">อัพเดทล่าสุด: ${new Date(data.fetchedAt).toLocaleString('th-TH')}</p>`;
        container.innerHTML = html;
    } catch (e) {
        console.error('[StockBriefing] Error:', e);
        container.innerHTML = `<p class="empty-state">❌ โหลดข่าวไม่สำเร็จค่ะ: ${e.message}</p>`;
    }
}

// ========== REAL-TIME STOCK PRICES (Yahoo Finance) ==========
async function loadStockPrices() {
    const container = document.getElementById('stockPricesContainer');
    if (!container) return;
    container.innerHTML = '<div class="spinner"></div>';

    // Get portfolio stocks + add some default tracking symbols
    let symbols = [];
    try {
        const res = await fetch(`${AppState.API_BASE}/api/portfolio`);
        const data = await res.json();
        symbols = data.stocks || [];
    } catch (e) { /* ignore */ }

    // Always track Gold + BTC + USD/THB
    const extras = ['GC=F', 'BTC-USD', 'USDTHB=X'];
    const allSymbols = [...new Set([...symbols, ...extras])];

    if (allSymbols.length === 0) {
        container.innerHTML = '<p class="empty-state">เพิ่มหุ้นในพอร์ตเพื่อดูราคาเรียลไทม์ 📊</p>';
        return;
    }

    try {
        const res = await fetch(`${AppState.API_BASE}/api/stock-prices?symbols=${allSymbols.join(',')}`);
        const data = await res.json();

        if (!data.prices || Object.keys(data.prices).length === 0) {
            container.innerHTML = '<p class="empty-state">ไม่สามารถดึงราคาได้ค่ะ 😢</p>';
            return;
        }

        let html = '<div class="price-grid">';

        for (const [sym, info] of Object.entries(data.prices)) {
            if (info.error) {
                html += `<div class="price-card"><div class="price-symbol">${escHtml(sym)}</div><div style="color:var(--text-3);font-size:0.78rem;">❌ ${escHtml(info.error)}</div></div>`;
                continue;
            }

            const changeColor = info.change > 0 ? '#22c55e' : info.change < 0 ? '#ef4444' : 'var(--text-2)';
            const changeIcon = info.change > 0 ? '▲' : info.change < 0 ? '▼' : '●';
            const changeStr = info.change !== null ? `${info.change > 0 ? '+' : ''}${info.change}%` : '-';

            // Label mapping for non-stock symbols
            const labelMap = { 'GC=F': '🥇 ทองคำ', 'BTC-USD': '₿ Bitcoin', 'USDTHB=X': '💵 USD/THB', 'EURUSD=X': '€ EUR/USD' };
            const displayName = labelMap[sym] || `📊 ${info.name || sym}`;

            html += `<div class="price-card">
                <div class="price-symbol">${displayName}</div>
                <div class="price-value">${info.price?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} <span style="font-size:0.7rem;color:var(--text-3);">${info.currency}</span></div>
                <div class="price-change" style="color:${changeColor};">${changeIcon} ${changeStr}</div>
            </div>`;
        }

        html += '</div>';
        html += `<p style="text-align:right;color:var(--text-3);font-size:0.7rem;margin-top:8px;">⚡ Yahoo Finance · ${new Date(data.fetchedAt).toLocaleTimeString('th-TH')}</p>`;
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = `<p class="empty-state">❌ โหลดราคาไม่สำเร็จ: ${e.message}</p>`;
    }
}

// ========== FOREX FACTORY CALENDAR ==========
let forexCalendarLoaded = false;
async function loadForexCalendar() {
    if (forexCalendarLoaded) return;
    const container = document.getElementById('forexCalendarContainer');
    if (!container) return;
    container.innerHTML = '<div class="spinner"></div>';

    try {
        const res = await fetch('/api/forex-calendar');
        const data = await res.json();
        forexCalendarLoaded = true;

        if (!data.events || data.events.length === 0) {
            container.innerHTML = '<p class="empty-state">ไม่มีข่าวเศรษฐกิจสำคัญวันนี้ค่ะ 📭</p>';
            return;
        }

        const impactColors = {
            'High': '#ef4444', 'Medium': '#f59e0b', 'Low': '#22c55e',
            'Holiday': '#8b5cf6', 'Info': '#60a5fa'
        };

        let html = `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
            <thead><tr style="border-bottom:1px solid var(--border);color:var(--text-3);">
                <th style="padding:10px 12px;text-align:left;">เวลา</th>
                <th style="padding:10px 12px;text-align:left;">สกุลเงิน</th>
                <th style="padding:10px 12px;text-align:center;">ผลกระทบ</th>
                <th style="padding:10px 12px;text-align:left;">รายการ</th>
                <th style="padding:10px 12px;text-align:center;">คาดการณ์</th>
                <th style="padding:10px 12px;text-align:center;">ก่อนหน้า</th>
                <th style="padding:10px 12px;text-align:center;">ผลจริง</th>
            </tr></thead><tbody>`;

        data.events.forEach(ev => {
            const impactColor = impactColors[ev.impact] || '#64748b';
            html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.03);transition:background 0.2s;" onmouseover="this.style.background='rgba(99,102,241,0.03)'" onmouseout="this.style.background='transparent'">
                <td style="padding:10px 12px;color:var(--text-2);">${escHtml(ev.time || '-')}</td>
                <td style="padding:10px 12px;font-weight:600;color:var(--text-1);">${escHtml(ev.currency || '-')}</td>
                <td style="padding:10px 12px;text-align:center;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${impactColor};box-shadow:0 0 6px ${impactColor};"></span></td>
                <td style="padding:10px 12px;color:var(--text-1);">${escHtml(ev.title || '-')}</td>
                <td style="padding:10px 12px;text-align:center;color:var(--text-2);">${escHtml(ev.forecast || '-')}</td>
                <td style="padding:10px 12px;text-align:center;color:var(--text-3);">${escHtml(ev.previous || '-')}</td>
                <td style="padding:10px 12px;text-align:center;font-weight:600;color:var(--accent-7);">${escHtml(ev.actual || '-')}</td>
            </tr>`;
        });

        html += '</tbody></table></div>';
        html += `<p style="text-align:right;color:var(--text-3);font-size:0.72rem;margin-top:10px;">📅 ${data.date} · ${data.count} รายการ</p>`;
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = `<p class="empty-state">❌ โหลดปฏิทินเศรษฐกิจไม่สำเร็จ: ${e.message}</p>`;
    }
}

// ========== TEACHING SCHEDULE ==========
let scheduleData = [];

async function loadSchedule() {
    const container = document.getElementById('scheduleContainer');
    if (!container) return;
    container.innerHTML = '<div class="spinner"></div>';

    try {
        const res = await fetch('/api/schedule');
        const data = await res.json();
        scheduleData = data.schedule || [];
        renderSchedule();
    } catch (e) {
        container.innerHTML = `<p class="empty-state">❌ โหลดตารางไม่สำเร็จ: ${e.message}</p>`;
    }
}

function renderSchedule() {
    const container = document.getElementById('scheduleContainer');
    if (!container) return;

    if (scheduleData.length === 0) {
        container.innerHTML = '<p class="empty-state">ยังไม่มีตารางสอน — กด "+ เพิ่มวิชา" เพื่อเริ่มต้น 📚</p>';
        return;
    }

    const dayOrder = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์'];
    const grouped = {};
    dayOrder.forEach(d => { grouped[d] = []; });
    scheduleData.forEach(item => {
        const day = item.day || 'อื่นๆ';
        if (!grouped[day]) grouped[day] = [];
        grouped[day].push(item);
    });

    let html = '';
    dayOrder.forEach(day => {
        const items = grouped[day];
        if (items.length === 0) return;
        items.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

        html += `<div class="stock-section">
            <h4 class="stock-section-title">📅 วัน${day}</h4>
            <div class="stock-news-list">`;

        items.forEach((item, idx) => {
            const globalIdx = scheduleData.indexOf(item);
            html += `<div class="stock-news-item" style="cursor:default;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div class="stock-news-title" style="color:var(--accent-1);">${escHtml(item.subject || 'ไม่ระบุ')}</div>
                    <button onclick="deleteScheduleItem(${globalIdx})" style="background:none;border:none;color:var(--text-3);cursor:pointer;font-size:0.8rem;padding:4px 8px;border-radius:6px;transition:all 0.2s;" onmouseover="this.style.color='#ef4444';this.style.background='rgba(239,68,68,0.1)'" onmouseout="this.style.color='var(--text-3)';this.style.background='none'">🗑️</button>
                </div>
                <div class="stock-news-meta">
                    <span>⏰ ${escHtml(item.startTime || '??:??')} - ${escHtml(item.endTime || '??:??')}</span>
                    ${item.room ? `<span>· 🏫 ${escHtml(item.room)}</span>` : ''}
                </div>
                ${item.note ? `<div class="stock-news-snippet">${escHtml(item.note)}</div>` : ''}
            </div>`;
        });

        html += '</div></div>';
    });

    container.innerHTML = html;
}

function openScheduleModal() {
    document.getElementById('scheduleModal').classList.add('show');
}
function closeScheduleModal() {
    document.getElementById('scheduleModal').classList.remove('show');
}

async function saveScheduleItem() {
    const subject = document.getElementById('schedSubject')?.value.trim();
    const day = document.getElementById('schedDay')?.value;
    const room = document.getElementById('schedRoom')?.value.trim();
    const startTime = document.getElementById('schedStart')?.value;
    const endTime = document.getElementById('schedEnd')?.value;
    const note = document.getElementById('schedNote')?.value.trim();

    if (!subject) { showToast('กรุณาใส่ชื่อวิชาค่ะ ✏️'); return; }

    scheduleData.push({ subject, day, room, startTime, endTime, note });

    try {
        await fetch('/api/schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ schedule: scheduleData })
        });
        showToast(`✅ บันทึก "${subject}" เรียบร้อย!`);
        closeScheduleModal();
        renderSchedule();
        // Clear form
        document.getElementById('schedSubject').value = '';
        document.getElementById('schedRoom').value = '';
        document.getElementById('schedNote').value = '';
    } catch (e) {
        showToast('❌ บันทึกไม่สำเร็จ: ' + e.message);
    }
}

async function deleteScheduleItem(index) {
    if (!confirm('ลบวิชานี้ออกจากตารางสอน?')) return;
    scheduleData.splice(index, 1);
    try {
        await fetch('/api/schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ schedule: scheduleData })
        });
        showToast('🗑️ ลบเรียบร้อยค่ะ');
        renderSchedule();
    } catch (e) {
        showToast('❌ ลบไม่สำเร็จ: ' + e.message);
    }
}
