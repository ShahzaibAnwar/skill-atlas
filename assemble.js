// Turns raw scan results into what the dashboard shows: merged skill entries,
// similar/overlapping skills, rediscover suggestions, projects, MCP + agent stats, cleanup.
'use strict';
const path = require('path');
const { Index, cosine, tokens, canon, fieldsForEntry } = require('./public/textindex');
const { categorize } = require('./scanner');

const DAY = 864e5;
const USAGE_TOOLS = new Set(['Claude Code', 'Codex']);
const USAGE_SUPPORT = { 'Claude Code': 'full', Codex: 'full', 'Gemini CLI': 'none', Antigravity: 'none', 'Shared (.agents)': 'none', OpenCode: 'none', Cursor: 'none', Windsurf: 'none' };

// ---------- friendly names ----------
const FRIENDLY = {
  docx: 'Word Documents', xlsx: 'Excel Spreadsheets', pptx: 'PowerPoint Presentations', pdf: 'PDF Files', docs: 'Claude Docs',
  'google-workspace': 'Google Docs, Sheets & Slides', 'internal-comms': 'Internal Communications', 'skill-creator': 'Skill Creator',
  'mcp-builder': 'MCP Server Builder', 'claude-api': 'Claude API Reference', dataviz: 'Data Visualization', 'artifact-design': 'Artifact Design',
  humanizer: 'Humanizer', seo: 'SEO Analysis', imagegen: 'Image Generation', 'ui-ux-pro-max': 'UI/UX Pro Max', 'code-review': 'Code Review',
  hyperframes: 'HyperFrames Video', 'hyperframes-cli': 'HyperFrames CLI', 'hyperframes-registry': 'HyperFrames Block Library', 'media-use': 'Media Assets for Video',
};
const ACR = new Set('api ui ux seo pdf ci cd cli mcp sql tdd adr adrs ios geo sxo gbp ai url json csv svg pr qa kpi crm cdp rea gsc ga4 cwv eeat llm sdk tts n8n aws gcp css html js ts'.split(' '));
const WORDCASE = { adrs: 'ADRs', devtools: 'DevTools', github: 'GitHub', youtube: 'YouTube', swiftui: 'SwiftUI', openai: 'OpenAI', heygen: 'HeyGen', hyperframes: 'HyperFrames', chatgpt: 'ChatGPT', linkedin: 'LinkedIn', ios: 'iOS', macos: 'macOS', supabase: 'Supabase', shadcn: 'shadcn', vs: 'vs', ci: 'CI', cd: 'CD' };
const SMALL = new Set('and or of to for with the a an in on by at from vs'.split(' '));
function friendlyName(name) {
  if (FRIENDLY[name]) return FRIENDLY[name];
  return String(name).split(/[-_\s]+/).filter(Boolean).map((w, i) => {
    const l = w.toLowerCase();
    if (WORDCASE[l]) return WORDCASE[l];
    if (ACR.has(l)) return l.toUpperCase();
    if (i > 0 && SMALL.has(l)) return l;
    return l.charAt(0).toUpperCase() + l.slice(1);
  }).join(' ').split('CI CD').join('CI/CD');
}

// ---------- helpers ----------
const hashOf = (e) => { let h = 2166136261; for (const c of `${e.name}|${e.description}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const jaccard = (a, b) => { const A = new Set(tokens(a)); const B = new Set(tokens(b)); if (!A.size && !B.size) return 1; let n = 0; for (const t of A) if (B.has(t)) n++; return n / (A.size + B.size - n || 1); };
const KIND_RANK = { 'Personal skill': 0, 'Account skill': 1, Plugin: 2, 'Account plugin': 3, 'Project skill': 4, 'Built-in skill': 6, Skill: 7 };
const installRank = (s) => (s.tool === 'Claude Code' ? 0 : s.tool === 'Codex' ? 10 : 20) + (KIND_RANK[s.kind] ?? 8);
const daysAgo = (ts) => (ts ? (Date.now() - new Date(ts)) / DAY : Infinity);

function projectOf(cwd) {
  if (!cwd) return null;
  let p = String(cwd).replace(/[\\/]+$/, '');
  const wt = p.match(/^(.*?)[\\/]\.claude[\\/]worktrees[\\/]/i); if (wt) p = wt[1];
  if (/AppData[\\/](Local|Roaming)[\\/]Claude/i.test(p)) return { key: 'claude-scratch', name: 'Claude scratch workspaces', path: '(temporary folders)' };
  if (/[\\/]Temp[\\/]/i.test(p)) return { key: 'temp', name: 'Temporary folders', path: '(temp)' };
  const home = require('os').homedir();
  if (p.toLowerCase() === home.toLowerCase()) return { key: p.toLowerCase(), name: 'Home folder', path: p };
  return { key: p.toLowerCase(), name: path.basename(p) || p, path: p };
}

const BUILTIN_AGENTS = {
  'general-purpose': 'General-purpose helper that researches and does multi-step work',
  Explore: 'Read-only helper that searches across many files',
  Plan: 'Designs an implementation plan before coding',
  'claude-code-guide': 'Answers questions about Claude Code itself',
  'statusline-setup': 'Sets up the Claude Code status line',
  fork: 'A copy of the current conversation working in the background',
};
const BUILTIN_MCP = {
  Claude_Browser: 'Built-in browser pane', Claude_Preview: 'Browser preview (older name)', visualize: 'Inline charts & diagrams', terminal: 'Terminal panel', 'scheduled-tasks': 'Scheduled tasks',
  'claude-in-chrome': 'Claude in Chrome', Control_Chrome: 'Control Chrome', 'mcp-registry': 'Connector directory',
};
function mcpInfo(key, tools) {
  if (/^ccd_/.test(key)) return { label: 'Claude app: ' + key.replace(/^ccd_/, '').replace(/_/g, ' '), kind: 'Built into the Claude desktop app' };
  if (BUILTIN_MCP[key]) return { label: BUILTIN_MCP[key], kind: 'Built into the Claude desktop app' };
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(key)) {
    const pre = {}; for (const t of Object.keys(tools || {})) { const m = t.match(/^([a-z]+)_/i); if (m) pre[m[1]] = (pre[m[1]] || 0) + tools[t]; }
    const top = Object.entries(pre).sort((a, b) => b[1] - a[1])[0];
    return { label: top ? top[0].charAt(0).toUpperCase() + top[0].slice(1) : `Connector ${key.slice(0, 8)}`, kind: 'claude.ai connector' };
  }
  const pl = key.match(/^plugin_([^_]+(?:-[^_]+)*)_(.+)$/);
  if (pl) return { label: pl[2], kind: `From plugin "${pl[1]}"` };
  return { label: key, kind: 'MCP server' };
}

function mergeStat(into, m) {
  into.count += m.count;
  if (!into.first || (m.first && m.first < into.first)) into.first = m.first;
  if (!into.last || (m.last && m.last > into.last)) into.last = m.last;
  for (const [t, n] of Object.entries(m.tools || {})) into.tools[t] = (into.tools[t] || 0) + n;
  into.recent.push(...(m.recent || []));
}
function finishStat(s) {
  s.recent = s.recent.filter((r) => r.ts).sort((a, b) => String(b.ts).localeCompare(String(a.ts))).slice(0, 8);
  s.tools = Object.entries(s.tools).sort((a, b) => b[1] - a[1]).slice(0, 12);
  return s;
}
const emptyStat = () => ({ count: 0, first: null, last: null, tools: {}, recent: [] });

// turn an internal stem ("servic") back into a real word the user wrote ("service")
function readableTerm(term, examples) {
  for (const ex of examples) for (const w of String(ex.text).toLowerCase().split(/[^a-z0-9+#]+/)) {
    const t = tokens(w)[0];
    if (t && canon(t) === term) return w;
  }
  return term;
}

// ---------- main ----------
function assemble({ usage, inv, summaries = {}, partial = false, scanMs = 0 }) {
  const files = usage.files || [];

  // 1. match usage events to installs
  const installs = inv.skills.map((s) => ({ ...s, uses: [] }));
  const byTool = new Map();
  for (const s of installs) {
    if (!byTool.has(s.tool)) byTool.set(s.tool, new Map());
    const m = byTool.get(s.tool);
    for (const k of [s.invokeName, s.name, s.plugin ? `${s.plugin}:${s.name}` : null].filter(Boolean)) {
      const key = k.toLowerCase();
      if (!m.has(key) || (m.get(key).isCommand && !s.isCommand)) m.set(key, s);
    }
  }
  const virtual = new Map();
  for (const f of files) for (const ev of f.events || []) {
    const m = byTool.get(ev.tool) || new Map();
    const key = ev.skill.toLowerCase();
    let s = m.get(key) || m.get(key.split(':').pop());
    if (!s) {
      if (ev.mentionOnly || !/^[a-z0-9][a-z0-9:_-]*$/i.test(ev.skill)) continue;
      const vid = `${ev.tool}::${ev.skill}`;
      if (!virtual.has(vid)) {
        const [plugin, nm] = ev.skill.includes(':') ? ev.skill.split(':') : [null, ev.skill];
        const v = {
          id: vid, tool: ev.tool, kind: 'Built-in / not on disk', plugin, isCommand: false, name: nm, invokeName: ev.skill,
          sourceLabel: 'Used by the AI, but no skill file was found on this computer (built into the app, a cloud skill, or since removed)',
          description: '', summary: '', whenList: [], notList: [], whenSection: '', notSection: '', howSection: '', outline: [],
          argumentHint: '', version: '', file: null, dir: null, modified: null, installedAt: null, sizeBytes: 0, words: 0, uses: [], virtual: true,
        };
        v.category = categorize(v);
        virtual.set(vid, v);
      }
      s = virtual.get(vid);
    }
    const { skill, mentionOnly, ...rest } = ev;
    s.uses.push({ ...rest, installId: s.id });
  }

  // 2. merge installs of the same skill into one entry
  const groups = new Map();
  for (const s of installs) { const k = s.name.toLowerCase(); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); }
  const clusters = [];
  for (const list of groups.values()) {
    const local = [];
    for (const s of list) {
      const c = local.find((cl) => cl[0].description === s.description || jaccard(cl[0].description, s.description) >= 0.15);
      if (c) c.push(s); else local.push([s]);
    }
    clusters.push(...local);
  }
  for (const v of virtual.values()) clusters.push([v]);

  const usedKeys = new Set();
  const entries = clusters.map((cl) => {
    cl.sort((a, b) => b.uses.length - a.uses.length || installRank(a) - installRank(b));
    const p = cl[0];
    let key = p.name.toLowerCase();
    if (p.virtual) key = 'builtin~' + key;
    if (usedKeys.has(key)) key = `${key}~${p.id}`;
    usedKeys.add(key);
    const uses = cl.flatMap((s) => s.uses).sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    const friendly = friendlyName(p.name);
    return {
      key, name: p.name, friendly, displayName: friendly, category: p.category, plugin: p.plugin, isCommand: p.isCommand, virtual: !!p.virtual,
      description: p.description, summary: p.summary, whenList: p.whenList, notList: p.notList, whenSection: p.whenSection, notSection: p.notSection,
      howSection: p.howSection, outline: p.outline, argumentHint: p.argumentHint, version: p.version, words: p.words,
      installs: cl.map((s) => ({ id: s.id, tool: s.tool, kind: s.kind, plugin: s.plugin, invokeName: s.invokeName, isCommand: s.isCommand, sourceLabel: s.sourceLabel, file: s.file, dir: s.dir, modified: s.modified, installedAt: s.installedAt, sizeBytes: s.sizeBytes || 0, version: s.version, uses: s.uses.length })),
      tools: [...new Set(cl.map((s) => s.tool))],
      uses, useCount: uses.length, lastUsed: uses[0] ? uses[0].ts : null, firstUsed: uses.length ? uses[uses.length - 1].ts : null,
      projects: [...new Set(uses.map((u) => (projectOf(u.cwd) || {}).name).filter(Boolean))],
      sizeBytes: cl.reduce((a, s) => a + (s.sizeBytes || 0), 0),
      installedAt: cl.map((s) => s.installedAt).filter(Boolean).sort()[0] || null,
      usageTracked: cl.some((s) => USAGE_TOOLS.has(s.tool)),
    };
  });
  applySummaries(entries, summaries);
  const byKey = new Map(entries.map((e) => [e.key, e]));

  // 3. similarity, overlaps
  const index = new Index(entries.map((e) => ({ id: e.key, fields: fieldsForEntry(e) })));
  const vecs = entries.map((_, i) => index.vector(i));
  const prefixCount = {}; entries.forEach((e) => { const p = e.name.split(/[-_]/)[0].toLowerCase(); prefixCount[p] = (prefixCount[p] || 0) + 1; });
  const family = (e) => { if (e.plugin) return `${e.installs[0].tool}:${e.plugin}`; const p = e.name.split(/[-_]/)[0].toLowerCase(); return prefixCount[p] > 1 && p.length > 3 ? 'prefix:' + p : null; };
  const edges = [];
  entries.forEach((e, i) => {
    const sims = [];
    for (let j = 0; j < entries.length; j++) {
      if (i === j) continue;
      const c = cosine(vecs[i], vecs[j]);
      if (c >= 0.18) sims.push([entries[j].key, c]);
      if (j > i && c >= 0.25 && !(family(e) && family(e) === family(entries[j])) && !e.virtual && !entries[j].virtual) edges.push([i, j, c]);
    }
    e.similar = sims.sort((a, b) => b[1] - a[1]).slice(0, 6).map(([key, score]) => ({ key, score: +score.toFixed(2) }));
  });
  const parent = entries.map((_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (const [i, j] of edges) parent[find(i)] = find(j);
  const comp = new Map();
  entries.forEach((_, i) => { const r = find(i); if (!comp.has(r)) comp.set(r, []); comp.get(r).push(i); });
  const overlaps = [...comp.values()].filter((c) => c.length >= 2).map((c) => {
    const tw = new Map();
    for (const i of c) for (const [t, w] of vecs[i]) tw.set(t, (tw.get(t) || 0) + w);
    const shared = [...tw.entries()].filter(([t]) => c.filter((i) => vecs[i].has(t)).length >= Math.min(c.length, 2)).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t]) => t);
    const strength = Math.max(...edges.filter(([a, b]) => c.includes(a) && c.includes(b)).map((x) => x[2]));
    const texts = c.map((i) => ({ text: `${entries[i].name.replace(/[-_]/g, ' ')} ${entries[i].description}` }));
    return { keys: c.map((i) => entries[i].key).sort((a, b) => byKey.get(b).useCount - byKey.get(a).useCount), terms: shared.map((t) => readableTerm(t, texts)), strength: +strength.toFixed(2) };
  }).sort((a, b) => b.strength - a.strength).slice(0, 30);

  // 4. rediscover: match your past requests against skills you don't use
  const seenP = new Set(); const prompts = [];
  for (const f of files) for (const p of f.prompts || []) {
    const k = p.text.toLowerCase(); if (p.text.length < 12 || seenP.has(k)) continue;
    seenP.add(k); prompts.push(p);
  }
  const AUTOMATED = /^(review this change|this is an automated|here is a list of|approved:|you are |<|\[pasted text\]\s*$|caveat|base directory for this skill|# |this session is being continued)/i;
  const PROMPT_STOP = new Set(tokens('add change changes read show see run request requests set update check list give take keep put try look send item items name day issue people person time today done start stop end now there working works need needs also sure please again same new old first last next one two three back home home page pages button screen option options section field fields value values number numbers total show shows showing module modules user users current create created remove removed delete'));
  const GENERIC_NAME = new Set(tokens('and driven development developer best practices pro max agent agents reach anything existing projects use using skill skills helper tool tools builder creator general based guide official'));
  const strong = new Map(entries.map((e) => [e.key, new Set(tokens([e.name, e.friendly, e.ai ? e.ai.title : ''].join(' ').replace(/[-_:]/g, ' ')).map(canon).filter((t) => !GENERIC_NAME.has(t)))]));
  const hits = new Map();
  for (const p of prompts) {
    if (AUTOMATED.test(p.text)) continue;
    const q = tokens(p.text).filter((t) => !PROMPT_STOP.has(t)).join(' ');
    const res = index.search(q, { limit: 2 });
    const top = res[0];
    if (!top || top.score < 6 || top.terms.length < 2) continue;
    if (!top.terms.some((t) => strong.get(top.id).has(t))) continue;
    if (res[1] && res[1].score > top.score * 0.97 && byKey.get(res[1].id).useCount > byKey.get(top.id).useCount) continue;
    const h = hits.get(top.id) || { count: 0, examples: [], terms: {} };
    h.count++; h.examples.push({ text: p.text, ts: p.ts, cwd: p.cwd, score: top.score });
    for (const t of top.terms) h.terms[t] = (h.terms[t] || 0) + 1;
    hits.set(top.id, h);
  }
  for (const [k, h] of hits) { const e = byKey.get(k); if (e) e.askedCount = h.count; }
  const rediscover = [...hits.entries()].map(([key, h]) => ({ key, ...h })).filter((r) => {
    const e = byKey.get(r.key); return e && !e.virtual && r.count >= 3 && (e.useCount === 0 || daysAgo(e.lastUsed) > 60);
  }).sort((a, b) => b.count - a.count).slice(0, 16).map((r) => ({
    key: r.key, count: r.count,
    terms: Object.entries(r.terms).sort((a, b) => b[1] - a[1]).slice(0, 5).map((x) => readableTerm(x[0], r.examples)),
    examples: r.examples.sort((a, b) => b.score - a.score).slice(0, 3).map(({ score, ...x }) => ({ ...x, project: (projectOf(x.cwd) || {}).name || '' })),
  }));

  // 5. projects
  const projMap = new Map();
  const proj = (cwd) => {
    const p = projectOf(cwd); if (!p) return null;
    if (!projMap.has(p.key)) projMap.set(p.key, { ...p, sessions: new Set(), prompts: 0, first: null, last: null, skills: {}, mcp: {}, agents: {}, tools: {}, recent: [] });
    return projMap.get(p.key);
  };
  const touch = (pr, ts) => { if (!ts) return; if (!pr.first || ts < pr.first) pr.first = ts; if (!pr.last || ts > pr.last) pr.last = ts; };
  for (const f of files) {
    const main = proj(f.mainCwd);
    if (main && f.session) { main.sessions.add(f.session); main.tools[f.tool] = (main.tools[f.tool] || 0) + 1; }
    for (const p of f.prompts || []) { const pr = proj(p.cwd || f.mainCwd); if (!pr) continue; pr.prompts++; touch(pr, p.ts); pr.recent.push(p); }
    if (main) {
      for (const [k, m] of Object.entries(f.mcp || {})) main.mcp[k] = (main.mcp[k] || 0) + m.count;
      for (const [k, m] of Object.entries(f.agents || {})) main.agents[k] = (main.agents[k] || 0) + m.count;
    }
  }
  for (const e of entries) for (const u of e.uses) { const pr = proj(u.cwd); if (pr) { pr.skills[e.key] = (pr.skills[e.key] || 0) + 1; touch(pr, u.ts); } }
  const projects = [...projMap.values()].map((p) => ({
    key: p.key, name: p.name, path: p.path, sessions: p.sessions.size, prompts: p.prompts, first: p.first, last: p.last, tools: p.tools,
    skills: Object.entries(p.skills).sort((a, b) => b[1] - a[1]),
    mcp: Object.entries(p.mcp).sort((a, b) => b[1] - a[1]).slice(0, 10),
    agents: Object.entries(p.agents).sort((a, b) => b[1] - a[1]),
    recent: p.recent.sort((a, b) => String(b.ts).localeCompare(String(a.ts))).slice(0, 3).map((r) => ({ ts: r.ts, text: r.text })),
  })).filter((p) => p.sessions || p.prompts || p.skills.length).sort((a, b) => String(b.last || '').localeCompare(String(a.last || '')));

  // 6. MCP servers
  const mcpMap = new Map();
  const getM = (key) => { if (!mcpMap.has(key)) mcpMap.set(key, { key, configs: [], used: emptyStat(), usedBy: {} }); return mcpMap.get(key); };
  for (const c of inv.mcpConfigs) getM(c.tool === 'Claude Code' ? c.key : `${c.tool}:${c.key}`).configs.push(c);
  for (const f of files) for (const [k, m] of Object.entries(f.mcp || {})) {
    const key = f.tool === 'Claude Code' ? k : `${f.tool}:${k}`;
    const s = getM(key); mergeStat(s.used, m); s.usedBy[f.tool] = (s.usedBy[f.tool] || 0) + m.count;
  }
  const mcp = [...mcpMap.values()].map((s) => {
    const info = s.configs.length ? { label: s.configs[0].name, kind: s.configs[0].from.startsWith('Plugin') ? `From ${s.configs[0].from.toLowerCase()}` : 'Set up by you' } : mcpInfo(s.key, s.used.tools);
    return { key: s.key, ...info, configs: s.configs, used: finishStat(s.used), tool: (s.configs[0] && s.configs[0].tool) || Object.keys(s.usedBy)[0] || 'Claude Code' };
  }).sort((a, b) => b.used.count - a.used.count || a.label.localeCompare(b.label));

  // 7. sub-agents
  const agentStats = {};
  for (const f of files) for (const [k, m] of Object.entries(f.agents || {})) { agentStats[k] = agentStats[k] || emptyStat(); mergeStat(agentStats[k], m); }
  const agents = inv.agents.map((a) => ({ ...a, builtin: false, used: emptyStat() }));
  for (const [type, st] of Object.entries(agentStats)) {
    let a = agents.find((x) => x.invokeName === type || x.name === type);
    if (!a) { a = { id: 'agent::' + type, name: type, invokeName: type, source: BUILTIN_AGENTS[type] ? 'Built into Claude Code' : 'Not found on disk', description: BUILTIN_AGENTS[type] || '', builtin: true, used: emptyStat() }; agents.push(a); }
    mergeStat(a.used, st);
  }
  agents.forEach((a) => finishStat(a.used));
  agents.sort((a, b) => b.used.count - a.used.count || a.name.localeCompare(b.name));

  // 8. cleanup
  const stale = entries.filter((e) => !e.virtual && e.usageTracked).map((e) => {
    if (e.useCount === 0 && daysAgo(e.installedAt) > 30) return { key: e.key, reason: 'never', days: Math.round(daysAgo(e.installedAt)), sizeBytes: e.sizeBytes };
    if (e.useCount > 0 && daysAgo(e.lastUsed) > 60) return { key: e.key, reason: 'old', days: Math.round(daysAgo(e.lastUsed)), sizeBytes: e.sizeBytes };
    return null;
  }).filter(Boolean).sort((a, b) => b.sizeBytes - a.sizeBytes);
  const duplicates = entries.filter((e) => e.installs.length > 1).map((e) => {
    const perTool = {}; e.installs.forEach((i) => { perTool[i.tool] = (perTool[i.tool] || 0) + 1; });
    return { key: e.key, count: e.installs.length, sameTool: Object.entries(perTool).filter(([, n]) => n > 1).map(([t]) => t), sizeBytes: e.sizeBytes };
  }).sort((a, b) => b.sameTool.length - a.sameTool.length || b.count - a.count);
  const oldVersions = inv.oldVersions;

  const paths = {};
  for (const e of entries) for (const i of e.installs) if (i.dir) paths[i.id] = { dir: i.dir, file: i.file };
  for (const o of oldVersions) paths[o.id] = { dir: o.path };
  for (const a of agents) if (a.file) paths[a.id] = { dir: path.dirname(a.file), file: a.file };

  return {
    data: {
      generatedAt: new Date().toISOString(), scanMs, partial,
      logFiles: usage.logFiles || { claude: 0, codex: 0 }, usageSupport: USAGE_SUPPORT,
      entries, overlaps, rediscover, projects, mcp, agents,
      cleanup: { stale, duplicates, oldVersions, oldTotal: oldVersions.reduce((a, o) => a + o.sizeBytes, 0) },
      promptCount: prompts.length,
    },
    paths,
  };
}

function applySummaries(entries, summaries) {
  for (const e of entries) {
    const s = summaries[e.key];
    if (s && s.hash === hashOf(e)) { e.ai = { title: s.title, oneLiner: s.oneLiner, example: s.example }; e.displayName = s.title || e.friendly; }
    else { delete e.ai; e.displayName = e.friendly; }
  }
}

module.exports = { assemble, applySummaries, hashOf };
