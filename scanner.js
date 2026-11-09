// Skill Atlas scanner: finds installed AI-tool skills, MCP servers and sub-agents on
// this machine, and reads local session logs to work out when (and for what) each was used.
// Everything stays on this computer; nothing is sent anywhere.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const readline = require('readline');

const HOME = os.homedir();
const P = (...p) => path.join(HOME, ...p);
const CACHE_DIR = path.join(__dirname, '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'usage-cache.json');
const CACHE_VERSION = 8;

// ---------- small helpers ----------
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const readText = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, '')); } catch { return null; } };
const listDir = (p) => { try { return fs.readdirSync(p, { withFileTypes: true }); } catch { return []; } };
const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

const SKIP_DIRS = new Set(['node_modules', '.git', '__pycache__', 'extensions', '.venv', 'venv', 'dist']);
function findFiles(root, fileName, maxDepth = 6, depth = 0, out = []) {
  if (depth > maxDepth) return out;
  for (const e of listDir(root)) {
    const full = path.join(root, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      findFiles(full, fileName, maxDepth, depth + 1, out);
    } else if (e.name === fileName) out.push(full);
  }
  return out;
}

const sizeCache = new Map();
function dirSize(dir, budget = { files: 40000 }) {
  if (!dir) return 0;
  const key = dir.toLowerCase();
  if (sizeCache.has(key)) return sizeCache.get(key);
  let total = 0;
  const walk = (d) => {
    for (const e of listDir(d)) {
      if (budget.files-- <= 0) return;
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else { try { total += fs.statSync(full).size; } catch {} }
    }
  };
  walk(dir);
  sizeCache.set(key, total);
  return total;
}

const unquote = (v) => {
  v = String(v).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v.replace(/\\"/g, '"');
};

function parseFrontmatter(src) {
  src = src.replace(/^﻿/, '');
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/);
  if (!m) return { fm: {}, body: src };
  const lines = m[1].split(/\r?\n/);
  const fm = {};
  for (let i = 0; i < lines.length; i++) {
    const km = lines[i].match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!km) continue;
    const key = km[1].toLowerCase();
    let v = km[2];
    if (/^[|>][+-]?\s*$/.test(v)) {
      const buf = [];
      while (i + 1 < lines.length && (/^\s+/.test(lines[i + 1]) || lines[i + 1].trim() === '')) buf.push(lines[++i].trim());
      v = buf.join(v.startsWith('>') ? ' ' : '\n').trim();
    } else if (v.trim() === '') {
      const buf = [];
      while (i + 1 < lines.length && /^\s+/.test(lines[i + 1])) buf.push(lines[++i]);
      const nested = {};
      for (const b of buf) { const n = b.trim().match(/^([A-Za-z0-9_-]+):\s*(.*)$/); if (n) nested[n[1].toLowerCase()] = unquote(n[2]); }
      v = Object.keys(nested).length ? nested : buf.map((s) => s.trim().replace(/^-\s*/, '')).join(', ');
    } else {
      v = unquote(v);
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]) && !/^\s+[A-Za-z0-9_-]+:\s/.test(lines[i + 1])) v += ' ' + lines[++i].trim();
    }
    fm[key] = v;
  }
  return { fm, body: src.slice(m[0].length) };
}

function sections(body) {
  const out = []; let cur = { level: 0, title: '', lines: [] }; let fence = false;
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const h = !fence && line.match(/^(#{1,4})\s+(.+?)\s*#*\s*$/);
    if (h) { out.push(cur); cur = { level: h[1].length, title: h[2].replace(/[*_`]/g, ''), lines: [] }; }
    else cur.lines.push(line);
  }
  out.push(cur);
  return out;
}

function sectionText(secs, idx, maxChars = 1400) {
  const s = secs[idx]; let text = s.lines.join('\n');
  for (let j = idx + 1; j < secs.length && secs[j].level > s.level; j++) text += `\n**${secs[j].title}**\n` + secs[j].lines.join('\n');
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  if (text.length > maxChars) {
    text = text.slice(0, maxChars);
    const fences = (text.match(/```/g) || []).length; if (fences % 2) text += '\n```';
    text += '\n…';
  }
  return text;
}

const splitSentences = (t) => String(t || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+(?=[A-Z"'(\[])/).filter(Boolean);
const WHEN_RE = /\b(use (this|it|when|whenever|for|before|after|to)|used when|trigger|must use|when the user|when you|invoke|whenever|applies when|read (this )?first|load (it|this)? ?before)/i;
const NOT_RE = /^(\s*)(not for|do not|don't|never|skip|avoid)\b|\bNOT for\b|\bdo not use\b/i;

const CATEGORIES = [
  ['Video & Animation', /video|animation|animate|remotion|hyperframes|avatar|motion|clip|caption|render|story|shorts|film/i],
  ['Docs & Office', /docx|\bword\b|pdf|pptx|powerpoint|slides|presentation|spreadsheet|xlsx|excel|document|google (docs|sheets|workspace)/i],
  ['Design & UI', /^(?!.*\bapi\b).*(design|\bui\b|ux|figma|frontend|landing|css|tailwind|visual|layout|component|svg|vector|brand)/i],
  ['SEO & Marketing', /seo|marketing|campaign|backlink|serp|keyword|ads?\b|email sequence|brand|content strategy|geo\b/i],
  ['Data & Analytics', /data|sql|query|dashboard|chart|metric|analytics|statistic|visuali[sz]/i],
  ['Testing & Quality', /test|tdd|review|quality|debug|lint|verify|qa\b/i],
  ['Security', /security|harden|vulnerab|reverse.engineer|threat/i],
  ['DevOps & Shipping', /deploy|ci\/cd|ci-cd|pipeline|release|ship|launch|git\b|version|migration|observability|monitor/i],
  ['Planning & Product', /plan|spec|roadmap|product|sprint|brainstorm|idea|stakeholder|interview|research synth|prioriti/i],
  ['Writing & Comms', /writ|prose|humaniz|copy|comms|newsletter|blog|text\b/i],
  ['Research & Web', /research|search|web|browse|scrap|internet|reddit|twitter|youtube/i],
  ['Engineering', /code|api|interface|architecture|refactor|implement|performance|context|engineering|mcp|sdk|build/i],
];
function categorize(s) {
  const hay = `${s.name} ${s.plugin || ''} ${s.description}`;
  for (const [cat, re] of CATEGORIES) if (re.test(s.name)) return cat;
  for (const [cat, re] of CATEGORIES) if (re.test(`${s.name} ${s.plugin || ''}`)) return cat;
  for (const [cat, re] of CATEGORIES) if (re.test(hay)) return cat;
  return 'Other';
}

// ---------- skills ----------
function buildSkill({ file, tool, kind, plugin, isCommand, sourceLabel, installedAt }) {
  const src = readText(file);
  if (src == null) return null;
  const { fm, body } = parseFrontmatter(src);
  const dirName = path.basename(path.dirname(file));
  const name = String(fm.name || (isCommand ? path.basename(file, '.md') : dirName)).trim();
  let description = String(fm.description || '').trim();
  const secs = sections(body);
  if (!description) {
    const firstPara = body.split(/\r?\n\r?\n/).map((p) => p.trim()).find((p) => p && !p.startsWith('#') && !p.startsWith('```'));
    description = (firstPara || '').replace(/\s+/g, ' ').slice(0, 400);
  }
  const sentences = splitSentences(description);
  const whenList = []; const notList = [];
  for (const s of sentences) {
    if (NOT_RE.test(s)) notList.push(s);
    else if (WHEN_RE.test(s)) whenList.push(s);
  }
  if (fm.when_to_use || fm['when-to-use']) whenList.unshift(String(fm.when_to_use || fm['when-to-use']));
  let summary = sentences[0] || '';
  if (summary.length < 50 && sentences[1]) summary += ' ' + sentences[1];

  let whenSection = '', notSection = '', howSection = '';
  secs.forEach((s, i) => {
    const t = s.title;
    if (!t) return;
    if (!notSection && /when not|don.t use|do not use|not for|avoid using|anti.?patterns/i.test(t)) notSection = sectionText(secs, i, 900);
    else if (!whenSection && /when to use|when should|use (this|it) when|use cases?|triggers?|when to (load|invoke|apply)|scope|when this applies/i.test(t)) whenSection = sectionText(secs, i, 1100);
    else if (!howSection && /how to use|usage|quick ?start|getting started|how it works|workflow|the process|process|steps|instructions|commands|core loop|method/i.test(t)) howSection = sectionText(secs, i, 1400);
  });
  const outline = secs.filter((s) => s.level >= 1 && s.level <= 2 && s.title).map((s) => s.title).slice(0, 18);
  const stat = fs.statSync(file);
  const meta = typeof fm.metadata === 'object' ? fm.metadata : {};
  const dir = path.dirname(file);
  const skill = {
    tool, kind, plugin: plugin || null, isCommand: !!isCommand, sourceLabel: sourceLabel || kind,
    name, description, summary, whenList, notList, whenSection, notSection, howSection, outline,
    argumentHint: fm['argument-hint'] || fm.argument_hint || '',
    version: fm.version || meta.version || '',
    file, dir, modified: stat.mtime.toISOString(),
    installedAt: installedAt || stat.birthtime.toISOString(),
    sizeBytes: isCommand ? stat.size : dirSize(dir),
    words: body.split(/\s+/).length,
  };
  skill.id = `${tool}::${plugin ? plugin + ':' : ''}${name}`;
  skill.invokeName = plugin && tool.startsWith('Claude') ? `${plugin}:${name}` : name;
  skill.category = categorize(skill);
  return skill;
}

function pluginRootsUnder(root, maxDepth = 4) {
  return findFiles(root, 'plugin.json', maxDepth)
    .filter((f) => path.basename(path.dirname(f)) === '.claude-plugin')
    .map((f) => ({ root: path.dirname(path.dirname(f)), name: (readJson(f) || {}).name || path.basename(path.dirname(path.dirname(f))) }));
}

function skillsOfPluginRoot(root, plugin, tool, kind, sourceLabel, installedAt) {
  const out = [];
  for (const f of findFiles(path.join(root, 'skills'), 'SKILL.md', 4)) out.push(buildSkill({ file: f, tool, kind, plugin, sourceLabel, installedAt }));
  const cmdDir = path.join(root, 'commands');
  for (const e of listDir(cmdDir)) {
    if (e.isFile() && e.name.endsWith('.md')) out.push(buildSkill({ file: path.join(cmdDir, e.name), tool, kind, plugin, isCommand: true, sourceLabel, installedAt }));
  }
  return out;
}

// All Claude plugin roots that are actually active (installed version + claude.ai synced)
function claudePluginRoots() {
  const roots = [];
  const installed = readJson(P('.claude', 'plugins', 'installed_plugins.json'));
  const seen = [];
  if (installed && installed.plugins) {
    for (const [key, entries] of Object.entries(installed.plugins)) {
      const entry = (entries || []).slice(-1)[0];
      if (!entry || !isDir(entry.installPath)) continue;
      const name = key.split('@')[0];
      seen.push(entry.installPath);
      roots.push({ root: entry.installPath, name, kind: 'Plugin', label: `Plugin "${name}" from ${key.split('@')[1] || 'marketplace'}`, installedAt: entry.installedAt, version: entry.version });
    }
  }
  for (const { root, name } of pluginRootsUnder(P('.claude', 'plugins', 'synced'), 5)) {
    if (seen.some((s) => samePath(s, root))) continue;
    roots.push({ root, name, kind: 'Account plugin', label: `Plugin "${name}" synced from claude.ai` });
  }
  return { roots, installed };
}

function scanSkills(projectDirs) {
  const skills = [];
  const add = (s) => { if (s) skills.push(s); };
  const claudeSkills = P('.claude', 'skills');
  for (const e of listDir(claudeSkills)) {
    if (!e.isDirectory() || e.name === 'synced') continue;
    for (const f of findFiles(path.join(claudeSkills, e.name), 'SKILL.md', 3)) add(buildSkill({ file: f, tool: 'Claude Code', kind: 'Personal skill', sourceLabel: 'Installed in ~/.claude/skills' }));
  }
  for (const f of findFiles(path.join(claudeSkills, 'synced'), 'SKILL.md', 3)) add(buildSkill({ file: f, tool: 'Claude Code', kind: 'Account skill', plugin: 'anthropic-skills', sourceLabel: 'Synced from your claude.ai account' }));

  const { roots } = claudePluginRoots();
  for (const r of roots) skillsOfPluginRoot(r.root, r.name, 'Claude Code', r.kind, r.label, r.installedAt).forEach(add);

  for (const dir of projectDirs) {
    const ps = path.join(dir, '.claude', 'skills');
    if (!isDir(ps) || samePath(ps, claudeSkills)) continue;
    for (const f of findFiles(ps, 'SKILL.md', 3)) add(buildSkill({ file: f, tool: 'Claude Code', kind: 'Project skill', sourceLabel: `Project: ${dir}` }));
  }

  for (const f of findFiles(P('.codex', 'skills'), 'SKILL.md', 4)) {
    const sys = f.includes(`${path.sep}.system${path.sep}`);
    add(buildSkill({ file: f, tool: 'Codex', kind: sys ? 'Built-in skill' : 'Personal skill', sourceLabel: sys ? 'Ships with Codex' : 'Installed in ~/.codex/skills' }));
  }
  for (const v of codexPluginVersions()) {
    if (!v.current) continue;
    for (const f of findFiles(path.join(v.path, 'skills'), 'SKILL.md', 3)) add(buildSkill({ file: f, tool: 'Codex', kind: 'Plugin', plugin: v.plugin, sourceLabel: `Codex plugin "${v.plugin}" (${v.market})` }));
  }

  const others = [
    ['Gemini CLI', P('.gemini', 'skills'), 'Installed in ~/.gemini/skills'],
    ['Antigravity', P('.gemini', 'antigravity', 'skills'), 'Installed in ~/.gemini/antigravity/skills'],
    ['Shared (.agents)', P('.agents', 'skills'), 'Shared agent skills in ~/.agents/skills'],
    ['OpenCode', P('.config', 'opencode', 'skills'), 'Installed in ~/.config/opencode/skills'],
    ['Cursor', P('.cursor', 'skills'), 'Installed in ~/.cursor/skills'],
    ['Windsurf', P('.codeium', 'windsurf', 'skills'), 'Installed in Windsurf'],
  ];
  for (const [tool, dir, label] of others) for (const f of findFiles(dir, 'SKILL.md', 3)) add(buildSkill({ file: f, tool, kind: 'Skill', sourceLabel: label }));

  const byId = new Map();
  for (const s of skills) if (!byId.has(s.id)) byId.set(s.id, s);
  return [...byId.values()];
}

// ---------- plugin versions (for cleanup) ----------
function codexPluginVersions() {
  const out = [];
  const cache = P('.codex', 'plugins', 'cache');
  for (const market of listDir(cache)) {
    if (!market.isDirectory()) continue;
    for (const plug of listDir(path.join(cache, market.name))) {
      if (!plug.isDirectory()) continue;
      const pdir = path.join(cache, market.name, plug.name);
      const versions = listDir(pdir).filter((v) => v.isDirectory()).map((v) => { const p = path.join(pdir, v.name); return { p, v: v.name, m: fs.statSync(p).mtimeMs }; }).sort((a, b) => b.m - a.m);
      versions.forEach((v, i) => out.push({ tool: 'Codex', market: market.name, plugin: plug.name, version: v.v, path: v.p, mtime: new Date(v.m).toISOString(), current: i === 0 }));
    }
  }
  return out;
}

function oldPluginVersions() {
  const items = [];
  const { installed } = claudePluginRoots();
  const active = [];
  if (installed && installed.plugins) for (const entries of Object.values(installed.plugins)) for (const e of entries || []) if (e.installPath) active.push(e.installPath);
  const cache = P('.claude', 'plugins', 'cache');
  for (const market of listDir(cache)) {
    if (!market.isDirectory()) continue;
    for (const plug of listDir(path.join(cache, market.name))) {
      if (!plug.isDirectory()) continue;
      const pdir = path.join(cache, market.name, plug.name);
      const versions = listDir(pdir).filter((v) => v.isDirectory());
      const anyActive = active.some((a) => samePath(path.dirname(a), pdir));
      for (const v of versions) {
        const p = path.join(pdir, v.name);
        if (active.some((a) => samePath(a, p))) continue;
        items.push({ tool: 'Claude Code', market: market.name, plugin: plug.name, version: v.name, path: p, mtime: fs.statSync(p).mtime.toISOString(), reason: anyActive ? 'Older version (a newer one is installed)' : 'Plugin no longer installed' });
      }
    }
  }
  for (const v of codexPluginVersions()) if (!v.current) items.push({ ...v, reason: 'Older version (a newer one is installed)' });
  for (const it of items) { it.sizeBytes = dirSize(it.path); it.id = 'old::' + it.path; }
  return items.sort((a, b) => b.sizeBytes - a.sizeBytes);
}

// ---------- sub-agents ----------
function scanAgents(projectDirs) {
  const agents = [];
  const addDir = (dir, source, plugin) => {
    for (const e of listDir(dir)) {
      if (!e.isFile() || !e.name.endsWith('.md')) continue;
      const file = path.join(dir, e.name);
      const { fm } = parseFrontmatter(readText(file) || '');
      const name = String(fm.name || path.basename(e.name, '.md'));
      agents.push({ id: `agent::${plugin ? plugin + ':' : ''}${name}`, name, invokeName: plugin ? `${plugin}:${name}` : name, plugin: plugin || null, source, description: String(fm.description || '').replace(/\s+/g, ' ').slice(0, 500), model: fm.model || '', tools: typeof fm.tools === 'string' ? fm.tools : '', file });
    }
  };
  addDir(P('.claude', 'agents'), 'Your agents (~/.claude/agents)');
  for (const r of claudePluginRoots().roots) addDir(path.join(r.root, 'agents'), `Plugin "${r.name}"`, r.name);
  for (const d of projectDirs) { const ad = path.join(d, '.claude', 'agents'); if (isDir(ad) && !samePath(ad, P('.claude', 'agents'))) addDir(ad, `Project: ${d}`); }
  const seen = new Set();
  return agents.filter((a) => (seen.has(a.id) ? false : seen.add(a.id)));
}

// ---------- MCP server configs (secrets are never read out: no env, headers or full args) ----------
function describeServer(cfg) {
  cfg = cfg || {};
  const url = cfg.url || cfg.httpUrl || cfg.serverUrl || cfg.serverURL;
  if (url) { let host = ''; try { host = new URL(url).host; } catch { host = 'remote server'; } return { type: cfg.type || 'http', target: host }; }
  const cmd = cfg.command ? path.basename(String(cfg.command)).replace(/\.(exe|cmd|bat)$/i, '') : '';
  const pkg = (Array.isArray(cfg.args) ? cfg.args : []).find((a) => typeof a === 'string' && /^@?[a-z0-9._-]+(\/[a-z0-9._-]+)?(@[\w.-]+)?$/i.test(a) && a.length < 60 && !a.startsWith('-') && !/^(y|yes|run|exec|x|dlx|mcp|serve|start|stdio|--)$/i.test(a));
  return { type: cfg.type || 'stdio', target: [cmd, pkg].filter(Boolean).join(' ') };
}

function scanMcpConfigs(projectDirs) {
  const out = [];
  const add = (key, name, tool, from, cfg) => out.push({ key, name, tool, from, ...describeServer(cfg) });
  const cj = readJson(P('.claude.json')) || {};
  for (const [n, c] of Object.entries(cj.mcpServers || {})) add(n, n, 'Claude Code', 'Your Claude settings (~/.claude.json)', c);
  for (const [proj, v] of Object.entries(cj.projects || {})) for (const [n, c] of Object.entries((v && v.mcpServers) || {})) add(n, n, 'Claude Code', `Project: ${proj}`, c);
  for (const d of projectDirs) { const j = readJson(path.join(d, '.mcp.json')); if (j) for (const [n, c] of Object.entries(j.mcpServers || {})) add(n, n, 'Claude Code', `Project file: ${path.join(d, '.mcp.json')}`, c); }
  for (const r of claudePluginRoots().roots) {
    const j = readJson(path.join(r.root, '.mcp.json')); if (!j) continue;
    const servers = j.mcpServers || j;
    for (const [n, c] of Object.entries(servers)) if (c && typeof c === 'object') add(`plugin_${r.name}_${n}`, n, 'Claude Code', `Plugin "${r.name}"`, c);
  }
  const toml = readText(P('.codex', 'config.toml'));
  if (toml) {
    let cur = null; const servers = {};
    for (const line of toml.split(/\r?\n/)) {
      const h = line.match(/^\s*\[mcp_servers\.([^\].]+)\]\s*$/);
      if (h) { cur = servers[h[1]] = {}; continue; }
      if (/^\s*\[/.test(line)) { cur = null; continue; }
      const kv = cur && line.match(/^\s*(command|url|type)\s*=\s*"([^"]*)"/);
      if (kv) cur[kv[1]] = kv[2];
    }
    for (const [n, c] of Object.entries(servers)) add(n, n, 'Codex', 'Codex settings (~/.codex/config.toml)', c);
  }
  for (const [tool, f] of [['Gemini CLI', P('.gemini', 'settings.json')], ['Antigravity', P('.gemini', 'antigravity', 'mcp_config.json')]]) {
    const j = readJson(f); if (j) for (const [n, c] of Object.entries(j.mcpServers || {})) add(n, n, tool, `${tool} settings`, c);
  }
  return out;
}

// ---------- usage: Claude Code transcripts ----------
const BUILTIN_COMMANDS = new Set(('model compact clear init config mcp login logout help cost context resume exit quit permissions hooks memory status doctor agents plugin plugins add-dir ide theme vim usage fast effort rewind export release-notes bug feedback terminal-setup statusline install-github-app pr-comments upgrade output-style privacy-settings todos tasks bashes approved-tools allowed-tools migrate-installer sandbox stickers security-review-setup remote-env voice extra-usage keybindings rename continue btw agents-md skills hooks-config insights plan think-back passes chrome desktop mobile copy files diff stats tag workflows artifacts session').split(' '));

// Mask anything that looks like a password, token or key before it is stored or shown.
function redact(t) {
  return t
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1••••@')
    .replace(/\b(bearer|basic)\s+[A-Za-z0-9._~+/-]{8,}=*/gi, '$1 ••••')
    .replace(/(password|passwd|pwd|passphrase|token|secret|api[_-]?key|apikey|access[_-]?key|authorization|bearer|client[_-]?secret)(\s*(?:for\s+'[^']*'\s*)?[:=]\s*|\s+is\s+|(?<=bearer)\s+)(["']?)[^\s"',;]{3,}/gi, '$1$2$3••••')
    .replace(/\b(sk|pk|rk)-[A-Za-z0-9_-]{12,}/g, '••••')
    .replace(/\b(ghp|gho|ghu|ghs|github_pat|glpat|xox[abpr]|AKIA|ASIA|AIza)[A-Za-z0-9_-]{10,}/g, '••••')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, '••••')
    .replace(/\b(?=[A-Za-z0-9+/_-]*\d)(?=[A-Za-z0-9+/_-]*[A-Za-z])[A-Za-z0-9+/_-]{32,}={0,2}/g, '••••');
}

function cleanPrompt(t, max = 320) {
  if (!t) return '';
  t = redact(String(t))
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, ' ')
    .replace(/<pasted_content[^>]*>[\s\S]*?<\/pasted_content[^>]*>/g, ' [pasted text] ')
    .replace(/<ide_[a-z_]+>[\s\S]*?<\/ide_[a-z_]+>/g, ' ')
    .replace(/<\/?[a-z_-]+(\s[^>]*)?>/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

function userText(msg) {
  const c = msg && msg.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    if (c.some((b) => b && b.type === 'tool_result')) return null;
    return c.filter((b) => b && b.type === 'text').map((b) => b.text).join('\n');
  }
  return null;
}

function bumpTool(map, key, ev, extra) {
  const m = map[key] || (map[key] = { count: 0, first: ev.ts, last: ev.ts, tools: {}, recent: [] });
  m.count++;
  if (!m.first || ev.ts < m.first) m.first = ev.ts;
  if (!m.last || ev.ts > m.last) m.last = ev.ts;
  if (extra) m.tools[extra] = (m.tools[extra] || 0) + 1;
  const prev = m.recent[m.recent.length - 1];
  if (!prev || prev.session !== ev.session || prev.prompt !== ev.prompt) { m.recent.push(ev); if (m.recent.length > 6) m.recent.shift(); }
}

async function scanClaudeFile(file) {
  const events = []; const cwds = new Set(); const prompts = []; const mcp = {}; const agents = {};
  const isSub = file.includes(`${path.sep}subagents${path.sep}`);
  let lastPrompt = ''; let topic = ''; let cwd = ''; let session = path.basename(file, '.jsonl'); let sidechain = isSub;
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    const hasSkill = line.includes('"name":"Skill"');
    const isUser = line.includes('"type":"user"');
    const hasTool = line.includes('"type":"tool_use"') && (line.includes('"name":"mcp__') || line.includes('"name":"Agent"') || line.includes('"name":"Task"'));
    if (!hasSkill && !isUser && !hasTool) continue;
    if (isUser && !hasSkill && !hasTool && (line.length > 400000 || line.includes('"tool_result"'))) {
      if (!cwd) { const m = line.match(/"cwd":"((?:[^"\\]|\\.)*)"/); if (m) { try { cwd = JSON.parse(`"${m[1]}"`); cwds.add(cwd); } catch {} } }
      continue;
    }
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (o.cwd) { cwd = o.cwd; cwds.add(cwd); }
    if (o.sessionId) session = o.sessionId;
    if (o.isSidechain) sidechain = true;
    const ts = o.timestamp;
    if (o.type === 'user' && !o.isMeta) {
      const raw = userText(o.message);
      if (raw) {
        const cmd = raw.match(/<command-name>\/?([^<\s]+)<\/command-name>/);
        if (cmd) {
          const name = cmd[1].trim();
          const args = (raw.match(/<command-args>([\s\S]*?)<\/command-args>/) || [])[1] || '';
          if (!BUILTIN_COMMANDS.has(name)) {
            events.push({ tool: 'Claude Code', skill: name, ts, cwd, session, via: 'slash command', prompt: cleanPrompt(args) || lastPrompt, topic });
            if (args.trim()) lastPrompt = cleanPrompt(args);
          }
        } else if (!/^\s*(<local-command|<command-message|Caveat:|\[Request interrupted|<task-notification|<side-sessions-event|<ci-monitor-event)/.test(raw)) {
          const cp = cleanPrompt(raw);
          if (cp && cp.length > 1) {
            lastPrompt = cp;
            if (!topic || (topic.length < 25 && cp.length > topic.length)) topic = cp;
            if (!sidechain && prompts.length < 400) prompts.push({ ts, cwd, text: cleanPrompt(raw, 240) });
          }
        }
      }
    }
    if (o.type === 'assistant' && o.message && Array.isArray(o.message.content)) {
      for (const b of o.message.content) {
        if (!b || b.type !== 'tool_use') continue;
        if (b.name === 'Skill' && b.input && b.input.skill) {
          events.push({ tool: 'Claude Code', skill: String(b.input.skill).replace(/^\//, ''), ts, cwd, session, via: sidechain ? 'sub-agent' : 'auto (Claude chose it)', prompt: lastPrompt, topic, args: b.input.args ? cleanPrompt(b.input.args) : '' });
        } else if (typeof b.name === 'string' && b.name.startsWith('mcp__')) {
          const parts = b.name.split('__');
          bumpTool(mcp, parts[1], { ts, cwd, session, prompt: lastPrompt }, parts.slice(2).join('__'));
        } else if ((b.name === 'Agent' || b.name === 'Task') && b.input) {
          const type = String(b.input.subagent_type || 'general-purpose');
          bumpTool(agents, type, { ts, cwd, session, prompt: lastPrompt, task: cleanPrompt(b.input.description || '', 120) });
        }
      }
    }
  }
  return { events, cwds: [...cwds], prompts, mcp, agents, session: isSub ? null : session, mainCwd: [...cwds][0] || '' };
}

// ---------- usage: Codex sessions ----------
const CODEX_SKILL_PATH = /skills[\\/]+(?:\.system[\\/]+)?([A-Za-z0-9_.-]+)[\\/]+SKILL\.md/g;
async function scanCodexFile(file) {
  let text;
  try {
    const buf = fs.readFileSync(file);
    text = file.endsWith('.zst') ? (zlib.zstdDecompressSync ? zlib.zstdDecompressSync(buf).toString('utf8') : '') : buf.toString('utf8');
  } catch { return { events: [], cwds: [], prompts: [], mcp: {}, agents: {} }; }
  const events = []; const cwds = new Set(); const prompts = []; const mcp = {};
  let cwd = ''; let lastPrompt = ''; let topic = ''; let session = path.basename(file).replace(/\.jsonl(\.zst)?$/, '');
  const seenThisTurn = new Set();
  for (const line of text.split('\n')) {
    if (!line) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    const p = o.payload || {};
    if (p.cwd) { cwd = p.cwd; cwds.add(cwd); }
    if (o.type === 'session_meta' && p.id) session = p.id;
    if (o.type === 'event_msg' && p.type === 'task_started') seenThisTurn.clear();
    if (o.type === 'event_msg' && /^mcp_tool_call/.test(p.type || '') && p.invocation && p.invocation.server && /begin/.test(p.type)) {
      bumpTool(mcp, p.invocation.server, { ts: o.timestamp, cwd, session, prompt: lastPrompt }, p.invocation.tool);
    }
    if (o.type === 'response_item' && p.type === 'message' && p.role === 'user') {
      let t = (p.content || []).filter((c) => c.type === 'input_text').map((c) => c.text).join('\n');
      // Codex wraps the request in IDE context; keep only the part the user typed
      const mine = t.match(/##\s*My request for Codex:?\s*([\s\S]*)$/i);
      if (mine) t = mine[1];
      else if (/^\s*# (Files mentioned|Context from my IDE)/i.test(t)) t = t.replace(/^[\s\S]*?\n\s*\n(?=[^#\s])/, '');
      if (t && !/^\s*(#\s*AGENTS\.md|<environment_context|<user_instructions|<permissions|<collaboration_mode|<INSTRUCTIONS|<turn_aborted)/.test(t)) {
        lastPrompt = cleanPrompt(t);
        if (!topic || (topic.length < 25 && lastPrompt.length > topic.length)) topic = lastPrompt;
        if (prompts.length < 400) prompts.push({ ts: o.timestamp, cwd, text: cleanPrompt(t, 240) });
        for (const m of t.matchAll(/(?:^|\s)\$([a-z0-9][a-z0-9-]{2,})/gi)) {
          events.push({ tool: 'Codex', skill: m[1], ts: o.timestamp, cwd, session, via: 'mentioned with $', prompt: lastPrompt, topic, mentionOnly: true });
        }
      }
    }
    if (o.type === 'response_item' && /call/.test(p.type || '')) {
      const argStr = typeof p.arguments === 'string' ? p.arguments : JSON.stringify(p.arguments || p.input || p.action || '');
      for (const m of argStr.matchAll(CODEX_SKILL_PATH)) {
        const name = m[1];
        if (seenThisTurn.has(name)) continue;
        seenThisTurn.add(name);
        events.push({ tool: 'Codex', skill: name, ts: o.timestamp, cwd, session, via: 'auto (Codex opened it)', prompt: lastPrompt, topic });
      }
    }
  }
  return { events, cwds: [...cwds], prompts, mcp, agents: {}, session, mainCwd: [...cwds][0] || '' };
}

// ---------- orchestration with cache ----------
const progress = { phase: 'idle', done: 0, total: 0, startedAt: null };

function listLogFiles() {
  const files = [];
  const walk = (dir, test, depth = 0) => {
    if (depth > 6) return;
    for (const e of listDir(dir)) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, test, depth + 1);
      else if (test(e.name)) files.push(full);
    }
  };
  walk(P('.claude', 'projects'), (n) => n.endsWith('.jsonl'));
  const claude = files.splice(0);
  walk(P('.codex', 'sessions'), (n) => /\.jsonl(\.zst)?$/.test(n));
  walk(P('.codex', 'archived_sessions'), (n) => /\.jsonl(\.zst)?$/.test(n));
  return { claude, codex: files };
}

function loadCache() {
  const c = readJson(CACHE_FILE);
  return c && c.version === CACHE_VERSION ? c : { version: CACHE_VERSION, files: {} };
}
function cachedCwds() {
  const s = new Set();
  for (const v of Object.values(loadCache().files)) (v.cwds || []).forEach((c) => s.add(c));
  return [...s];
}

async function scanUsage() {
  const cache = loadCache();
  const { claude, codex } = listLogFiles();
  const all = [...claude.map((f) => ['claude', f]), ...codex.map((f) => ['codex', f])];
  progress.phase = 'Reading session history'; progress.total = all.length; progress.done = 0; progress.startedAt = Date.now();
  const next = {};
  let i = 0;
  const worker = async () => {
    while (i < all.length) {
      const [kind, f] = all[i++];
      let st; try { st = fs.statSync(f); } catch { progress.done++; continue; }
      const c = cache.files[f];
      if (c && c.mtimeMs === st.mtimeMs && c.size === st.size) next[f] = c;
      else {
        try {
          const r = kind === 'claude' ? await scanClaudeFile(f) : await scanCodexFile(f);
          next[f] = { mtimeMs: st.mtimeMs, size: st.size, tool: kind === 'claude' ? 'Claude Code' : 'Codex', ...r };
        } catch { next[f] = { mtimeMs: st.mtimeMs, size: st.size, events: [], cwds: [], prompts: [], mcp: {}, agents: {} }; }
      }
      progress.done++;
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  try { fs.mkdirSync(CACHE_DIR, { recursive: true }); fs.writeFileSync(CACHE_FILE, JSON.stringify({ version: CACHE_VERSION, files: next })); } catch {}
  return { files: Object.values(next), logFiles: { claude: claude.length, codex: codex.length } };
}

function scanInventory(projectDirs) {
  sizeCache.clear();
  return {
    skills: scanSkills(projectDirs),
    agents: scanAgents(projectDirs),
    mcpConfigs: scanMcpConfigs(projectDirs),
    oldVersions: oldPluginVersions(),
  };
}

module.exports = { redact, scanUsage, scanInventory, cachedCwds, progress, categorize, isDir, HOME, CACHE_DIR };
