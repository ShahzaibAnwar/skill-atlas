'use strict';
/* Skill Atlas dashboard. Data comes from the local server (/api/data); nothing leaves this computer. */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('atlas.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('atlas.' + k, JSON.stringify(v)); } catch {} },
};

// ---------- theme ----------
(function () { const t = store.get('theme', null); if (t) document.documentElement.dataset.theme = t; })();
$('#theme').onclick = () => {
  const cur = document.documentElement.dataset.theme;
  const dark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'light' : 'dark';
  store.set('theme', document.documentElement.dataset.theme);
  if (state.tab === 'skills') renderActivity();
};

// ---------- look & feel helpers ----------
const TOOL_COLOR = { 'Claude Code': 'var(--c-claude)', Codex: 'var(--c-codex)', 'Gemini CLI': 'var(--c-gemini)', Antigravity: 'var(--c-antigravity)', 'Shared (.agents)': 'var(--c-agents)', OpenCode: 'var(--c-opencode)', Cursor: 'var(--c-cursor)', Windsurf: 'var(--c-windsurf)' };
const toolColor = (t) => TOOL_COLOR[t] || 'var(--ink-3)';
const toolBadge = (t) => `<span class="badge b-tool" style="background:${toolColor(t)}">${esc(t)}</span>`;
const toolDots = (tools) => tools.map((t) => `<span class="dot" title="${esc(t)}" style="background:${toolColor(t)}"></span>`).join('');
const CAT = {
  'Video & Animation': ['#e0663d', '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>'],
  'Design & UI': ['#c2559a', '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.5-.8 1.5-1.6 0-1.3-1-1.6-1-2.6 0-.9.7-1.3 1.6-1.3H16a5 5 0 0 0 5-5C21 6.4 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15" cy="7.5" r="1"/>'],
  'SEO & Marketing': ['#2f8f6b', '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'],
  'Docs & Office': ['#3a74c9', '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'],
  'Data & Analytics': ['#7a5bd6', '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'],
  'Testing & Quality': ['#2b8a8a', '<path d="M9 12l2 2 4-4"/><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>'],
  Security: ['#b34747', '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'],
  'DevOps & Shipping': ['#c98417', '<path d="M5 15c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.8-.9.8-2.3 0-3.1a2.2 2.2 0 0 0-3 .1z"/><path d="M12 15l-3-3a22 22 0 0 1 2-4A13 13 0 0 1 22 2c0 2.7-.8 7.5-6 11a22 22 0 0 1-4 2z"/>'],
  'Planning & Product': ['#5468c4', '<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M9 2v4M15 2v4M8 11h8M8 15h5"/>'],
  'Writing & Comms': ['#9a6a3a', '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'],
  'Research & Web': ['#2f7fa8', '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'],
  Engineering: ['#4a5568', '<path d="M8 6l-6 6 6 6M16 6l6 6-6 6"/>'],
  Other: ['#7c766c', '<path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z"/>'],
  _plug: ['#5b6b8c', '<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4"/>'],
  _agent: ['#6d5bb0', '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'],
};
const catIcon = (c, cls = '') => { const [col, p] = CAT[c] || CAT.Other; return `<span class="ic ${cls}" style="background:color-mix(in srgb,${col} 15%,transparent);color:${col}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg></span>`; };
const STAR_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>';

const DAY = 864e5;
function ago(ts) {
  if (!ts) return '';
  const d = (Date.now() - new Date(ts)) / 1000;
  if (d < 60) return 'just now'; if (d < 3600) return Math.floor(d / 60) + ' min ago'; if (d < 86400) return Math.floor(d / 3600) + ' h ago';
  const days = Math.floor(d / 86400); if (days === 1) return 'yesterday'; if (days < 30) return days + ' days ago';
  const mo = Math.floor(days / 30.4); if (mo < 12) return mo + (mo === 1 ? ' month ago' : ' months ago');
  const y = Math.floor(days / 365); return y + (y === 1 ? ' year ago' : ' years ago');
}
const fmtDate = (ts) => (ts ? new Date(ts).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const fmtDay = (ts) => (ts ? new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const base = (p) => (p ? String(p).split(/[\\/]/).filter(Boolean).pop() : '');
const fmtSize = (b) => (!b ? '—' : b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : (b / 1048576).toFixed(1) + ' MB');
const plural = (n, w) => `${n.toLocaleString()} ${w}${n === 1 ? '' : 's'}`;
const daysAgo = (ts) => (ts ? (Date.now() - new Date(ts)) / DAY : Infinity);

function md(src) {
  if (!src) return '';
  const lines = String(src).replace(/\r/g, '').split('\n'); let out = ''; let list = null; let para = []; let i = 0;
  const inline = (t) => esc(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
  const flushP = () => { if (para.length) { out += `<p>${inline(para.join(' '))}</p>`; para = []; } };
  const flushL = () => { if (list) { out += `</${list}>`; list = null; } };
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*(```|~~~)/.test(l)) { flushP(); flushL(); const buf = []; i++; while (i < lines.length && !/^\s*(```|~~~)/.test(lines[i])) buf.push(lines[i++]); i++; out += `<pre><code>${esc(buf.join('\n'))}</code></pre>`; continue; }
    const h = l.match(/^(#{1,6})\s+(.*)/);
    if (h) { flushP(); flushL(); const n = Math.min(h[1].length, 5); out += `<h${n}>${inline(h[2])}</h${n}>`; i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(l)) { flushP(); flushL(); const rows = []; while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]); out += '<table>' + rows.filter((r) => !/^\s*\|[\s:|-]+\|\s*$/.test(r)).map((r, ri) => '<tr>' + r.trim().slice(1, -1).split('|').map((c) => (ri === 0 ? `<th>${inline(c.trim())}</th>` : `<td>${inline(c.trim())}</td>`)).join('') + '</tr>').join('') + '</table>'; continue; }
    const li = l.match(/^\s*([-*+]|\d+[.)])\s+(.*)/);
    if (li) { flushP(); const t = /\d/.test(li[1]) ? 'ol' : 'ul'; if (list !== t) { flushL(); out += `<${t}>`; list = t; } out += `<li>${inline(li[2])}</li>`; i++; continue; }
    if (!l.trim()) { flushP(); flushL(); i++; continue; }
    if (/^\s*>/.test(l)) { flushP(); flushL(); out += `<div class="quote">${inline(l.replace(/^\s*>\s?/, ''))}</div>`; i++; continue; }
    flushL(); para.push(l.trim()); i++;
  }
  flushP(); flushL(); return out;
}

function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 1700); }
function showTip(e, html) { const tip = $('#tip'); tip.innerHTML = html; tip.style.opacity = 1; tip.style.left = Math.min(e.clientX + 12, innerWidth - 290) + 'px'; tip.style.top = (e.clientY + 14) + 'px'; }
function hideTip() { $('#tip').style.opacity = 0; }

// ---------- state ----------
let D = null; let E = []; let BY = new Map(); let IDX = null; let SEARCH = null;
let USER = { favorites: [], notes: {} };
const state = {
  tab: 'skills', q: '', status: store.get('status', 'all'), tools: new Set(store.get('tools', [])), cat: store.get('cat', ''),
  group: store.get('group', 'none'), sort: store.get('sort', 'recent'), view: store.get('view', 'grid'), heat: store.get('heat', 'weeks'),
  csMode: store.get('csMode', 'used'), csExamples: store.get('csExamples', true), mcpFilter: 'all', projQ: '', projSort: 'recent',
  open: null, navList: [], showAll: {},
};
const isFav = (k) => USER.favorites.includes(k);
const noteOf = (k) => USER.notes[k] || '';

function prepare() {
  E = D.entries.map((e) => ({ ...e, weeks: weekBuckets(e.uses, 12) }));
  BY = new Map(E.map((e) => [e.key, e]));
  buildIndex();
}
function buildIndex() { IDX = new TextIndex.Index(E.map((e) => ({ id: e.key, fields: TextIndex.fieldsForEntry(e, noteOf(e.key)) }))); SEARCH = null; }

function searchMap(q) {
  const res = IDX.search(q, { limit: 400 });
  const m = new Map(res.map((r) => [r.id, { score: r.score, terms: r.terms }]));
  const ql = q.toLowerCase().trim();
  if (ql.length >= 2) for (const e of E) {
    const hay = [e.name, e.displayName, ...e.installs.map((i) => i.invokeName), noteOf(e.key)].join(' ').toLowerCase();
    if (hay.includes(ql)) { const cur = m.get(e.key) || { score: 0, terms: [] }; cur.score += e.name.toLowerCase() === ql ? 30 : 12; m.set(e.key, cur); }
  }
  return m;
}

function weekStart(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }
function weekBuckets(uses, n) {
  const now = weekStart(Date.now()); const arr = new Array(n).fill(0);
  for (const u of uses || []) { const idx = n - 1 - Math.round((now - weekStart(u.ts)) / (7 * DAY)); if (idx >= 0 && idx < n) arr[idx]++; }
  return arr;
}

function statusPill(e) {
  if (!e.lastUsed) return e.usageTracked ? '<span class="pill p-warn">Never used</span>' : '<span class="pill p-mid">Usage not tracked</span>';
  return `<span class="pill ${daysAgo(e.lastUsed) <= 30 ? 'p-good' : 'p-mid'}">Used ${esc(ago(e.lastUsed))}</span>`;
}
function cmdsFor(e) {
  const out = []; const seen = new Set();
  for (const i of e.installs) {
    let cmd = null;
    if (i.tool === 'Claude Code') cmd = '/' + i.invokeName + (e.argumentHint ? ' ' + e.argumentHint : '');
    else if (i.tool === 'Codex') cmd = '$' + e.name;
    if (cmd && !seen.has(cmd)) { seen.add(cmd); out.push({ tool: i.tool, cmd }); }
  }
  return out;
}
const realName = (e) => (e.installs[0] ? e.installs[0].invokeName : e.name);
const descOf = (e) => (e.ai && e.ai.oneLiner) || e.summary || e.description || (e.virtual ? 'Built into the app or loaded from the cloud, so there is no local file to describe it.' : 'No description in the skill file.');
function forWhat(u) { if (!u) return ''; const p = u.prompt || ''; if (p.length >= 40 || !u.topic) return p || u.topic || ''; return u.topic === p ? p : `${u.topic}${p ? ' → "' + p + '"' : ''}`; }

// ---------- user data (favorites + notes, saved on this computer) ----------
async function loadUser() { try { USER = await (await fetch('/api/user-data')).json(); } catch {} }
let saveT;
function saveUser(now) {
  clearTimeout(saveT);
  const go = () => fetch('/api/user-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(USER) })
    .then((r) => { if (!r.ok) throw 0; const s = $('#saved'); if (s) { s.classList.add('on'); setTimeout(() => s.classList.remove('on'), 1200); } })
    .catch(() => toast('Could not save. Is Skill Atlas still running?'));
  if (now) go(); else saveT = setTimeout(go, 600);
}
function toggleFav(key) {
  const i = USER.favorites.indexOf(key);
  if (i >= 0) USER.favorites.splice(i, 1); else USER.favorites.push(key);
  saveUser(true);
  $$(`[data-star="${CSS.escape(key)}"]`).forEach((b) => { b.classList.toggle('on', isFav(key)); b.setAttribute('aria-pressed', isFav(key)); });
  toast(isFav(key) ? 'Starred' : 'Removed star');
  if (state.status === 'fav' && state.tab === 'skills') renderList();
  renderTabs();
}

// ---------- tabs + routing ----------
const TABS = [['skills', 'Skills'], ['discover', 'Discover'], ['projects', 'Projects'], ['cleanup', 'Cleanup'], ['mcp', 'MCP & Agents'], ['cheatsheet', 'Cheat sheet']];
function renderTabs() {
  if (!D) return;
  const n = { skills: E.filter((e) => !e.virtual).length, discover: D.rediscover.length + D.overlaps.length, projects: D.projects.length, cleanup: D.cleanup.oldVersions.length + D.cleanup.duplicates.length, mcp: D.mcp.filter((m) => m.used.count || m.configs.length).length + D.agents.filter((a) => a.used.count).length, cheatsheet: null };
  $('#tabs').innerHTML = TABS.map(([k, label], i) => `<button class="tab" role="tab" data-tab="${k}" aria-selected="${state.tab === k}" title="${label} (${i + 1})">${label}${n[k] != null ? ` <span class="n">${n[k]}</span>` : ''}</button>`).join('');
}
function setTab(tab, push = true) {
  if (!TABS.some(([k]) => k === tab)) tab = 'skills';
  state.tab = tab;
  if (push) history.pushState(null, '', '#/' + tab);
  $$('.view').forEach((v) => { v.hidden = v.id !== 'v-' + tab; });
  renderTabs();
  RENDER[tab]();
  scrollTo({ top: 0 });
}
function route() {
  if (location.hash && !location.hash.startsWith('#/')) return; // in-page anchors, e.g. #c-old
  const m = location.hash.match(/^#\/([a-z]+)(?:\/skill\/(.+))?$/);
  const tab = m ? m[1] : 'skills';
  if (tab !== state.tab || !$('#v-' + tab) || $('#v-' + tab).hidden) setTab(tab, false);
  if (m && m[2]) openSkill(decodeURIComponent(m[2]), false); else closeSkill(true);
}
addEventListener('popstate', route);

// ---------- loading + live status ----------
async function load(refresh) {
  try {
    const r = await fetch('/api/data' + (refresh ? '?refresh=1' : ''));
    D = await r.json();
    if (D.error) throw new Error(D.error);
    prepare();
    if (D.demo && !$('#demobadge')) $('#home').insertAdjacentHTML('beforeend', '<span id="demobadge" class="pill p-warn" title="Running with made-up sample data">Demo</span>');
    $('#loading').hidden = true;
    renderTabs();
    route();
    updateStatus(D.status);
    if (D.status && (D.status.scanning || D.status.summary.running)) watch();
  } catch (e) { $('#loadmsg').textContent = 'Could not load: ' + e.message; }
}
let watching = false;
async function watch() {
  if (watching) return; watching = true;
  let lastGen = D.generatedAt; let lastSum = D.status && D.status.summary.done;
  while (watching) {
    await new Promise((r) => setTimeout(r, 900));
    let s; try { s = await (await fetch('/api/status')).json(); } catch { continue; }
    updateStatus(s);
    const sumChanged = s.summary.done !== lastSum;
    if ((s.generatedAt && s.generatedAt !== lastGen) || (sumChanged && !s.summary.running) || (!s.scanning && !s.summary.running)) {
      lastGen = s.generatedAt; lastSum = s.summary.done;
      await softReload();
    } else if (sumChanged) { lastSum = s.summary.done; }
    if (!s.scanning && !s.summary.running) watching = false;
  }
}
async function softReload() {
  try {
    const r = await (await fetch('/api/data')).json(); if (r.error) return;
    D = r; prepare(); renderTabs();
    const typing = document.activeElement && /TEXTAREA|INPUT/.test(document.activeElement.tagName) && $('#drawer').contains(document.activeElement);
    RENDER[state.tab]();
    if (state.open && !typing) openSkill(state.open, false, true);
  } catch {}
}
function updateStatus(s) {
  if (!s) return;
  const el = $('#scanned');
  if (s.scanning) {
    const p = s.progress || {}; el.innerHTML = `<span class="dotpulse"></span><span class="txt">${esc(p.phase || 'Updating')}${p.total ? ` ${p.done}/${p.total}` : ''}</span>`;
  } else el.innerHTML = `<span class="txt">Updated ${esc(ago(s.generatedAt))}</span>`;
  el.title = s.generatedAt ? 'Last full scan: ' + fmtDate(s.generatedAt) : '';
  const sb = $('#aibanner'); if (sb) sb.outerHTML = aiBanner(s.summary);
}
setInterval(() => { if (D && !watching) updateStatus({ ...(D.status || {}), scanning: false, generatedAt: D.generatedAt, summary: (D.status || {}).summary || {} }); }, 30000);

// ============ SKILLS TAB ============
const EXAMPLES = ['make a PowerPoint deck', 'turn my website into a video', 'review my code for bugs', 'improve SEO of my site', 'make my writing sound human', 'build a dashboard', 'edit an Excel file', 'fix a failing test'];

function aiBanner(job = {}) {
  const missing = E.filter((e) => !e.virtual && !e.ai).length;
  if (job.running) return `<div class="banner info" id="aibanner"><div class="t"><b>Writing plain-English summaries with Claude…</b>${job.done} of ${job.total} done. You can keep using the page.<div class="prog"><div style="width:${job.total ? (100 * job.done / job.total) : 0}%"></div></div></div></div>`;
  if (job.error) return `<div class="banner err" id="aibanner"><div class="t"><b>Couldn't write summaries</b>${esc(job.error)}</div><button class="btn" data-act="summarize">Try again</button></div>`;
  if (!missing || store.get('aiDismiss', -1) >= missing) return '<div id="aibanner" hidden></div>';
  return `<div class="banner" id="aibanner"><div class="t"><b>Make every skill easy to understand</b>${missing} skills only have technical descriptions. Claude (on this computer) can write a simple one-line summary, a friendly name and an example request for each. It uses a little of your Claude plan once (Haiku model, about ${Math.ceil(missing / 20)} short requests).</div><button class="btn primary" data-act="summarize">Write summaries</button><button class="linkbtn" data-act="ai-dismiss">Not now</button></div>`;
}

function renderSkills() {
  const v = $('#v-skills');
  const q = state.q.trim();
  SEARCH = q ? searchMap(q) : null;
  v.innerHTML = `
    ${D.partial ? '<div class="banner info"><div class="t"><b>Reading your AI history for the first time…</b>Your skills are listed below. Usage, projects and suggestions fill in when the scan finishes (about a minute).</div></div>' : ''}
    ${aiBanner(D.status && D.status.summary)}
    ${q ? '<div class="finder" id="finder"></div>' : `
      <div class="finder"><h3>What do you want to do?</h3><div class="sub">Type a task in the search box above, in plain words. Skill Atlas finds the skills that fit and shows the command to run them.</div>
      <div class="examples">${EXAMPLES.map((x) => `<button data-example="${esc(x)}">${esc(x)}</button>`).join('')}</div></div>
      <section class="stats" id="stats"></section>
      <div class="cats" id="cats"></div>
      <section class="insights">
        <div class="panel p-activity"><h3><span>Skill use <small id="act-total"></small></span><span class="seg mini" id="heatseg"><button data-heat="weeks" aria-pressed="${state.heat === 'weeks'}">Weekly</button><button data-heat="days" aria-pressed="${state.heat === 'days'}">Calendar</button></span></h3><div id="activity"></div><div class="legend" id="legend"></div></div>
        <div class="panel"><h3>Most used <small>all time</small></h3><div class="bars" id="top"></div></div>
        <div class="panel"><h3>Recently used <small>and what it was for</small></h3><ul class="recent" id="recent"></ul></div>
      </section>`}
    <section class="filters">
      <div class="seg" id="status" role="group" aria-label="Usage filter">
        ${[['all', 'All'], ['used', 'Used'], ['30', 'Last 30 days'], ['never', 'Never used'], ['fav', STAR_SVG.replace('width="16" height="16"', 'width="13" height="13"') + ' Starred']].map(([k, l]) => `<button data-status="${k}" aria-pressed="${state.status === k}">${l}</button>`).join('')}
      </div>
      <select class="sel" id="cat" aria-label="Category"><option value="">All categories</option>${[...new Set(E.map((e) => e.category))].sort().map((c) => `<option ${c === state.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <select class="sel" id="group" aria-label="Group by">${[['none', 'No grouping'], ['category', 'Group by category'], ['tool', 'Group by AI tool'], ['source', 'Group by plugin / source']].map(([k, l]) => `<option value="${k}" ${state.group === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select class="sel" id="sort" aria-label="Sort" ${q ? 'disabled title="Sorted by best match while searching"' : ''}>${[['recent', 'Sort: recently used'], ['most', 'Sort: most used'], ['az', 'Sort: A–Z'], ['new', 'Sort: newest installed'], ['size', 'Sort: biggest']].map(([k, l]) => `<option value="${k}" ${state.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <span class="seg" role="group" aria-label="View"><button data-view="grid" aria-pressed="${state.view === 'grid'}" title="Cards (V)">Cards</button><button data-view="list" aria-pressed="${state.view === 'list'}" title="List (V)">List</button></span>
      <span class="spacer"></span><span class="count-line" id="countline"></span>
    </section>
    <div class="chips" id="toolchips"></div>
    <div id="list"></div>`;
  if (q) renderFinder(); else { renderStats(); renderCats(); renderActivity(); renderTop(); renderRecent(); }
  renderToolChips(); renderList();
  $('#cat').onchange = (e) => { state.cat = e.target.value; store.set('cat', state.cat); renderList(); if (!q) renderCats(); };
  $('#group').onchange = (e) => { state.group = e.target.value; store.set('group', state.group); renderList(); };
  $('#sort').onchange = (e) => { state.sort = e.target.value; store.set('sort', state.sort); renderList(); };
}

function renderFinder() {
  const ranked = [...SEARCH.entries()].sort((a, b) => b[1].score - a[1].score);
  const top = ranked.length ? ranked[0][1].score : 0;
  const best = ranked.filter(([, r]) => r.score >= top * 0.3).slice(0, 5);
  // show the user's own words that matched, not the internal synonym
  const qWords = state.q.toLowerCase().split(/[^a-z0-9+#]+/).filter(Boolean);
  const yourWords = (terms) => [...new Set(qWords.filter((w) => { const t = TextIndex.tokens(w)[0]; return t && terms.includes(TextIndex.canon(t)); }))];
  best.forEach(([, r]) => { const w = yourWords(r.terms); if (w.length) r.terms = w; });
  $('#finder').innerHTML = `<h3>Best matches for “${esc(state.q.trim())}”</h3><div class="sub">${best.length ? 'Ranked by how well each skill’s purpose matches your words. Click one for details, or copy its command.' : 'No skill clearly matches. Try other words, like the file type, the tool or the end result you want.'}</div>
    <div class="fres">${best.map(([key, r], i) => {
      const e = BY.get(key); const cmds = cmdsFor(e);
      return `<div class="fr ${i === 0 ? 'best' : ''}" data-open="${esc(key)}" tabindex="0" role="button">${catIcon(e.category)}
        <div style="min-width:0"><div class="nm">${esc(e.displayName)} ${i === 0 ? '<span class="pill p-good">Best match</span>' : ''} ${statusPill(e)}</div>
        <div class="d">${esc(descOf(e))}</div>
        <div class="why">${r.terms.length ? 'Matches: ' + esc(r.terms.slice(0, 5).join(', ')) : 'Name match'}${e.askedCount ? ` · fits ${plural(e.askedCount, 'past request')}` : ''} · ${esc(e.tools.join(', '))}</div></div>
        <div class="cmds">${cmds.map((c) => `<button class="cmdchip" data-copy="${esc(c.cmd)}" title="Copy for ${esc(c.tool)}">${esc(c.cmd)}</button>`).join('') || '<span class="muted" style="font-size:12px">Just describe the task</span>'}</div></div>`;
    }).join('')}</div>`;
}

function renderStats() {
  const real = E.filter((e) => !e.virtual);
  const recent = E.filter((e) => daysAgo(e.lastUsed) <= 30);
  const used = E.filter((e) => e.useCount);
  const never = E.filter((e) => !e.useCount && e.usageTracked && !e.virtual);
  const installs = real.reduce((a, e) => a + e.installs.length, 0);
  const tools = new Set(E.flatMap((e) => e.tools));
  const tile = (k, v, s, act) => `<button class="stat" data-status="${act}"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></button>`;
  $('#stats').innerHTML =
    tile('Skills you have', real.length, `${installs} installs in ${tools.size} AI tools`, 'all') +
    tile('Used in last 30 days', recent.length, 'part of your routine', '30') +
    tile('Ever used', used.length, `${E.reduce((a, e) => a + e.useCount, 0)} uses in total`, 'used') +
    tile('Never used', never.length, 'installed but forgotten?', 'never') +
    tile('Starred', USER.favorites.filter((k) => BY.has(k)).length, 'your favorites', 'fav') +
    tile('Requests read', (D.promptCount || 0).toLocaleString(), `from ${((D.logFiles.claude || 0) + (D.logFiles.codex || 0)).toLocaleString()} session files`, 'all');
}

function renderCats() {
  const cats = {}; for (const e of E) { if (e.virtual) continue; const c = cats[e.category] || (cats[e.category] = { n: 0, used: 0 }); c.n++; if (e.useCount) c.used++; }
  $('#cats').innerHTML = Object.entries(cats).sort((a, b) => b[1].n - a[1].n).map(([c, s]) => `<button class="cat" data-cat="${esc(c)}" aria-pressed="${state.cat === c}">${catIcon(c, 'sm')}<div style="min-width:0;flex:1"><div class="nm">${esc(c)}</div><div class="ct">${s.n} installed · ${s.used} used</div><div class="bar"><i style="width:${(100 * s.used / s.n).toFixed(0)}%"></i></div></div></button>`).join('');
}

function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function colorOf(v) { return v.startsWith('var(') ? cssVar(v.slice(4, -1)) : v; }
function renderActivity() {
  const box = $('#activity'); if (!box) return;
  $$('#heatseg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.heat === state.heat));
  if (state.heat === 'days') return renderHeatmap(box);
  const N = 26; const W = box.clientWidth || 600; const H = 150; const padB = 20; const padT = 8;
  const now = weekStart(Date.now()); const tools = [...new Set(E.filter((e) => e.useCount).flatMap((e) => e.uses.map((u) => u.tool)))];
  const buckets = Array.from({ length: N }, (_, i) => ({ start: now - (N - 1 - i) * 7 * DAY, by: {}, total: 0, names: {} }));
  let total = 0;
  for (const e of E) for (const u of e.uses) {
    const idx = N - 1 - Math.round((now - weekStart(u.ts)) / (7 * DAY)); if (idx < 0 || idx >= N) continue;
    const b = buckets[idx]; b.by[u.tool] = (b.by[u.tool] || 0) + 1; b.total++; b.names[e.displayName] = (b.names[e.displayName] || 0) + 1; total++;
  }
  const max = Math.max(1, ...buckets.map((b) => b.total)); const bw = W / N; const gap = Math.max(2, bw * 0.28);
  let g = '';
  for (let k = 0; k <= 2; k++) { const y = padT + (H - padB - padT) * k / 2; g += `<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="${cssVar('--line')}" stroke-dasharray="${k === 2 ? '' : '3 4'}"/>`; }
  buckets.forEach((b, i) => {
    let y = H - padB; const x = i * bw + gap / 2;
    for (const t of tools) { const v = b.by[t] || 0; if (!v) continue; const h = (H - padB - padT) * v / max; y -= h; g += `<rect x="${x}" y="${y}" width="${bw - gap}" height="${Math.max(h - 1, 1)}" rx="2.5" fill="${colorOf(toolColor(t))}"/>`; }
    g += `<rect class="hit" data-i="${i}" x="${i * bw}" y="0" width="${bw}" height="${H}" fill="transparent"/>`;
    if (i % 4 === 1) g += `<text x="${x + (bw - gap) / 2}" y="${H - 5}" text-anchor="middle" font-size="10.5" fill="${cssVar('--ink-3')}">${new Date(b.start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</text>`;
  });
  g += `<text x="${W - 2}" y="${padT + 10}" text-anchor="end" font-size="10.5" fill="${cssVar('--ink-3')}">${max}/wk</text>`;
  box.innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly skill use for the last 26 weeks">${g}</svg>`;
  $('#act-total').textContent = `· ${total} in 26 weeks`;
  $('#legend').innerHTML = tools.map((t) => `<span><i style="background:${toolColor(t)}"></i>${esc(t)}</span>`).join('') || '<span>No usage recorded yet</span>';
  $$('.hit', box).forEach((r) => {
    r.onmousemove = (e) => { const b = buckets[+r.dataset.i]; const names = Object.entries(b.names).sort((a, c) => c[1] - a[1]).slice(0, 4).map(([n, c]) => `${esc(n)} ×${c}`).join('<br>'); showTip(e, `<b>Week of ${new Date(b.start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</b><br>${b.total ? b.total + ' uses<br>' + names : 'No skill use'}`); };
    r.onmouseleave = hideTip;
  });
}
function renderHeatmap(box) {
  const days = new Map(); let total = 0;
  for (const e of E) for (const u of e.uses) { const d = new Date(u.ts); d.setHours(0, 0, 0, 0); const k = d.getTime(); const o = days.get(k) || { n: 0, names: {} }; o.n++; o.names[e.displayName] = (o.names[e.displayName] || 0) + 1; days.set(k, o); }
  const end = new Date(); end.setHours(0, 0, 0, 0);
  const start = weekStart(end.getTime() - 52 * 7 * DAY);
  const C = 13, G = 3, top = 16, left = 22;
  const weeks = Math.ceil((end - start) / (7 * DAY)) + 1;
  const W = left + weeks * (C + G); const H = top + 7 * (C + G);
  let g = ''; let lastMonth = -1;
  const level = (n) => (n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4);
  const fills = ['var(--mute-soft)', 'color-mix(in srgb,var(--accent) 30%,var(--mute-soft))', 'color-mix(in srgb,var(--accent) 55%,var(--mute-soft))', 'color-mix(in srgb,var(--accent) 80%,var(--mute-soft))', 'var(--accent)'];
  for (let w = 0; w < weeks; w++) for (let d = 0; d < 7; d++) {
    const t = start + (w * 7 + d) * DAY; if (t > end.getTime()) continue;
    const dt = new Date(t);
    if (d === 0 && dt.getMonth() !== lastMonth) { lastMonth = dt.getMonth(); g += `<text x="${left + w * (C + G)}" y="10" font-size="10" fill="${cssVar('--ink-3')}">${dt.toLocaleDateString(undefined, { month: 'short' })}</text>`; }
    const o = days.get(t); const n = o ? o.n : 0; total += n;
    g += `<rect class="hc" data-t="${t}" x="${left + w * (C + G)}" y="${top + d * (C + G)}" width="${C}" height="${C}" rx="3" style="fill:${fills[level(n)]}"/>`;
  }
  ['Mon', 'Wed', 'Fri'].forEach((l, i) => { g += `<text x="0" y="${top + (i * 2) * (C + G) + 10}" font-size="9.5" fill="${cssVar('--ink-3')}">${l}</text>`; });
  box.innerHTML = `<svg class="heat" viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily skill use for the past year">${g}</svg>`;
  $('#act-total').textContent = `· ${total} in the past year`;
  $('#legend').innerHTML = `<span>Less</span>${fills.map((f) => `<span><i style="background:${f}"></i></span>`).join('')}<span>More</span>`;
  $$('.hc', box).forEach((r) => {
    r.onmousemove = (e) => { const t = +r.dataset.t; const o = days.get(t); showTip(e, `<b>${new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</b><br>${o ? o.n + ' uses<br>' + Object.entries(o.names).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, c]) => `${esc(n)} ×${c}`).join('<br>') : 'No skill use'}`); };
    r.onmouseleave = hideTip;
  });
}
function renderTop() {
  const top = E.filter((e) => e.useCount).sort((a, b) => b.useCount - a.useCount).slice(0, 7);
  const max = top[0] ? top[0].useCount : 1;
  $('#top').innerHTML = top.map((e) => `<div class="row" data-open="${esc(e.key)}"><div><div class="nm">${esc(e.displayName)}</div><div class="track"><div class="fill" style="width:${100 * e.useCount / max}%;background:${toolColor(e.uses[0].tool)}"></div></div></div><div class="n">${e.useCount}</div></div>`).join('') || '<div class="empty-note">No skill usage found in your history yet.</div>';
}
function renderRecent() {
  const ev = [];
  for (const e of E) for (const u of e.uses.slice(0, 6)) ev.push({ e, u });
  ev.sort((a, b) => String(b.u.ts).localeCompare(String(a.u.ts)));
  $('#recent').innerHTML = ev.slice(0, 6).map(({ e, u }) => `<li data-open="${esc(e.key)}"><div class="t"><span>${esc(e.displayName)}</span><span>${esc(ago(u.ts))}</span></div><div class="f">${esc(forWhat(u)) || '<em>No prompt recorded</em>'}${u.cwd ? ' · ' + esc(base(u.cwd)) : ''}</div></li>`).join('') || '<div class="empty-note">Nothing yet.</div>';
}
function renderToolChips() {
  const counts = {}; E.forEach((e) => { if (!e.virtual) e.tools.forEach((t) => { counts[t] = (counts[t] || 0) + 1; }); });
  const tools = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  $('#toolchips').innerHTML = `<button class="chip" data-tool="" aria-pressed="${!state.tools.size}">All tools</button>` +
    tools.map((t) => `<button class="chip" data-tool="${esc(t)}" aria-pressed="${state.tools.has(t)}"><span class="dot" style="background:${toolColor(t)}"></span>${esc(t)} <span class="cnt">${counts[t]}</span></button>`).join('');
}

function filtered() {
  const items = E.filter((e) => {
    if (state.tools.size && !e.tools.some((t) => state.tools.has(t))) return false;
    if (state.cat && e.category !== state.cat) return false;
    if (state.status === 'used' && !e.useCount) return false;
    if (state.status === 'never' && (e.useCount || !e.usageTracked || e.virtual)) return false;
    if (state.status === '30' && daysAgo(e.lastUsed) > 30) return false;
    if (state.status === 'fav' && !isFav(e.key)) return false;
    if (SEARCH && !SEARCH.has(e.key)) return false;
    return true;
  });
  if (SEARCH) return items.sort((a, b) => SEARCH.get(b.key).score - SEARCH.get(a.key).score);
  const by = {
    az: (a, b) => a.displayName.localeCompare(b.displayName),
    most: (a, b) => (b.useCount - a.useCount) || String(b.lastUsed || '').localeCompare(String(a.lastUsed || '')) || a.displayName.localeCompare(b.displayName),
    new: (a, b) => String(b.installedAt || '').localeCompare(String(a.installedAt || '')),
    size: (a, b) => b.sizeBytes - a.sizeBytes,
    recent: (a, b) => String(b.lastUsed || '').localeCompare(String(a.lastUsed || '')) || (isFav(b.key) - isFav(a.key)) || a.displayName.localeCompare(b.displayName),
    category: (a, b) => a.category.localeCompare(b.category) || a.displayName.localeCompare(b.displayName),
  };
  return items.sort(by[state.sort] || by.recent);
}

function spark(w) {
  const max = Math.max(...w); if (!max) return '';
  const bw = 4, gap = 2, H = 16;
  return `<svg class="spark" width="${w.length * (bw + gap)}" height="${H}" aria-hidden="true">${w.map((v, i) => `<rect x="${i * (bw + gap)}" y="${H - Math.max(2, H * v / max)}" width="${bw}" height="${Math.max(2, H * v / max)}" rx="1" fill="${v ? 'var(--accent)' : 'var(--line-2)'}"/>`).join('')}</svg>`;
}
const starBtn = (key) => `<button class="star ${isFav(key) ? 'on' : ''}" data-star="${esc(key)}" aria-pressed="${isFav(key)}" aria-label="Star this skill" title="Star (F)">${STAR_SVG}</button>`;
function card(e) {
  const note = noteOf(e.key);
  const toolset = e.tools.length === 1 ? toolBadge(e.tools[0]) : `<span class="badge b-soft">${toolDots(e.tools)} ${e.tools.length} tools</span>`;
  return `<div class="card" data-open="${esc(e.key)}" tabindex="0" role="button" aria-label="${esc(e.displayName)}">${starBtn(e.key)}
    <div class="top">${catIcon(e.category)}<div style="min-width:0;flex:1"><div class="nm" title="${esc(e.displayName)}">${esc(e.displayName)}</div><div class="pl" title="${esc(realName(e))}">${esc(realName(e))}</div></div></div>
    <div class="desc">${esc(descOf(e))}</div>
    ${note ? `<div class="note" title="${esc(note)}">Note: ${esc(note)}</div>` : ''}
    <div class="foot">${statusPill(e)}${e.useCount ? `<span>${e.useCount}×</span>` : ''}${spark(e.weeks)}<span class="toolset">${toolset}</span></div>
  </div>`;
}
function tableView(items) {
  const col = (k, label, cls = '') => `<th data-sortcol="${k}" class="${cls}">${label}${!SEARCH && state.sort === k ? ' <span class="arr">↓</span>' : ''}</th>`;
  return `<div class="tablewrap"><table class="list"><thead><tr><th class="nosort"></th>${col('az', 'Skill')}<th class="nosort">AI tools</th>${col('category', 'Category')}${col('recent', 'Last used')}${col('most', 'Uses', 'num')}${col('size', 'Size', 'num')}</tr></thead><tbody>
    ${items.map((e) => `<tr class="trow" data-open="${esc(e.key)}" tabindex="0"><td style="width:36px">${starBtn(e.key)}</td><td><div class="tn">${esc(e.displayName)}</div><div class="ts">${esc(realName(e))}</div></td><td>${toolDots(e.tools)}</td><td>${esc(e.category)}</td><td>${statusPill(e)}</td><td class="num">${e.useCount || '—'}</td><td class="num">${fmtSize(e.sizeBytes)}</td></tr>`).join('')}
  </tbody></table></div>`;
}
function renderList() {
  if (!$('#list')) return;
  const items = filtered();
  state.navList = items.map((e) => e.key);
  $('#countline').textContent = `Showing ${items.length} of ${E.length}`;
  $$('#status button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.status === state.status));
  if (!items.length) { $('#list').innerHTML = `<div class="none">${state.status === 'fav' ? 'No starred skills yet. Click the star on any skill to keep it here.' : 'No skills match. Try clearing the search or filters.'}</div>`; return; }
  const keyOf = { none: () => '', category: (e) => e.category, tool: (e) => e.tools.join(' + '), source: (e) => (e.plugin ? `${e.installs[0].tool} · ${e.plugin}` : `${e.installs[0].tool} · ${e.installs[0].kind}`) }[state.group] || (() => '');
  const groups = new Map();
  for (const e of items) { const k = keyOf(e); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
  const keys = [...groups.keys()].sort((a, b) => groups.get(b).length - groups.get(a).length || a.localeCompare(b));
  $('#list').innerHTML = keys.map((k) => `${k ? `<div class="group-h">${esc(k)} <small>${groups.get(k).length} skills · ${groups.get(k).filter((e) => e.useCount).length} used</small></div>` : ''}${state.view === 'list' ? tableView(groups.get(k)) : `<div class="grid">${groups.get(k).map(card).join('')}</div>`}`).join('');
}

// ============ DISCOVER TAB ============
function memberRow(e, extra = '') {
  return `<div class="member" data-open="${esc(e.key)}">${catIcon(e.category, 'sm')}<div style="min-width:0"><div class="mn">${esc(e.displayName)}</div><div class="ms">${esc(realName(e))} · ${esc(e.tools.join(', '))}${extra}</div></div>${statusPill(e)}</div>`;
}
function renderDiscover() {
  const v = $('#v-discover');
  const red = D.rediscover.filter((r) => BY.has(r.key));
  const ov = D.overlaps.filter((o) => o.keys.every((k) => BY.has(k)));
  v.innerHTML = `
    ${D.partial ? '<div class="banner info"><div class="t"><b>Still reading your history…</b>Suggestions appear when the first scan finishes.</div></div>' : ''}
    <div class="sec-h"><div><h2>Skills you have that fit what you ask for</h2><p>Skill Atlas compared your ${(D.promptCount || 0).toLocaleString()} past requests with your installed skills. The AI hasn't used these (or not in 60+ days), but they match things you ask for often. Next time, try the command or mention the skill by name.</p></div></div>
    ${red.length ? `<div class="cols">${red.map((r) => {
      const e = BY.get(r.key); const cmds = cmdsFor(e);
      return `<div class="box"><div class="bh">${catIcon(e.category, 'sm')}<span class="t" data-open="${esc(e.key)}">${esc(e.displayName)}</span><span class="spacer"></span>${statusPill(e)}</div>
        <div class="bd">${esc(descOf(e))}</div>
        <div class="bd"><b>Fits ${r.count} of your past requests</b>${r.terms.length ? ` about <i>${esc(r.terms.join(', '))}</i>` : ''}, for example:</div>
        ${r.examples.slice(0, 2).map((x) => `<div class="q" title="${esc(x.text)}">“${esc(x.text)}”${x.project ? ` <span class="muted">· ${esc(x.project)}, ${esc(ago(x.ts))}</span>` : ''}</div>`).join('')}
        <div class="row">${cmds.map((c) => `<button class="cmdchip" data-copy="${esc(c.cmd)}" title="Copy for ${esc(c.tool)}">${esc(c.cmd)}</button>`).join('')}<span class="spacer"></span><button class="btn small" data-open="${esc(e.key)}">Details</button></div></div>`;
    }).join('')}</div>` : `<div class="empty">${D.partial ? '' : 'No strong matches right now. Good sign: the AI already uses the skills that fit your requests.'}</div>`}

    <div class="sec-h" style="margin-top:30px"><div><h2>Skills that overlap</h2><p>These skills are described in similar words, so the AI may pick either one for the same request. If they really do the same job, keep the one you like and remove or ignore the others. Skills from the same plugin or family are left out.</p></div></div>
    ${ov.length ? `<div class="cols">${ov.map((o) => {
      const ms = o.keys.map((k) => BY.get(k)); const top = ms.slice().sort((a, b) => b.useCount - a.useCount)[0];
      return `<div class="box"><div class="bh"><span class="t" style="cursor:default">${o.terms.length ? 'About: ' + esc(o.terms.slice(0, 4).join(', ')) : 'Similar skills'}</span><span class="spacer"></span><span class="pill ${o.strength >= 0.5 ? 'p-bad' : o.strength >= 0.35 ? 'p-warn' : 'p-mid'}">${o.strength >= 0.5 ? 'Very similar' : o.strength >= 0.35 ? 'Similar' : 'Somewhat similar'}</span></div>
        <div style="margin-top:6px">${ms.map((e) => memberRow(e)).join('')}</div>
        <div class="bd" style="margin-top:6px">${top.useCount ? `You use <b>${esc(top.displayName)}</b> most (${plural(top.useCount, 'time')}).` : 'None of these have been used yet.'}</div></div>`;
    }).join('')}</div>` : '<div class="empty">No overlapping skills found.</div>'}`;
}

// ============ PROJECTS TAB ============
const mcpLabel = (k) => { const m = D.mcp.find((x) => x.key === k); return m ? m.label : k; };
function renderProjects() {
  const v = $('#v-projects');
  v.innerHTML = `<div class="sec-h"><div><h2>Projects</h2><p>Every folder you've worked in with Claude Code or Codex, with the skills, MCP servers and sub-agents used there.</p></div>
    <div class="btnrow"><input class="localfilter" id="projq" type="search" placeholder="Filter projects…" value="${esc(state.projQ)}">
    <select class="sel" id="projsort"><option value="recent" ${state.projSort === 'recent' ? 'selected' : ''}>Most recent</option><option value="sessions" ${state.projSort === 'sessions' ? 'selected' : ''}>Most sessions</option><option value="skills" ${state.projSort === 'skills' ? 'selected' : ''}>Most skills used</option></select></div></div>
    <div id="projlist"></div>`;
  $('#projq').oninput = (e) => { state.projQ = e.target.value; renderProjectList(); };
  $('#projsort').onchange = (e) => { state.projSort = e.target.value; renderProjectList(); };
  renderProjectList();
}
function renderProjectList() {
  const q = state.projQ.toLowerCase();
  let ps = D.projects.filter((p) => !q || (p.name + ' ' + p.path).toLowerCase().includes(q));
  const sorts = { recent: (a, b) => String(b.last || '').localeCompare(String(a.last || '')), sessions: (a, b) => b.sessions - a.sessions || b.prompts - a.prompts, skills: (a, b) => b.skills.reduce((s, x) => s + x[1], 0) - a.skills.reduce((s, x) => s + x[1], 0) };
  ps = ps.sort(sorts[state.projSort]);
  const limit = state.showAll.proj ? ps.length : 30;
  $('#projlist').innerHTML = ps.length ? `<div class="cols">${ps.slice(0, limit).map((p) => `<div class="box">
      <div class="bh">${catIcon('Other', 'sm').replace(CAT.Other[1], '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>')}<span class="t" style="cursor:default" title="${esc(p.path)}">${esc(p.name)}</span><span class="spacer"></span><span class="muted" style="font-size:12px;white-space:nowrap">${p.last ? esc(ago(p.last)) : ''}</span></div>
      <div class="bd muted" style="font-size:12px;word-break:break-all">${esc(p.path)}</div>
      <div class="bd">${plural(p.sessions, 'session')} · ${plural(p.prompts, 'request')} ${Object.entries(p.tools || {}).map(([t, n]) => `<span class="badge b-soft"><span class="dot" style="background:${toolColor(t)}"></span>${esc(t)} ${n}</span>`).join(' ')}</div>
      ${p.skills.length ? `<div class="subhead" style="margin:10px 0 5px;font-size:12px">Skills used</div><div class="tchips">${p.skills.map(([k, n]) => BY.has(k) ? `<button data-open="${esc(k)}">${esc(BY.get(k).displayName)} ×${n}</button>` : '').join('')}</div>` : '<div class="bd muted" style="font-size:12.5px">No skills used here yet.</div>'}
      ${p.mcp.length ? `<div class="subhead" style="margin:10px 0 5px;font-size:12px">MCP servers</div><div class="tchips">${p.mcp.map(([k, n]) => `<span>${esc(mcpLabel(k))} ×${n}</span>`).join('')}</div>` : ''}
      ${p.agents.length ? `<div class="subhead" style="margin:10px 0 5px;font-size:12px">Sub-agents</div><div class="tchips">${p.agents.map(([k, n]) => `<span>${esc(k)} ×${n}</span>`).join('')}</div>` : ''}
      ${p.recent.length ? `<div class="subhead" style="margin:10px 0 2px;font-size:12px">Latest requests</div>${p.recent.slice(0, 2).map((r) => `<div class="q" title="${esc(r.text)}">“${esc(r.text)}”</div>`).join('')}` : ''}
    </div>`).join('')}</div>${ps.length > limit ? `<div style="text-align:center;margin-top:14px"><button class="btn" data-showall="proj">Show all ${ps.length} projects</button></div>` : ''}` : '<div class="empty">No projects match.</div>';
}

// ============ CLEANUP TAB ============
function renderCleanup() {
  const v = $('#v-cleanup'); const c = D.cleanup;
  const stale = c.stale.filter((s) => BY.has(s.key));
  const never = stale.filter((s) => s.reason === 'never'); const old = stale.filter((s) => s.reason === 'old');
  const dups = c.duplicates.filter((d) => BY.has(d.key));
  const sum = (arr) => arr.reduce((a, s) => a + (s.sizeBytes || 0), 0);
  const tile = (k, val, s, href) => `<a class="stat" href="${href}" style="text-decoration:none;color:inherit"><div class="k">${k}</div><div class="v">${val}</div><div class="s">${s}</div></a>`;
  const folderBtn = (id) => (id ? `<button class="btn small" data-folder="${esc(id)}">Open folder</button>` : '');
  const staleTable = (rows, kind) => {
    const lim = state.showAll[kind] ? rows.length : 25;
    return `<div class="tablewrap"><table class="list"><thead><tr><th class="nosort">Skill</th><th class="nosort">AI tools</th><th class="nosort">${kind === 'never' ? 'Installed' : 'Last used'}</th><th class="nosort">${kind === 'never' ? 'Fits your requests' : 'Uses'}</th><th class="nosort num">Size</th><th class="nosort"></th></tr></thead><tbody>
      ${rows.slice(0, lim).map((s) => { const e = BY.get(s.key); return `<tr class="trow" data-open="${esc(e.key)}"><td><div class="tn">${esc(e.displayName)}</div><div class="ts">${esc(realName(e))}</div></td><td>${toolDots(e.tools)}</td><td>${kind === 'never' ? esc(fmtDay(e.installedAt)) : esc(ago(e.lastUsed))}</td><td>${kind === 'never' ? (e.askedCount ? `<span class="pill p-good">${plural(e.askedCount, 'request')}</span>` : '<span class="muted">—</span>') : e.useCount}</td><td class="num">${fmtSize(s.sizeBytes)}</td><td style="text-align:right">${folderBtn(e.installs[0] && e.installs[0].dir ? e.installs[0].id : null)}</td></tr>`; }).join('')}
      </tbody></table></div>${rows.length > lim ? `<div style="text-align:center;margin-top:10px"><button class="btn" data-showall="${kind}">Show all ${rows.length}</button></div>` : ''}`;
  };
  v.innerHTML = `
    <div class="sec-h"><div><h2>Cleanup</h2><p>Things you might want to tidy up. <b>Nothing on this page deletes anything.</b> Use “Open folder” to look first, then remove files yourself, or uninstall a plugin in Claude Code with the <code>/plugin</code> command.</p></div></div>
    <div class="bigstat">
      ${tile('Leftover plugin versions', c.oldVersions.length, `${fmtSize(c.oldTotal)} you can free up`, '#c-old')}
      ${tile('Installed in several places', dups.length, 'same skill, more than one copy', '#c-dup')}
      ${tile('Not used in 60+ days', old.length, fmtSize(sum(old)), '#c-stale')}
      ${tile('Never used (30+ days)', never.length, fmtSize(sum(never)), '#c-never')}
    </div>
    <div class="subhead" id="c-old">Leftover plugin versions <small>old copies kept after plugin updates. Close Claude Code before removing them, since a session that is still open may be using one.</small></div>
    ${c.oldVersions.length ? `<div class="tablewrap"><table class="list"><thead><tr><th class="nosort">Plugin</th><th class="nosort">Version</th><th class="nosort">Why it's here</th><th class="nosort">Date</th><th class="nosort num">Size</th><th class="nosort"></th></tr></thead><tbody>
      ${c.oldVersions.map((o) => `<tr><td><div class="tn">${esc(o.plugin)}</div><div class="ts">${esc(o.tool)} · ${esc(o.market)}</div></td><td class="mono" style="font-size:12px">${esc(o.version)}</td><td>${esc(o.reason)}</td><td>${esc(fmtDay(o.mtime))}</td><td class="num">${fmtSize(o.sizeBytes)}</td><td style="text-align:right">${folderBtn(o.id)}</td></tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">No leftover versions.</div>'}

    <div class="subhead" id="c-dup">Installed in more than one place</div>
    ${dups.length ? `<div class="cols">${dups.map((d) => { const e = BY.get(d.key); return `<div class="box"><div class="bh">${catIcon(e.category, 'sm')}<span class="t" data-open="${esc(e.key)}">${esc(e.displayName)}</span><span class="spacer"></span><span class="badge b-soft">${d.count} copies</span></div>
      ${d.sameTool.length ? `<div class="bd"><span class="pill p-warn">Twice in ${esc(d.sameTool.join(', '))}</span> The AI sees both copies, which can be confusing. Keeping one is usually enough.</div>` : '<div class="bd">One copy per AI tool. That is normal if you use each of those tools.</div>'}
      <div style="margin-top:6px">${e.installs.map((i) => `<div class="member" style="cursor:default"><span class="dot" style="background:${toolColor(i.tool)}"></span><div style="min-width:0"><div class="mn" style="font-size:12.5px">${esc(i.tool)} · ${esc(i.kind)}</div><div class="ms" title="${esc(i.dir || '')}">${esc(i.dir || '')}</div></div>${folderBtn(i.dir ? i.id : null)}</div>`).join('')}</div></div>`; }).join('')}</div>` : '<div class="empty">No duplicates.</div>'}

    <div class="subhead" id="c-stale">Not used in 60+ days</div>
    ${old.length ? staleTable(old, 'old') : '<div class="empty">Everything you use has been used recently.</div>'}
    <div class="subhead" id="c-never">Never used, installed 30+ days ago <small>if one “fits your requests”, try it before removing it</small></div>
    ${never.length ? staleTable(never, 'never') : '<div class="empty">None.</div>'}
    <p class="muted" style="font-size:12.5px;margin-top:16px">Gemini CLI, Antigravity, OpenCode and shared .agents skills are left out of the usage lists, because those tools don't keep a readable usage log.</p>`;
}

// ============ MCP & AGENTS TAB ============
function renderMcp() {
  const v = $('#v-mcp');
  const f = state.mcpFilter;
  const ms = D.mcp.filter((m) => (f === 'used' ? m.used.count : f === 'unused' ? !m.used.count : true));
  const used = D.agents.filter((a) => a.used.count); const unused = D.agents.filter((a) => !a.used.count);
  const recentList = (rs) => rs.length ? `<details class="more"><summary>Recent uses</summary>${rs.slice(0, 5).map((r) => `<div class="q" title="${esc(r.prompt || r.task || '')}"><span class="muted">${esc(ago(r.ts))}${r.cwd ? ' · ' + esc(base(r.cwd)) : ''}:</span> ${esc(r.task ? r.task + (r.prompt ? ' — ' + r.prompt : '') : r.prompt || '(no prompt text)')}</div>`).join('')}</details>` : '';
  const agentBox = (a) => `<div class="box"><div class="bh">${catIcon('_agent', 'sm')}<span class="t" style="cursor:default">${esc(a.invokeName)}</span><span class="spacer"></span>${a.used.count ? `<span class="pill ${daysAgo(a.used.last) <= 30 ? 'p-good' : 'p-mid'}">Used ${esc(ago(a.used.last))}</span>` : '<span class="pill p-warn">Never used</span>'}</div>
    <div class="bd"><span class="badge b-soft">${esc(a.source)}</span>${a.model ? ` <span class="badge b-soft">model: ${esc(a.model)}</span>` : ''}</div>
    ${a.description ? `<div class="bd">${esc(a.description.length > 220 ? a.description.slice(0, 219) + '…' : a.description)}</div>` : ''}
    ${a.used.count ? `<div class="bd"><b>${plural(a.used.count, 'run')}</b> · first ${esc(fmtDay(a.used.first))}</div>` : ''}
    ${recentList(a.used.recent)}</div>`;
  v.innerHTML = `
    <div class="sec-h"><div><h2>MCP servers</h2><p>Connections that give the AI extra tools, like a browser, web search or a database. Call counts come from your Claude Code and Codex history. Settings are shown without any keys or passwords.</p></div>
      <span class="seg">${[['all', 'All'], ['used', 'Used'], ['unused', 'Set up, never used']].map(([k, l]) => `<button data-mcpf="${k}" aria-pressed="${f === k}">${l}</button>`).join('')}</span></div>
    ${ms.length ? `<div class="cols">${ms.map((m) => `<div class="box">
      <div class="bh">${catIcon('_plug', 'sm')}<span class="t" style="cursor:default" title="${esc(m.key)}">${esc(m.label)}</span><span class="spacer"></span>${m.used.count ? `<span class="pill ${daysAgo(m.used.last) <= 30 ? 'p-good' : 'p-mid'}">Used ${esc(ago(m.used.last))}</span>` : '<span class="pill p-warn">Never used</span>'}</div>
      <div class="bd"><span class="badge b-soft">${esc(m.kind)}</span> ${toolBadge(m.tool)}</div>
      ${m.used.count ? `<div class="bd"><b>${plural(m.used.count, 'call')}</b> · first used ${esc(fmtDay(m.used.first))}</div>` : ''}
      ${m.configs.length ? `<div class="bd" style="font-size:12.5px">${m.configs.map((c) => `Set up in ${esc(c.from)}${c.target ? ` · <span class="mono">${esc(c.type)} ${esc(c.target)}</span>` : ''}`).join('<br>')}</div>` : ''}
      ${m.used.tools.length ? `<div class="subhead" style="margin:10px 0 5px;font-size:12px">Most used tools</div><div class="tchips">${m.used.tools.slice(0, 8).map(([t, n]) => `<span>${esc(t)} ×${n}</span>`).join('')}</div>` : ''}
      ${recentList(m.used.recent)}
    </div>`).join('')}</div>` : '<div class="empty">Nothing here.</div>'}

    <div class="sec-h" style="margin-top:30px"><div><h2>Sub-agents</h2><p>Helpers Claude hands work to, such as searching a codebase or reviewing code. “Built into Claude Code” ones come with the app; others come from plugins or your own <code>~/.claude/agents</code> folder.</p></div></div>
    <div class="cols">${used.map(agentBox).join('')}</div>
    ${unused.length ? `<details class="more" style="margin-top:14px" ${state.showAll.agents ? 'open' : ''} data-remember="agents"><summary>${plural(unused.length, 'more sub-agent')} installed but never used</summary><div class="cols" style="margin-top:10px">${unused.map(agentBox).join('')}</div></details>` : ''}`;
}

// ============ CHEAT SHEET TAB ============
function renderCheatsheet() {
  const v = $('#v-cheatsheet');
  const items = E.filter((e) => (state.csMode === 'all' ? !e.virtual || e.useCount : e.useCount || isFav(e.key)));
  const groups = new Map();
  for (const e of items.sort((a, b) => b.useCount - a.useCount || a.displayName.localeCompare(b.displayName))) { if (!groups.has(e.category)) groups.set(e.category, []); groups.get(e.category).push(e); }
  const cats = [...groups.keys()].sort((a, b) => groups.get(b).length - groups.get(a).length);
  v.innerHTML = `<div class="cs-tools">
      <span class="seg">${[['used', 'Skills I use + starred'], ['all', 'All my skills']].map(([k, l]) => `<button data-csmode="${k}" aria-pressed="${state.csMode === k}">${l}</button>`).join('')}</span>
      <label style="font-size:13px;display:flex;gap:6px;align-items:center"><input type="checkbox" id="csx" ${state.csExamples ? 'checked' : ''}> Show example requests</label>
      <span class="spacer"></span><button class="btn primary" data-act="print"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Print or save as PDF</button></div>
    <div class="cs"><h1>My AI skills</h1><div class="gen">${plural(items.length, 'skill')} · made ${esc(fmtDay(new Date().toISOString()))} with Skill Atlas · In Claude Code type the <b>/command</b>, in Codex type the <b>$name</b>, or just describe the task.</div>
      ${items.length ? cats.map((c) => `<h2>${esc(c)}</h2><div class="cols2">${groups.get(c).map((e) => `<div class="it"><b>${esc(e.displayName)}</b>${cmdsFor(e).map((x) => `<span class="c">${esc(x.cmd.split(' ')[0])}</span>`).join('')}${isFav(e.key) ? ' ★' : ''}
        <div class="d">${esc(descOf(e))}</div>
        ${state.csExamples && e.ai && e.ai.example ? `<div class="x">e.g. “${esc(e.ai.example)}”</div>` : state.csExamples && e.uses[0] && forWhat(e.uses[0]) ? `<div class="x">Last used for: “${esc(forWhat(e.uses[0]).slice(0, 120))}”</div>` : ''}
        <div class="m">${e.useCount ? `Used ${plural(e.useCount, 'time')}, last ${esc(ago(e.lastUsed))}` : 'Not used yet'}${noteOf(e.key) ? ' · Note: ' + esc(noteOf(e.key)) : ''}</div></div>`).join('')}</div>`).join('') : '<p>No skills used or starred yet. Switch to “All my skills”, or star some skills first.</p>'}
    </div>`;
  $('#csx').onchange = (e) => { state.csExamples = e.target.checked; store.set('csExamples', state.csExamples); renderCheatsheet(); };
}

const RENDER = { skills: renderSkills, discover: renderDiscover, projects: renderProjects, cleanup: renderCleanup, mcp: renderMcp, cheatsheet: renderCheatsheet };

// ============ DETAIL DRAWER ============
function openSkill(key, push = true, keepScroll = false) {
  const e = BY.get(key); if (!e) return;
  state.open = key;
  if (push) history.pushState(null, '', `#/${state.tab}/skill/${encodeURIComponent(key)}`);
  const d = $('#drawer'); const scroll = keepScroll && $('.d-body', d) ? $('.d-body', d).scrollTop : 0;
  const nav = state.navList.includes(key) ? state.navList : E.map((x) => x.key);
  const pos = nav.indexOf(key);
  const realNames = [...new Set(e.installs.map((i) => i.invokeName))];
  const cmds = cmdsFor(e);
  const when = e.whenList.filter((w) => !(e.summary || '').startsWith(w));
  const lastAsk = forWhat(e.uses.find((u) => u.prompt || u.topic));
  const similar = (e.similar || []).filter((s) => BY.has(s.key)).slice(0, 6);
  d.innerHTML = `
    <div class="d-head">${catIcon(e.category)}<div style="min-width:0;flex:1">
      <h2>${esc(e.displayName)}</h2><div class="real">${esc(realNames.join(' · '))}</div>
      <div class="meta">${e.tools.map(toolBadge).join('')}<span class="badge b-soft">${esc(e.category)}</span>${e.plugin ? `<span class="badge b-soft">plugin: ${esc(e.plugin)}</span>` : ''}${e.isCommand ? '<span class="badge b-soft">slash command</span>' : ''}${e.version ? `<span class="badge b-soft">v${esc(e.version)}</span>` : ''}</div>
    </div>
    <div class="d-actions">${starBtn(e.key)}
      <button class="iconbtn" data-nav="-1" title="Previous (←)" ${pos <= 0 ? 'disabled' : ''} aria-label="Previous skill"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg></button>
      <button class="iconbtn" data-nav="1" title="Next (→)" ${pos < 0 || pos >= nav.length - 1 ? 'disabled' : ''} aria-label="Next skill"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></button>
      <button class="iconbtn" id="close" aria-label="Close (Esc)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div></div>
    <div class="d-body">
      <div class="kpis">
        <div class="kpi"><div class="k">Last used</div><div class="v" title="${esc(fmtDate(e.lastUsed))}">${e.lastUsed ? esc(ago(e.lastUsed)) : e.usageTracked ? 'Never' : 'Not tracked'}</div></div>
        <div class="kpi"><div class="k">Times used</div><div class="v">${e.useCount}</div></div>
        <div class="kpi"><div class="k">First used</div><div class="v">${esc(fmtDay(e.firstUsed))}</div></div>
        <div class="kpi"><div class="k">Fits your requests</div><div class="v" title="How many of your past requests match this skill">${e.askedCount ? plural(e.askedCount, 'time') : '—'}</div></div>
      </div>
      ${e.ai ? `<div class="plain"><div class="lbl">In plain words</div><div class="lead">${esc(e.ai.oneLiner)}</div>${e.ai.example ? `<div class="md" style="margin-top:4px">For example: “${esc(e.ai.example)}”</div>` : ''}</div>` : ''}

      <div class="sec"><h4>What it does<span class="ln"></span></h4>
        <p class="${e.ai ? 'md' : 'lead'}">${esc(e.summary || e.description || descOf(e))}</p>
        ${e.description && e.description !== e.summary ? `<details class="more"><summary>Full description</summary><p class="md" style="margin-top:6px">${esc(e.description)}</p></details>` : ''}
      </div>

      <div class="sec"><h4>When to use it<span class="ln"></span></h4>
        ${when.length ? `<ul class="pts">${when.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : (!e.whenSection ? '<p class="md">The skill file doesn’t spell this out. Use the description above as your guide.</p>' : '')}
        ${e.whenSection ? `<details class="more" ${when.length ? '' : 'open'}><summary>From the skill file</summary><div class="md">${md(e.whenSection)}</div></details>` : ''}
      </div>
      ${e.notList.length || e.notSection ? `<div class="sec"><h4>When not to use it<span class="ln"></span></h4>
        ${e.notList.length ? `<ul class="pts no">${e.notList.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
        ${e.notSection ? `<details class="more" ${e.notList.length ? '' : 'open'}><summary>From the skill file</summary><div class="md">${md(e.notSection)}</div></details>` : ''}</div>` : ''}

      <div class="sec"><h4>How to use it<span class="ln"></span></h4>
        <div class="howbox md">
          ${cmds.length ? `<p>Type this to run it directly:</p>${cmds.map((c) => `<div class="cmd"><code>${esc(c.cmd)}</code><span class="tl">${esc(c.tool)}</span><button data-copy="${esc(c.cmd)}">Copy</button></div>`).join('')}` : ''}
          <p>${e.isCommand ? 'This is a slash command, so it only runs when you type it.' : `Or just describe what you want in plain words. The AI reads every skill’s description and loads this one by itself when your request matches.${e.tools.some((t) => !['Claude Code', 'Codex'].includes(t)) ? ' In Gemini CLI, Antigravity and OpenCode, describing the task is the way to use it.' : ''}`}</p>
          ${lastAsk ? `<p style="margin-top:10px">The last time it was used, you asked:</p><div class="quote">${esc(lastAsk)}</div>` : ''}
        </div>
        ${e.howSection ? `<details class="more"><summary>How the skill works (from its file)</summary><div class="md">${md(e.howSection)}</div></details>` : ''}
      </div>

      <div class="sec"><h4>Your notes<span class="ln"></span><span class="saved" id="saved">Saved</span></h4>
        <textarea class="notes" id="notes" placeholder="Write a reminder for yourself, e.g. “use this for CEO decks”. Notes are searchable and saved on this computer.">${esc(noteOf(e.key))}</textarea>
      </div>

      <div class="sec"><h4>Usage history: when and what for<span class="ln"></span></h4>
        ${e.uses.length ? `<ul class="timeline" id="tl">${timeline(e, 15)}</ul>${e.uses.length > 15 ? `<button class="btn" id="tlmore">Show all ${e.uses.length}</button>` : ''}`
          : `<p class="md">${e.usageTracked ? 'No record of the AI using this skill in your local history.' : 'These AI tools don’t keep a readable usage log, so usage can’t be tracked for this skill.'}</p>`}
      </div>

      ${similar.length ? `<div class="sec"><h4>Similar skills<span class="ln"></span></h4><div class="simchips">${similar.map((s) => { const x = BY.get(s.key); return `<button class="simchip" data-open="${esc(x.key)}" title="${esc(descOf(x))}">${catIcon(x.category, 'sm')}<span>${esc(x.displayName)}</span>${x.useCount ? `<span class="muted">${x.useCount}×</span>` : ''}</button>`; }).join('')}</div></div>` : ''}

      ${e.outline.length ? `<div class="sec"><h4>Inside the skill<span class="ln"></span></h4><div class="outline">${e.outline.map((o) => `<span>${esc(o)}</span>`).join('')}</div></div>` : ''}

      <div class="sec"><h4>Where it’s installed<span class="ln"></span></h4>
        ${e.installs.map((i) => `<div class="install"><div class="h">${toolBadge(i.tool)}<b>${esc(i.kind)}</b>${i.uses ? `<span class="muted">· used ${i.uses}×</span>` : ''}<span class="spacer"></span><span class="muted" style="font-size:12px">${fmtSize(i.sizeBytes)}</span></div>
          <div class="md" style="margin-top:4px">${esc(i.sourceLabel)}</div>
          ${i.file ? `<div class="path">${esc(i.file)}</div><div class="md" style="font-size:12px">Changed ${esc(fmtDay(i.modified))}${i.installedAt ? ` · added ${esc(fmtDay(i.installedAt))}` : ''}</div>
          <div class="btnrow" style="margin-top:8px"><button class="btn small" data-file="${esc(i.id)}">Read the skill file</button><button class="btn small" data-folder="${esc(i.id)}">Open folder</button></div><div data-filebox="${esc(i.id)}"></div>` : ''}</div>`).join('')}
      </div>
    </div>`;
  d.classList.add('on'); d.setAttribute('aria-hidden', 'false'); $('#scrim').classList.add('on');
  $('.d-body', d).scrollTop = scroll;
  if (!keepScroll) $('#close').focus({ preventScroll: true });
  $('#close').onclick = () => closeSkill();
  const more = $('#tlmore'); if (more) more.onclick = () => { $('#tl').innerHTML = timeline(e, Infinity); more.remove(); };
  $('#notes').oninput = (ev) => { const t = ev.target.value; if (t.trim()) USER.notes[e.key] = t; else delete USER.notes[e.key]; saveUser(); };
  $('#notes').onblur = () => { buildIndex(); if (state.tab === 'skills') renderList(); };
}
function timeline(e, n) {
  return e.uses.slice(0, n).map((u) => `<li><div class="tl-h"><b>${esc(fmtDate(u.ts))}</b><span>${esc(ago(u.ts))}</span>${u.cwd ? `<span title="${esc(u.cwd)}">in ${esc(base(u.cwd))}</span>` : ''}<span>· ${esc(u.tool)}, ${esc(u.via)}</span></div>
    <div class="tl-p">${u.prompt ? esc(u.prompt) : '<em>No prompt text recorded for this use.</em>'}${u.topic && u.topic !== u.prompt ? `<div style="margin-top:3px"><em>Conversation was about: </em>${esc(u.topic)}</div>` : ''}${u.args ? `<div style="margin-top:3px"><em>Instructions passed: </em>${esc(u.args)}</div>` : ''}</div></li>`).join('');
}
function closeSkill(fromRoute) {
  if (!$('#drawer').classList.contains('on') && fromRoute) { state.open = null; return; }
  $('#drawer').classList.remove('on'); $('#drawer').setAttribute('aria-hidden', 'true'); $('#scrim').classList.remove('on');
  state.open = null;
  if (fromRoute !== true && /\/skill\//.test(location.hash)) history.pushState(null, '', '#/' + state.tab);
}
function navSkill(dir) {
  if (!state.open) return;
  const nav = state.navList.includes(state.open) ? state.navList : E.map((x) => x.key);
  const k = nav[nav.indexOf(state.open) + dir];
  if (k) { history.replaceState(null, '', `#/${state.tab}/skill/${encodeURIComponent(k)}`); openSkill(k, false); }
}

// ============ EVENTS ============
document.addEventListener('click', async (ev) => {
  const t = ev.target;
  const copy = t.closest('[data-copy]');
  if (copy) { ev.stopPropagation(); navigator.clipboard.writeText(copy.dataset.copy).then(() => toast('Copied: ' + copy.dataset.copy), () => toast('Copy failed')); return; }
  const star = t.closest('[data-star]'); if (star) { ev.stopPropagation(); toggleFav(star.dataset.star); return; }
  const folder = t.closest('[data-folder]');
  if (folder) { ev.stopPropagation(); const r = await fetch('/api/open-folder?id=' + encodeURIComponent(folder.dataset.folder), { method: 'POST' }); const j = await r.json().catch(() => ({})); toast(j.demo ? 'Demo mode: there are no real folders to open' : r.ok ? 'Opened in File Explorer' : 'Folder not found'); return; }
  const file = t.closest('[data-file]');
  if (file) {
    const box = $(`[data-filebox="${CSS.escape(file.dataset.file)}"]`); file.disabled = true; file.textContent = 'Loading…';
    try { const r = await (await fetch('/api/skill-file?id=' + encodeURIComponent(file.dataset.file))).json(); box.innerHTML = `<div class="fullmd md">${md(r.content.replace(/^---[\s\S]*?\n---\s*\n/, ''))}</div>`; file.remove(); }
    catch { file.textContent = 'Could not load file'; }
    return;
  }
  const open = t.closest('[data-open]'); if (open) { openSkill(open.dataset.open); return; }
  const tab = t.closest('[data-tab]'); if (tab) { closeSkill(true); setTab(tab.dataset.tab); return; }
  const nav = t.closest('[data-nav]'); if (nav) { navSkill(+nav.dataset.nav); return; }
  const st = t.closest('[data-status]'); if (st) { state.status = st.dataset.status; store.set('status', state.status); renderList(); if (st.classList.contains('stat')) $('.filters').scrollIntoView({ behavior: 'smooth' }); return; }
  const cat = t.closest('[data-cat]'); if (cat) { state.cat = state.cat === cat.dataset.cat ? '' : cat.dataset.cat; store.set('cat', state.cat); renderCats(); $('#cat').value = state.cat; renderList(); return; }
  const tool = t.closest('[data-tool]'); if (tool) { const k = tool.dataset.tool; if (!k) state.tools.clear(); else state.tools.has(k) ? state.tools.delete(k) : state.tools.add(k); store.set('tools', [...state.tools]); renderToolChips(); renderList(); return; }
  const view = t.closest('[data-view]'); if (view) { setView(view.dataset.view); return; }
  const sc = t.closest('[data-sortcol]'); if (sc && !SEARCH) { state.sort = sc.dataset.sortcol; store.set('sort', state.sort); if ($('#sort')) $('#sort').value = ['category'].includes(state.sort) ? 'recent' : state.sort; renderList(); return; }
  const heat = t.closest('[data-heat]'); if (heat) { state.heat = heat.dataset.heat; store.set('heat', state.heat); renderActivity(); return; }
  const ex = t.closest('[data-example]'); if (ex) { $('#q').value = ex.dataset.example; state.q = ex.dataset.example; renderSkills(); return; }
  const sa = t.closest('[data-showall]'); if (sa) { state.showAll[sa.dataset.showall] = true; RENDER[state.tab](); return; }
  const mf = t.closest('[data-mcpf]'); if (mf) { state.mcpFilter = mf.dataset.mcpf; renderMcp(); return; }
  const cs = t.closest('[data-csmode]'); if (cs) { state.csMode = cs.dataset.csmode; store.set('csMode', state.csMode); renderCheatsheet(); return; }
  const act = t.closest('[data-act]');
  if (act) {
    const a = act.dataset.act;
    if (a === 'print') window.print();
    if (a === 'ai-dismiss') { store.set('aiDismiss', E.filter((e) => !e.virtual && !e.ai).length); $('#aibanner').hidden = true; }
    if (a === 'summarize') { act.disabled = true; const r = await fetch('/api/summarize', { method: 'POST' }); const s = await r.json(); if (D.status) D.status.summary = s.summary; updateStatus(s); watch(); }
  }
});
document.addEventListener('keydown', (ev) => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  if (ev.key === 'Escape') {
    if (!$('#keys').hidden) { $('#keys').hidden = true; return; }
    if (state.open) { closeSkill(); return; }
    if (document.activeElement === $('#q') && $('#q').value) { $('#q').value = ''; state.q = ''; renderSkills(); return; }
    return;
  }
  if (ev.key === 'Enter' && document.activeElement.matches('[data-open]')) { openSkill(document.activeElement.dataset.open); return; }
  if (typing || ev.ctrlKey || ev.metaKey || ev.altKey) return;
  if (ev.key === '/') { ev.preventDefault(); $('#q').focus(); $('#q').select(); return; }
  if (ev.key === '?') { $('#keys').hidden = !$('#keys').hidden; return; }
  if (state.open) {
    if (ev.key === 'ArrowLeft' || ev.key === 'k') { navSkill(-1); return; }
    if (ev.key === 'ArrowRight' || ev.key === 'j') { navSkill(1); return; }
    if (ev.key === 'f') { toggleFav(state.open); return; }
    if (ev.key === 'n') { ev.preventDefault(); $('#notes').focus(); $('#notes').scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
  }
  if (/^[1-6]$/.test(ev.key)) { closeSkill(true); setTab(TABS[+ev.key - 1][0]); return; }
  if (ev.key === 'v' && state.tab === 'skills') { setView(state.view === 'grid' ? 'list' : 'grid'); }
});
function setView(v) { state.view = v; store.set('view', v); $$('[data-view]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.view === v)); renderList(); }
$('#keys').addEventListener('click', (e) => { if (e.target.id === 'keys' || e.target.closest('[data-close-keys]')) $('#keys').hidden = true; });
$('#help').onclick = () => { $('#keys').hidden = false; };
$('#scrim').onclick = () => closeSkill();
$('#home').onclick = () => { $('#q').value = ''; state.q = ''; closeSkill(true); setTab('skills'); };
let qt;
$('#q').addEventListener('input', (e) => {
  clearTimeout(qt);
  qt = setTimeout(() => { state.q = e.target.value; if (state.tab !== 'skills') { closeSkill(true); setTab('skills'); } else renderSkills(); }, 160);
});
$('#refresh').onclick = async () => {
  const b = $('#refresh'); b.querySelector('svg').classList.add('spin');
  try { const r = await (await fetch('/api/data?refresh=1')).json(); updateStatus(r.status); watch(); toast('Rescanning in the background'); } finally { setTimeout(() => b.querySelector('svg').classList.remove('spin'), 800); }
};
document.addEventListener('toggle', (e) => { if (e.target.dataset && e.target.dataset.remember) state.showAll[e.target.dataset.remember] = e.target.open; }, true);
let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (state.tab === 'skills' && !state.q) renderActivity(); }, 150); });

// Optional URL settings: ?q=search words  ?theme=dark|light  ?view=grid|list
(function () {
  const p = new URLSearchParams(location.search);
  if (p.get('theme') === 'dark' || p.get('theme') === 'light') document.documentElement.dataset.theme = p.get('theme');
  if (p.get('view') === 'grid' || p.get('view') === 'list') state.view = p.get('view');
  if (p.get('q')) { state.q = p.get('q'); $('#q').value = state.q; }
})();
loadUser().then(() => load(false));
