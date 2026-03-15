/* ============================================
   Qwen Agent — Full App v3
   Chat + Artifacts + Scheduler
   ============================================ */

// ===== State =====
const S = {
  chats: [], activeId: null, streaming: false, ctrl: null,
  artifacts: [], activeArt: null,
  schedules: [], // {id, time:"HH:MM", query:"...", active:true}
  schedTimers: {},
  settings: { temp: 0.7, topP: 0.9, maxTok: 262144, thinking: false, webSearch: false, mode: 'agent', model: 'z-ai/glm5', tgId: 'me' },
  attachedFiles: [],
  termOpen: false, 
};


// ===== Render App Shell =====
function renderShell() {
  document.getElementById('app').innerHTML = `
  <div class="shell">
    <aside class="side" id="side">
      <div class="side-top">
        <button class="side-new" id="newChat">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New chat
        </button>
      </div>
      <nav class="side-list" id="chatList"></nav>
      <div class="side-bot">
        <div class="side-model"><div class="side-dot"></div><span>Qwen 3.5 · 122B</span></div>
        <button class="ibtn" id="openSettings" title="Settings">⚙</button>
      </div>
    </aside>
    <div class="side-overlay" id="sideOverlay"></div>

    <button class="mob-btn" id="mobBtn">☰</button>

    <main class="main">
      <header class="topbar">
        <span class="topbar-t">Stacy 7-Pillar AI <span class="pulse" id="pulse" title="System Live"></span></span>
        <div class="topbar-spacer"></div>
        <button class="topbar-sched" id="openSkills" title="Manage AI Skills">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          <span>Skills</span>
        </button>
        <button class="topbar-sched" id="openCalendar" title="Calendar events">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span>Calendar</span>
        </button>
        <button class="topbar-sched" id="openMemory" title="Identity Memory">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a5 5 0 1 0 5 5 5 5 0 0 0-5-5zM19.21 19.07a8.66 8.66 0 0 0-14.42 0"/></svg>
          <span>Memory</span>
        </button>
        <button class="topbar-sched" id="toggleTerm" title="System Terminal">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
          <span>Terminal</span>
        </button>
      </header>


      <div class="chat-area" id="chatArea">
        <div class="welcome" id="welcome">
          <div class="welcome-c">
            <div class="welcome-icon">
              <svg viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7L12 12L22 7L12 2Z" fill="white" opacity=".9"/><path d="M2 17L12 22L22 17" stroke="white" stroke-width="2" stroke-linecap="round" opacity=".6"/><path d="M2 12L12 17L22 12" stroke="white" stroke-width="2" stroke-linecap="round" opacity=".8"/></svg>
            </div>
            <h1>What can I help you with?</h1>
            <p>AI Agent · Code Writer · Scheduler</p>
            <div class="sug-grid" id="sugGrid"></div>
          </div>
        </div>
        <div class="msgs" id="msgs" style="display:none"></div>
        <div class="term-panel" id="termPanel"><div class="term-head"><span>Terminal Logs</span><button class="ibtn" id="termMin">✕</button></div><div class="term-body" id="termBody"></div></div>
      </div>

      <div class="inp-wrap">

        <div id="fileChips" class="file-chips"></div>
        <div class="inp-box">
          <input type="file" id="fileInput" hidden multiple>
          <textarea id="input" placeholder="Message Qwen..." rows="1"></textarea>
          <div class="inp-foot">
            <div style="display:flex; gap:6px;">
              <button class="think-pill" id="attachBtn" title="Attach files">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              </button>
              <button class="think-pill" id="thinkPill">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
                Extended thinking
              </button>
              <button class="think-pill" id="webPill">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                Web Search
              </button>
            </div>
            <button class="send-btn" id="sendBtn" disabled>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-7-7l7 7-7 7" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
        </div>
        <p class="disclaim">Qwen can make mistakes. Double-check responses.</p>
      </div>
    </main>

    <aside class="art-panel" id="artPanel">
      <div class="art-head">
        <div class="art-title"><span>‹›</span> <span id="artName">Code</span></div>
        <div class="art-acts">
          <button class="ibtn" id="artCopy" title="Copy">📋</button>
          <button class="ibtn" id="artClose" title="Close">✕</button>
        </div>
      </div>
      <div class="art-tabs" id="artTabs"></div>
      <div class="art-body"><pre><code id="artCode"></code></pre></div>
    </aside>
  </div>

  <div class="modal-bg" id="settingsModal">
    <div class="modal">
      <div class="modal-top"><h2>⚙ Settings</h2><button class="ibtn" id="closeSettings">✕</button></div>
      <div class="modal-bd">
        <div class="ctrl"><div class="ctrl-row"><label>Mode</label></div>
          <select id="sMode" class="ctrl-select">
            <option value="agent">General Agent</option>
            <option value="coding">Coding Agent</option>
          </select>
          <p class="ctrl-hint">Switch between coding mode and general assistance.</p>
        </div>
        <div class="ctrl"><div class="ctrl-row"><label>Model</label></div>
          <select id="sModel" class="ctrl-select">
            <option value="z-ai/glm5">GLM 5 (Smart/Reasoning)</option>
            <option value="qwen/qwen3.5-122b-a10b">Qwen 3.5 122B</option>
            <option value="qwen/qwen3-next-80b-a3b-thinking">Qwen 3 Thinking (80B)</option>
            <option value="qwen/qwen3-next-80b-a3b-instruct">Qwen 3 Fast (80B)</option>
          </select>
          <p class="ctrl-hint">Choose the AI brain for your agent.</p>
        </div>
        <div class="ctrl"><div class="ctrl-row"><label>Temperature</label><span class="ctrl-val" id="vTemp">0.60</span></div><input type="range" id="sTemp" min="0" max="1" step=".05" value=".6"><p class="ctrl-hint">Lower = focused. Higher = creative.</p></div>
        <div class="ctrl"><div class="ctrl-row"><label>Top P</label><span class="ctrl-val" id="vTopP">0.95</span></div><input type="range" id="sTopP" min="0" max="1" step=".05" value=".95"><p class="ctrl-hint">Nucleus sampling threshold.</p></div>
        <div class="ctrl"><div class="ctrl-row"><label>Max Tokens (Context)</label><span class="ctrl-val" id="vMax">262144</span></div><input type="range" id="sMax" min="1024" max="262144" step="1024" value="262144"><p class="ctrl-hint">Maximum context/response length (up to 254k+).</p></div>
        <div class="ctrl"><div class="ctrl-row"><label>Telegram ID Sync</label></div><input type="text" id="sTgId" class="ctrl-input" placeholder="Enter your Telegram ID"><p class="ctrl-hint">Enter your ID to sync your Telegram calendar.</p></div>
        <div class="ctrl" style="margin-top:15px; border-top:1px solid var(--border); padding-top:10px;">
          <div class="ctrl-row"><label>🛡️ Architecture Status</label><span id="sysStatus" style="font-size:.7rem;color:var(--text-3)">Checking nodes...</span></div>
          <button class="ibtn danger" style="width:100%; margin-top:10px; font-size:.75rem" onclick="clearLocalMemory()">🗑️ Clear Local History</button>
        </div>
      </div>
    </div>
  </div>

  <div class="modal-bg" id="schedModal">
    <div class="modal">
      <div class="modal-top"><h2>⏰ Scheduled Tasks</h2><button class="ibtn" id="closeSched">✕</button></div>
      <div class="modal-bd">
        <p style="font-size:.82rem;color:var(--text-2);margin-bottom:12px">Set up daily automated queries. Qwen will run these at the scheduled time and notify you.</p>
        <div class="sched-list" id="schedList"></div>
        <div class="sched-form">
          <input type="time" id="schedTime" value="08:00">
          <input type="text" id="schedQuery" placeholder="e.g. สรุปข่าวเทคโนโลยีวันนี้">
          <button class="sched-add" id="schedAdd">+ Add</button>
        </div>
      </div>
    </div>
  </div>

  <div class="modal-bg" id="skillsModal">
    <div class="modal modal-lg">
      <div class="modal-top"><h2>🛠️ Skill Architect</h2><button class="ibtn" id="closeSkills">✕</button></div>
      <div class="modal-bd">
        <p style="font-size:.82rem;color:var(--text-2);margin-bottom:12px">Define custom capabilities for Stacy. Use specific instructions and schemas.</p>
        <div class="skill-grid" id="skillList"></div>
        <div class="skill-form">
          <input type="text" id="skName" placeholder="Skill Name (e.g. FlightBooker)">
          <input type="text" id="skDesc" placeholder="Brief Description">
          <textarea id="skInst" placeholder="Special Instructions / Logic" rows="3"></textarea>
          <button class="sched-add" id="skAdd" style="width:100%">+ Install New Skill</button>
        </div>
      </div>
    </div>
  </div>

  <div class="modal-bg" id="calendarModal">
    <div class="modal modal-lg">
      <div class="modal-top">
        <h2 id="calMonthTitle">📅 Calendar</h2>
        <div style="display:flex; gap:8px">
          <button class="ibtn" id="calPrev">◀</button>
          <button class="ibtn" id="calNext">▶</button>
          <button class="ibtn" id="closeCalendar">✕</button>
        </div>
      </div>
      <div class="modal-bd">
        <div class="cal-grid" id="calGrid"></div>
      </div>
    </div>
  </div>

  <div class="modal-bg" id="taskModal">
    <div class="modal">
      <div class="modal-top"><h2 id="taskDateTitle">Tasks</h2><button class="ibtn" id="closeTask">✕</button></div>
      <div class="modal-bd">
        <div class="task-list" id="taskList"></div>
      </div>
    </div>
  </div>
  <div class="modal-bg" id="memoryModal">
    <div class="modal">
      <div class="modal-top"><h2>🧠 Identity Memory</h2><button class="ibtn" id="closeMemory">✕</button></div>
      <div class="modal-bd">
        <p style="font-size:.82rem;color:var(--text-3);margin-bottom:12px">Current identity: <strong id="currentIdentity">Stacy Agent</strong></p>
        <div id="memoryFacts" class="memory-list"></div>
      </div>
    </div>
  </div>

  <div class="toast" id="toast"></div>`;

  renderSuggestions();
  bindAll();
  renderChatList();
  updateThinkPill();
  updateWebPill();
  updateSettingsUI();
  updateSchedCount();
  if (S.activeId) renderChat();
  fetchSchedules();
}

// ===== Suggestions =====
const SUGGESTIONS = [
  { t: 'Build a REST API', s: 'Node.js + JWT authentication', p: 'Build a complete REST API in Node.js with Express, JWT auth, users CRUD, error handling, and input validation. Write all files.' },
  { t: 'Create a React component', s: 'sortable data table', p: 'Create a React component for a sortable, filterable data table with pagination, column resizing and row selection.' },
  { t: 'Python automation', s: 'file watcher & backup', p: 'Write a Python script that monitors a directory for changes and backs up modified files with timestamps.' },
  { t: 'Architecture comparison', s: 'microservices vs monolith', p: 'Compare microservices vs monolithic architecture. When to use each? Include comparison table.' },
];

function renderSuggestions() {
  const g = document.getElementById('sugGrid');
  g.innerHTML = SUGGESTIONS.map(s => `<button class="sug" data-p="${esc(s.p)}"><span class="sug-t">${s.t}</span><span class="sug-s">${s.s}</span></button>`).join('');
  g.querySelectorAll('.sug').forEach(b => b.addEventListener('click', () => {
    document.getElementById('input').value = b.dataset.p;
    autoResize(); updateSendBtn(); handleSend();
  }));
}

// ===== Event Binding =====
function bindAll() {
  const $ = id => document.getElementById(id);

  $('sendBtn').addEventListener('click', handleSend);
  $('input').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } });
  $('input').addEventListener('input', () => { autoResize(); updateSendBtn(); });
  $('newChat').addEventListener('click', newChat);
  $('mobBtn').addEventListener('click', () => $('side').classList.toggle('open'));
  $('sideOverlay').addEventListener('click', () => $('side').classList.remove('open'));
  $('thinkPill').addEventListener('click', () => { S.settings.thinking = !S.settings.thinking; updateThinkPill(); save(); });
  $('webPill').addEventListener('click', () => { S.settings.webSearch = !S.settings.webSearch; updateWebPill(); save(); });
  $('attachBtn').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', handleFileAttach);

  // Settings
  $('openSettings').addEventListener('click', () => $('settingsModal').classList.add('vis'));
  $('closeSettings').addEventListener('click', () => $('settingsModal').classList.remove('vis'));
  $('settingsModal').addEventListener('click', e => { if (e.target.id === 'settingsModal') $('settingsModal').classList.remove('vis'); });
  $('sMode').addEventListener('change', e => { S.settings.mode = e.target.value; save(); });
  $('sModel').addEventListener('change', e => { S.settings.model = e.target.value; save(); });
  $('sTemp').addEventListener('input', e => { S.settings.temp = +e.target.value; $('vTemp').textContent = S.settings.temp.toFixed(2); save(); });
  $('sTopP').addEventListener('input', e => { S.settings.topP = +e.target.value; $('vTopP').textContent = S.settings.topP.toFixed(2); save(); });
  $('sMax').addEventListener('input', e => { S.settings.maxTok = +e.target.value; $('vMax').textContent = S.settings.maxTok; save(); });
  $('sTgId').addEventListener('input', e => { S.settings.tgId = e.target.value; save(); });

  // Scheduler
  $('openSched').addEventListener('click', () => { $('schedModal').classList.add('vis'); renderSchedList(); });
  $('closeSched').addEventListener('click', () => $('schedModal').classList.remove('vis'));
  $('schedModal').addEventListener('click', e => { if (e.target.id === 'schedModal') $('schedModal').classList.remove('vis'); });
  $('schedAdd').addEventListener('click', addSchedule);

  // Skills
  $('openSkills').addEventListener('click', () => { $('skillsModal').classList.add('vis'); renderSkills(); });
  $('closeSkills').addEventListener('click', () => $('skillsModal').classList.remove('vis'));
  $('skAdd').addEventListener('click', addSkill);
  $('toggleTerm').addEventListener('click', toggleTerm);
  $('termMin').addEventListener('click', toggleTerm);


  // Calendar
  $('openCalendar').addEventListener('click', () => { $('calendarModal').classList.add('vis'); renderCalendar(); });
  $('closeCalendar').addEventListener('click', () => $('calendarModal').classList.remove('vis'));
  $('calPrev').addEventListener('click', () => { currentMonth.setMonth(currentMonth.getMonth() - 1); renderCalendar(); });
  $('calNext').addEventListener('click', () => { currentMonth.setMonth(currentMonth.getMonth() + 1); renderCalendar(); });
  $('calendarModal').addEventListener('click', e => { if (e.target.id === 'calendarModal') $('calendarModal').classList.remove('vis'); });
  $('closeMemory').addEventListener('click', () => $('memoryModal').classList.remove('vis'));
  $('openMemory').addEventListener('click', () => { $('memoryModal').classList.add('vis'); renderMemory(); });
  $('closeTask').addEventListener('click', () => $('taskModal').classList.remove('vis'));

  // Artifact
  $('artClose').addEventListener('click', closeArt);
  $('artCopy').addEventListener('click', () => {
    navigator.clipboard.writeText($('artCode').textContent).then(() => showToast('✅ Copied to clipboard'));
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { $('settingsModal').classList.remove('vis'); $('schedModal').classList.remove('vis'); closeArt(); $('side').classList.remove('open'); }
  });
}

// ===== Helpers =====
function esc(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
function autoResize() { const t = document.getElementById('input'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 160) + 'px'; }
function updateSendBtn() {
  const btn = document.getElementById('sendBtn');
  const has = document.getElementById('input').value.trim().length > 0;
  if (S.streaming) { btn.classList.remove('ok'); btn.classList.add('stop'); btn.disabled = false; btn.onclick = stopStream; }
  else { btn.classList.remove('stop'); btn.onclick = handleSend; btn.classList.toggle('ok', has); btn.disabled = !has; }
}
function updateThinkPill() { document.getElementById('thinkPill').classList.toggle('on', S.settings.thinking); }
function updateWebPill() { document.getElementById('webPill').classList.toggle('on', !!S.settings.webSearch); }
function updateSettingsUI() {
  const modeSel = document.getElementById('sMode'); if (modeSel) modeSel.value = S.settings.mode || 'agent';
  const modelSel = document.getElementById('sModel'); if (modelSel) modelSel.value = S.settings.model || 'z-ai/glm5';
  document.getElementById('sTemp').value = S.settings.temp; document.getElementById('vTemp').textContent = S.settings.temp.toFixed(2);
  document.getElementById('sTopP').value = S.settings.topP; document.getElementById('vTopP').textContent = S.settings.topP.toFixed(2);
  document.getElementById('sMax').value = S.settings.maxTok; document.getElementById('vMax').textContent = S.settings.maxTok;
  const tgIdInput = document.getElementById('sTgId'); if (tgIdInput) tgIdInput.value = S.settings.tgId || 'me';
}
function scrollBot() { requestAnimationFrame(() => { const a = document.getElementById('chatArea'); a.scrollTop = a.scrollHeight; }); }

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ===== File Handling =====
async function handleFileAttach(e) {
  const files = Array.from(e.target.files);
  for (const f of files) {
    if (f.size > 1024 * 1024) { showToast(`❌ File ${f.name} too large (>1MB)`); continue; }
    const content = await f.text();
    S.attachedFiles.push({ name: f.name, content });
  }
  renderFileChips();
  e.target.value = '';
}

function renderFileChips() {
  const el = document.getElementById('fileChips');
  el.innerHTML = S.attachedFiles.map((f, i) => `
    <div class="file-chip">
      <span>${esc(f.name)}</span>
      <button onclick="removeFile(${i})">✕</button>
    </div>
  `).join('');
  el.style.display = S.attachedFiles.length ? 'flex' : 'none';
}

function removeFile(i) {
  S.attachedFiles.splice(i, 1);
  renderFileChips();
}

// ===== Persistence =====
const firebaseConfig = {
  apiKey: "AIzaSyDvqwiVCAm6yzX6YCH-ReQac-1ZSVxLGP8",
  authDomain: "ai--agent-12d7a.firebaseapp.com",
  projectId: "ai--agent-12d7a",
  storageBucket: "ai--agent-12d7a.firebasestorage.app",
  messagingSenderId: "1022795334044",
  appId: "1:1022795334044:web:44f14c8486d1c178050859",
  measurementId: "G-ZPNSM95NEC"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let syncTimer = null;
function save() {
  try {
    localStorage.setItem('qwen-v4', JSON.stringify({ chats: S.chats, activeId: S.activeId, settings: S.settings, artifacts: S.artifacts }));
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      db.collection('users').doc('me').set({
        chats: S.chats, activeId: S.activeId, settings: S.settings, artifacts: S.artifacts
      }).catch(e => console.error("Firebase sync error:", e));
    }, 1500);
  } catch (e) { }
}

function load() {
  try {
    const d = JSON.parse(localStorage.getItem('qwen-v4') || '{}');
    S.chats = d.chats || []; S.activeId = d.activeId || null; S.artifacts = d.artifacts || []; if (d.settings) S.settings = { ...S.settings, ...d.settings };

    // Real-time Cloud Sync
    db.collection('users').doc('me').onSnapshot(doc => {
      if (doc.exists) {
        const data = doc.data();
        const curState = JSON.stringify({ c: S.chats, a: S.artifacts, s: S.settings });
        const newState = JSON.stringify({ c: data.chats, a: data.artifacts, s: data.settings });

        if (curState !== newState && document.getElementById('chatList')) {
          S.chats = data.chats || [];
          S.activeId = data.activeId || null;
          S.artifacts = data.artifacts || [];
          if (data.settings) S.settings = { ...S.settings, ...data.settings };

          localStorage.setItem('qwen-v4', JSON.stringify({ chats: S.chats, activeId: S.activeId, settings: S.settings, artifacts: S.artifacts }));
          renderChatList();
          if (S.activeId) { renderChat(); } else {
            document.getElementById('welcome').style.display = '';
            document.getElementById('msgs').style.display = 'none';
          }
          updateSettingsUI();
          updateThinkPill(); updateWebPill();
        }
      }
    });
  } catch (e) { }
}

// ===== Chat Management =====
function getChat() { return S.chats.find(c => c.id === S.activeId); }
function newChat() {
  S.activeId = null; closeArt();
  document.getElementById('welcome').style.display = '';
  document.getElementById('msgs').style.display = 'none';
  document.getElementById('msgs').innerHTML = '';
  document.getElementById('input').value = '';
  autoResize(); updateSendBtn(); renderChatList();
  document.getElementById('input').focus();
  document.getElementById('side').classList.remove('open');
}
function createChat(msg) {
  const c = { id: 'c' + Date.now(), title: msg.slice(0, 45) + (msg.length > 45 ? '…' : ''), messages: [], ts: Date.now() };
  S.chats.unshift(c); S.activeId = c.id; save(); renderChatList(); return c;
}
function delChat(id) { S.chats = S.chats.filter(c => c.id !== id); S.artifacts = S.artifacts.filter(a => a.cid !== id); if (S.activeId === id) newChat(); save(); renderChatList(); }
function switchChat(id) { if (S.streaming) return; S.activeId = id; closeArt(); save(); renderChat(); renderChatList(); document.getElementById('side').classList.remove('open'); }

function renderChatList() {
  const el = document.getElementById('chatList');
  el.innerHTML = S.chats.map(c => `<div class="side-item${c.id === S.activeId ? ' on' : ''}" data-id="${c.id}"><span>${esc(c.title)}</span><button class="del" data-del="${c.id}">✕</button></div>`).join('');
  el.querySelectorAll('.side-item').forEach(i => i.addEventListener('click', e => { if (e.target.closest('.del')) { e.stopPropagation(); delChat(e.target.closest('.del').dataset.del); } else switchChat(i.dataset.id); }));
}

function renderChat() {
  const c = getChat(); if (!c) return;
  document.getElementById('welcome').style.display = 'none';
  const msgs = document.getElementById('msgs');
  msgs.style.display = 'flex';
  const frag = document.createDocumentFragment();
  c.messages.forEach(m => frag.appendChild(makeMsgEl(m.role, m.content, m.thinking, false)));
  msgs.innerHTML = ''; msgs.appendChild(frag); scrollBot();
}

// ===== Message Element =====
const AI_ICO = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7L12 12L22 7L12 2Z" fill="white" opacity=".9"/><path d="M2 17L12 22L22 17" stroke="white" stroke-width="2" stroke-linecap="round" opacity=".6"/><path d="M2 12L12 17L22 12" stroke="white" stroke-width="2" stroke-linecap="round" opacity=".8"/></svg>`;

function makeMsgEl(role, content, thinking, anim = true) {
  const el = document.createElement('div');
  el.className = 'msg';
  if (!anim) el.style.animation = 'none';
  const isU = role === 'user';
  let thk = '';
  if (thinking) {
    const tid = 't' + Math.random().toString(36).substr(2, 5);
    thk = `<div class="think" id="${tid}"><div class="think-h" onclick="toggleThink('${tid}')"><span>💭</span><span>Thinking</span><svg class="chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></div><div class="think-bd"><div class="think-tx">${fmtMd(thinking)}</div></div></div>`;
  }
  el.innerHTML = `<div class="msg-row"><div class="msg-av ${isU ? 'u' : 'a'}">${isU ? 'U' : AI_ICO}</div><div class="msg-bd"><div class="msg-nm">${isU ? 'You' : 'Qwen Agent'}</div>${thk}<div class="msg-tx">${fmtCode(content)}</div></div></div>`;
  return el;
}

window.toggleThink = id => { const b = document.getElementById(id); if (!b) return; b.querySelector('.think-bd').classList.toggle('exp'); b.querySelector('.chev').classList.toggle('open'); };
window.copyBlock = btn => { const c = btn.closest('.codeblk').querySelector('code'); navigator.clipboard.writeText(c.textContent).then(() => { btn.textContent = '✓'; setTimeout(() => btn.textContent = 'Copy', 1500); }); };
window.openBlock = idx => {
  const c = getChat(); if (!c) return;
  const blocks = extractBlocks(c.messages.filter(m => m.role === 'assistant').map(m => m.content).join('\n'));
  if (blocks[idx]) openArt(blocks[idx].title, blocks[idx].lang, blocks[idx].code);
};

// ===== Markdown =====
function fmtMd(t) {
  if (!t) return '';
  let h = esc(t);
  h = h.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\n\n/g, '</p><p>');
  h = h.replace(/\n/g, '<br>');
  return '<p>' + h + '</p>';
}

function fmtCode(t) {
  if (!t) return '';
  let h = esc(t), bi = 0;
  h = h.replace(/```(\w*)\n([\s\S]*?)```/g, (_, l, c) => {
    const lang = l || 'code', i = bi++;
    return `<div class="codeblk"><div class="codeblk-h"><span>${lang}</span><div class="acts"><button onclick="copyBlock(this)">Copy</button><button onclick="openBlock(${i})">Open ↗</button></div></div><pre><code>${c}</code></pre></div>`;
  });
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>');
  h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  h = h.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  h = h.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  h = h.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  h = h.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
  h = h.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  h = h.replace(/^\|(.+)\|$/gm, (line) => {
    const cells = line.split('|').map(x => x.trim()).filter(x => x !== '');
    if (cells.every(c => c.match(/^[:\s-]{3,}$/))) return '<!-- sep -->';
    return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
  });
  h = h.replace(/(?:<tr>.*<\/tr>\n?|<!-- sep -->\n?)+/g, m => {
    const rows = m.replace(/<!-- sep -->\n?/g, '');
    return rows ? `<table>${rows}</table>` : '';
  });

  h = h.replace(/\n\n/g, '</p><p>');
  h = h.replace(/\n/g, '<br>');
  h = '<p>' + h + '</p>';
  h = h.replace(/<p><\/p>/g, '');
  h = h.replace(/<p>(<(?:h[1-3]|div|ul|blockquote|table))/g, '$1');
  h = h.replace(/(<\/(?:h[1-3]|div|ul|blockquote|table)>)<\/p>/g, '$1');
  return h;
}

function extractBlocks(t) {
  const b = [], re = /```(\w*)\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(t)) !== null) {
    const lang = m[1] || 'code', code = m[2];
    const fl = code.split('\n')[0]?.trim() || '';
    let title = lang;
    if (fl.match(/^[/#-]+\s*.{2,40}$/)) title = fl.replace(/^[/#-]+\s*/, '');
    b.push({ lang, code, title });
  }
  return b;
}

// ===== Artifact Panel =====
function openArt(title, lang, code) {
  document.getElementById('artName').textContent = title || 'Code';
  document.getElementById('artCode').textContent = code;
  document.getElementById('artPanel').classList.add('open');
  const art = { id: 'a' + Date.now(), title, lang, code, cid: S.activeId };
  S.artifacts.push(art); S.activeArt = art.id; renderArtTabs(); save();
}
function closeArt() { document.getElementById('artPanel').classList.remove('open'); S.activeArt = null; }
function showArt(id) {
  const a = S.artifacts.find(x => x.id === id); if (!a) return;
  S.activeArt = id;
  document.getElementById('artName').textContent = a.title;
  document.getElementById('artCode').textContent = a.code;
  renderArtTabs();
}
function renderArtTabs() {
  const arts = S.artifacts.filter(a => a.cid === S.activeId);
  if (arts.length <= 1) { document.getElementById('artTabs').innerHTML = ''; return; }
  document.getElementById('artTabs').innerHTML = arts.map(a => `<button class="art-tab${a.id === S.activeArt ? ' on' : ''}" data-a="${a.id}">${esc(a.title || a.lang)}</button>`).join('');
  document.getElementById('artTabs').querySelectorAll('.art-tab').forEach(t => t.addEventListener('click', () => showArt(t.dataset.a)));
}

// ===== Scheduler (Server-side) =====
async function fetchSchedules() {
  try {
    const r = await fetch('/api/schedules');
    S.schedules = await r.json();
    renderSchedList(); updateSchedCount();
  } catch (e) { console.error('Failed fetching schedules', e); }
}

async function addSchedule() {
  const time = document.getElementById('schedTime').value;
  const query = document.getElementById('schedQuery').value.trim();
  if (!query) return;
  document.getElementById('schedQuery').value = '';

  try {
    await fetch('/api/schedules', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ time, query })
    });
    showToast(`⏰ Scheduled: "${query}" at ${time} daily`);
    fetchSchedules();
  } catch (e) { showToast('❌ Failed to add schedule'); }
}

function renderSchedList() {
  const el = document.getElementById('schedList');
  if (S.schedules.length === 0) { el.innerHTML = '<p style="font-size:.82rem;color:var(--text-3);text-align:center;padding:12px">No scheduled tasks yet</p>'; return; }

  el.innerHTML = S.schedules.map(s => {
    let tooltip = '';
    if (s.lastRun) tooltip += `Last Run: ${new Date(s.lastRun).toLocaleString()}\n`;
    if (s.lastResult) tooltip += `Result: ${s.lastResult.length > 50 ? s.lastResult.substring(0, 50) + '...' : s.lastResult}`;

    return `<div class="sched-entry" title="${tooltip}">
      <span class="time">${s.time}</span>
      <span class="query">${esc(s.query)}</span>
      <div class="toggle ${s.active ? 'on' : ''}" data-sid="${s.id}"></div>
      <button class="ibtn" data-sdel="${s.id}" title="Delete">✕</button>
    </div>`;
  }).join('');

  el.querySelectorAll('.toggle').forEach(t => t.addEventListener('click', async () => {
    const sc = S.schedules.find(x => x.id === t.dataset.sid);
    if (sc) {
      sc.active = !sc.active; renderSchedList(); // Opt UI update
      await fetch(`/api/schedules/${sc.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: sc.active }) });
      fetchSchedules();
    }
  }));

  el.querySelectorAll('[data-sdel]').forEach(b => b.addEventListener('click', async () => {
    await fetch(`/api/schedules/${b.dataset.sdel}`, { method: 'DELETE' });
    fetchSchedules();
  }));
}

function updateSchedCount() {
  const active = S.schedules.filter(s => s.active).length;
  const el = document.getElementById('schedCount');
  const btn = document.getElementById('openSched');
  if (el) el.textContent = active > 0 ? `${active} task${active > 1 ? 's' : ''}` : 'Schedule';
  if (btn) btn.classList.toggle('has', active > 0);
}

// ===== Calendar Logic =====
let currentMonth = new Date();
let taskCache = [];

async function fetchTasks() {
    try {
        const id = S.settings.tgId || 'me';
        const snap = await db.collection('userActivities').doc(id).collection('tasks').orderBy('createdAt', 'desc').get();
        taskCache = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) { console.error('Tasks fetch error:', e); }
}

// ===== Skills Logic =====
async function fetchSkills() {
    try {
        const id = S.settings.tgId || 'me';
        const snap = await db.collection('userActivities').doc(id).collection('skills').get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) { return []; }
}

async function renderSkills() {
    const list = $('skillList');
    list.innerHTML = '<div class="loading-sm">Fetching architecture...</div>';
    const skills = await fetchSkills();
    list.innerHTML = skills.length === 0 ? '<p style="color:var(--text-3);font-size:.8rem">No custom skills found.</p>' : '';
    skills.forEach(s => {
        const el = document.createElement('div');
        el.className = 'skill-card';
        el.innerHTML = `
            <div class="skill-info">
                <div class="skill-name">${esc(s.id)}</div>
                <div class="skill-desc">${esc(s.description || 'No description')}</div>
            </div>
            <button class="ibtn danger" onclick="deleteSkill('${s.id}')">✕</button>
        `;
        list.appendChild(el);
    });
}

async function addSkill() {
    const n = $('skName').value.trim();
    const d = $('skDesc').value.trim();
    const i = $('skInst').value.trim();
    if (!n) return showToast('Skill name is required');
    const id = S.settings.tgId || 'me';
    try {
        await db.collection('userActivities').doc(id).collection('skills').doc(n).set({
            name: n, description: d, instructions: i, type: 'manual'
        });
        showToast(`Skill ${n} installed!`);
        $('skName').value = ''; $('skDesc').value = ''; $('skInst').value = '';
        renderSkills();
    } catch (e) { showToast('Sync failed: ' + e.message); }
}

window.deleteSkill = async (name) => {
    if (!confirm(`Uninstall ${name}?`)) return;
    const id = S.settings.tgId || 'me';
    try {
        await db.collection('userActivities').doc(id).collection('skills').doc(name).delete();
        showToast(`${name} uninstalled.`);
        renderSkills();
    } catch (e) { showToast('Deletion failed'); }
};


async function renderCalendar() {
  await fetchTasks();
  const grid = document.getElementById('calGrid');
  const monthTitle = document.getElementById('calMonthTitle');
  grid.innerHTML = '';

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  monthTitle.textContent = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(currentMonth);

  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();

  // Weekdays
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => {
    const el = document.createElement('div'); el.className = 'cal-day head'; el.textContent = d; grid.appendChild(el);
  });

  // Empty days
  for (let i = 0; i < firstDay; i++) {
    const el = document.createElement('div'); el.className = 'cal-day empty'; grid.appendChild(el);
  }

  const today = new Date();
  for (let d = 1; d <= lastDate; d++) {
    const el = document.createElement('div');
    el.className = 'cal-day';
    if (d === today.getDate() && month === today.getMonth() && year === today.getFullYear()) el.classList.add('today');
    
    // Check for tasks on this day
    const dayTasks = taskCache.filter(t => {
        if (!t.time) return false;
        const tDate = new Date(t.time);
        return tDate.getDate() === d && tDate.getMonth() === month && tDate.getFullYear() === year;
    });

    el.innerHTML = `<span>${d}</span>`;
    if (dayTasks.length > 0) {
        const dot = document.createElement('div'); dot.className = 'cal-dot'; el.appendChild(dot);
        el.classList.add('has-task');
    }

    el.onclick = () => showTasksForDay(d, dayTasks);
    grid.appendChild(el);
  }
}

async function renderMemory() {
    const list = document.getElementById('memoryFacts');
    const idDisplay = document.getElementById('currentIdentity');
    list.innerHTML = '<div class="loading-sm">Accessing neurons...</div>';
    
    const id = S.settings.tgId || 'me';
    try {
        const doc = await db.collection('userActivities').doc(id).get();
        if (doc.exists) {
            const data = doc.data();
            idDisplay.textContent = data.identity || "Stacy AI Agent";
            const facts = data.facts || [];
            list.innerHTML = facts.length === 0 ? '<p style="font-size:.8rem;color:var(--text-3)">No memory facts stored yet.</p>' : 
                facts.map(f => `<div class="memory-fact">🔹 ${esc(f)}</div>`).join('');
        } else {
            list.innerHTML = '<p style="font-size:.8rem;color:var(--text-3)">No identity profile found.</p>';
        }
    } catch (e) { list.innerHTML = 'Brain scan failed.'; }
}

function showTasksForDay(day, tasks) {
    if (tasks.length === 0) return;
    document.getElementById('taskModal').classList.add('vis');
    document.getElementById('taskDateTitle').textContent = `Tasks for ${day} ${document.getElementById('calMonthTitle').textContent}`;
    const list = document.getElementById('taskList');
    list.innerHTML = tasks.map(t => `
        <div class="task-card">
            <div class="task-time">${new Date(t.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
            <div class="task-title">${esc(t.title)}</div>
            <div class="task-status ${t.status}">${t.status}</div>
        </div>
    `).join('');
}

// ===== Title Generation =====
async function genTitle(chatId, msg) {
  try {
    const r = await fetch('/api/generate-title', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg }) });
    const d = await r.json();
    if (d.title) { const c = S.chats.find(x => x.id === chatId); if (c) { c.title = d.title; save(); renderChatList(); } }
  } catch (e) { }
}

// ===== Send & Stream =====
async function handleSend() {
  if (S.streaming) return;
  let txt = document.getElementById('input').value.trim();
  if (!txt && !S.attachedFiles.length) return;
  
  S.streaming = true;
  updateSendBtn();

  if (S.attachedFiles.length) {
    const fileCtx = S.attachedFiles.map(f => `FILE: ${f.name}\n---\n${f.content}\n---`).join('\n\n');
    txt = `[ATTACHED FILES]:\n${fileCtx}\n\n[USER MESSAGE]:\n${txt || "Analyze these files."}`;
    S.attachedFiles = [];
    renderFileChips();
  }

  let chat = getChat();
  const isNew = !chat;
  if (!chat) chat = createChat(txt);

  document.getElementById('welcome').style.display = 'none';
  const msgs = document.getElementById('msgs');
  msgs.style.display = 'flex';

  chat.messages.push({ role: 'user', content: txt });
  msgs.appendChild(makeMsgEl('user', txt));
  save();

  document.getElementById('input').value = '';
  autoResize(); scrollBot();
  if (isNew) genTitle(chat.id, txt);
  await streamResp(chat);
}

async function streamResp(chat) {
  S.ctrl = new AbortController();
  updateSendBtn();

  // Create streaming msg
  const el = document.createElement('div');
  el.className = 'msg'; el.id = 'smsg';
  el.innerHTML = `<div class="msg-row"><div class="msg-av a">${AI_ICO}</div><div class="msg-bd"><div class="msg-nm">Qwen Agent</div>
    <div class="think" id="sthink" style="display:none"><div class="think-h" onclick="toggleThink('sthink')"><span class="typing-d"><span></span><span></span><span></span></span><span class="stlabel">Thinking...</span><svg class="chev open" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></div><div class="think-bd exp"><div class="think-tx" id="sttext"></div></div></div>
    <div class="msg-tx" id="stx"><div class="typing-d"><span></span><span></span><span></span></div></div>
  </div></div>`;
  document.getElementById('msgs').appendChild(el);
  scrollBot();

  const sTx = document.getElementById('stx');
  const sThink = document.getElementById('sthink');
  const sThinkTx = document.getElementById('sttext');

  let full = '', fullT = '', inT = false, started = false, t0 = 0;
  let cD = false, tD = false, raf = null;
  const flush = () => { if (tD && sThinkTx) { sThinkTx.innerHTML = fmtMd(fullT); tD = false; } if (cD && sTx) { sTx.innerHTML = fmtCode(full) + '<span class="cursor-b"></span>'; cD = false; } scrollBot(); };
  const sched = () => { if (!raf) raf = requestAnimationFrame(() => { flush(); raf = null; }); };

  const messages = chat.messages.map(m => ({ role: m.role, content: m.content }));

  try {
    const res = await fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        temperature: S.settings.temp,
        top_p: S.settings.topP,
        max_tokens: S.settings.maxTok,
        enable_thinking: S.settings.thinking,
        web_search: S.settings.webSearch,
        mode: S.settings.mode,
        model: S.settings.model
      }),
      signal: S.ctrl.signal,
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.substring(0, nl); buf = buf.substring(nl + 1);
        if (!line.startsWith('data: ')) continue;
        const d = line.substring(6);
        if (d === '[DONE]') continue;
        try {
          const p = JSON.parse(d), delta = p.choices?.[0]?.delta;
          if (!delta) continue;
          if (delta.reasoning_content) {
            if (!inT) { inT = true; t0 = performance.now(); sThink.style.display = ''; }
            fullT += delta.reasoning_content; tD = true; sched();
          }
          if (delta.content) {
            if (inT) {
              inT = false;
              const sec = ((performance.now() - t0) / 1000).toFixed(1);
              const lbl = sThink.querySelector('.stlabel'); if (lbl) lbl.textContent = `Thought for ${sec}s`;
              const sp = sThink.querySelector('.typing-d'); if (sp) sp.outerHTML = '💭';
              const tb = sThink.querySelector('.think-bd'); if (tb) tb.classList.remove('exp');
              const ch = sThink.querySelector('.chev'); if (ch) ch.classList.remove('open');
            }
            if (!started) { started = true; sTx.innerHTML = ''; }
            full += delta.content; cD = true; sched();
          }
        } catch (e) { }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') { if (!full) full = '*(Stopped)*'; }
    else { full = `⚠️ ${err.message}`; if (sTx) sTx.innerHTML = fmtMd(full); }
  }

  if (raf) { cancelAnimationFrame(raf); raf = null; }
  const sm = document.getElementById('smsg'); if (sm) sm.remove();

  if (full) {
    // Check for tool calls in the response
    const toolCalls = extractToolCalls(full);

    if (toolCalls.length > 0) {
      // Show partial response (without tool markers)
      const cleanResponse = full.replace(/\[TOOL:\w+:[^\]]*\]/g, '').trim();
      if (cleanResponse) {
        chat.messages.push({ role: 'assistant', content: cleanResponse, thinking: fullT || null });
        document.getElementById('msgs').appendChild(makeMsgEl('assistant', cleanResponse, fullT || null, false));
      }

      // Execute tools
      const toolResults = [];
      for (const tc of toolCalls) {
        try {
          const r = await fetch('/api/tools/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tool: tc.tool, args: tc.args })
          });
          const d = await r.json();
          toolResults.push(`[Tool: ${tc.tool}] ${d.result || d.error || 'No result'}`);
        } catch (e) {
          toolResults.push(`[Tool: ${tc.tool}] Error: ${e.message}`);
        }
      }

      // Feed results back to AI for a summary
      const toolCtx = toolResults.join('\n\n');
      chat.messages.push({ role: 'user', content: `[TOOL RESULTS]:\n${toolCtx}\n\nPlease summarize these results for me in a clear, natural way.` });

      // Stream the follow-up response
      await streamResp(chat);
      return;
    }

    chat.messages.push({ role: 'assistant', content: full, thinking: fullT || null });
    document.getElementById('msgs').appendChild(makeMsgEl('assistant', full, fullT || null, false));
    // Auto-open artifact for big code blocks
    const blocks = extractBlocks(full);
    if (blocks.length > 0 && blocks[0].code.split('\n').length > 8) openArt(blocks[0].title, blocks[0].lang, blocks[0].code);
    save();
  }

  document.getElementById('input').focus();
}

// ===== Terminal Logic =====
function toggleTerm() {
    S.termOpen = !S.termOpen;
    document.getElementById('termPanel').classList.toggle('vis', S.termOpen);
    if (S.termOpen) initTerminal();
}

let termUnsub = null;
function initTerminal() {
    if (termUnsub) return;
    const id = S.settings.tgId || 'me';
    termUnsub = db.collection('userActivities').doc(id).collection('terminalLogs')
        .orderBy('timestamp', 'desc').limit(20)
        .onSnapshot(snap => {
            const body = document.getElementById('termBody');
            body.innerHTML = '';
            snap.forEach(doc => {
                const log = doc.data();
                const el = document.createElement('div');
                el.className = 'term-line';
                el.innerHTML = `<span class="term-cmd">> ${esc(log.command)}</span><pre class="term-out">${esc(log.output)}</pre>`;
                body.appendChild(el);
            });
        });
}


// ===== Tool Extraction =====
function extractToolCalls(text) {
  const re = /\[TOOL:(\w+):([^\]]*)\]/g;
  const calls = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const tool = m[1];
    const args = m[2].split('|');
    calls.push({ tool, args });
  }
  return calls;
}

function stopStream() { if (S.ctrl) S.ctrl.abort(); }

// ===== Boot =====
document.addEventListener('DOMContentLoaded', () => {
  load();
  renderShell();
  
  // Mobile dynamic height fix
  const vh = () => {
    let vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  };
  window.addEventListener('resize', vh);
  vh();
  initSystemHealth();
});

async function initSystemHealth() {
    const statusEl = document.getElementById('sysStatus');
    const pulse = document.getElementById('pulse');
    
    const check = async () => {
        try {
            const res = await fetch('/api/health');
            const data = await res.json();
            if (statusEl) statusEl.textContent = `Online (Uptime: ${Math.floor(data.uptime / 60)}m)`;
            if (pulse) pulse.style.background = 'var(--green)';
        } catch (e) {
            if (statusEl) statusEl.textContent = 'Hardware Node Disconnected';
            if (pulse) pulse.style.background = 'var(--red)';
        }
    };
    
    check();
    setInterval(check, 30000);
}

window.clearLocalMemory = () => {
    if (confirm('Clear all local chat history? This cannot be undone.')) {
        localStorage.removeItem('qwen-v4');
        location.reload();
    }
};
