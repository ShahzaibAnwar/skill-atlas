#!/usr/bin/env node
// Skill Atlas: local web server. Run `node server.js`, then open http://localhost:4747
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { scanUsage, scanInventory, cachedCwds, progress, CACHE_DIR } = require('./scanner');
const { assemble, applySummaries } = require('./assemble');
const summarize = require('./summarize');

// Demo mode: made-up sample data, reads none of your files (good for trying it out or screenshots)
const DEMO = process.argv.includes('--demo') || process.env.SKILL_ATLAS_DEMO === '1';
const PORT = Number(process.env.PORT) || (DEMO ? 4748 : 4747);
let demoFiles = {}; let demoUser = null;
const HOST = '127.0.0.1'; // only reachable from this computer
const SNAPSHOT = path.join(CACHE_DIR, 'last-data.json');
const USER_FILE = path.join(__dirname, 'user-data.json'); // your favorites + notes
const PUBLIC = path.join(__dirname, 'public');
const STATIC = { '/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js', '/app.css': 'app.css', '/textindex.js': 'textindex.js' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

let data = null; let paths = {}; let scanning = null; let lastError = null;

function setResult(r) { data = r.data; paths = r.paths; }
function saveSnapshot() { try { fs.mkdirSync(CACHE_DIR, { recursive: true }); fs.writeFileSync(SNAPSHOT, JSON.stringify({ data, paths })); } catch {} }
function loadSnapshot() {
  try { const s = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')); if (s && s.data && s.data.entries) { data = s.data; paths = s.paths || {}; data.fromSnapshot = true; } } catch {}
}

function loadDemo() {
  const d = require('./demo');
  const r = d.buildDemo(); demoFiles = r.files; setResult(r);
  if (!demoUser) demoUser = d.demoUserData();
}

function quickInventory() {
  if (DEMO) return loadDemo();
  // Shown while the first full scan runs: skills only, no usage yet.
  const inv = scanInventory(cachedCwds());
  setResult(assemble({ usage: { files: [] }, inv, summaries: summarize.loadSummaries(), partial: true }));
}

function scan() {
  if (DEMO) { loadDemo(); return Promise.resolve(); }
  if (!scanning) {
    scanning = (async () => {
      const t0 = Date.now();
      const usage = await scanUsage();
      progress.phase = 'Analysing';
      const cwds = [...new Set(usage.files.flatMap((f) => f.cwds || []))];
      const inv = scanInventory(cwds);
      setResult(assemble({ usage, inv, summaries: summarize.loadSummaries(), scanMs: Date.now() - t0 }));
      saveSnapshot();
      lastError = null;
    })().catch((e) => { lastError = String((e && e.stack) || e); console.error(e); })
      .finally(() => { scanning = null; progress.phase = 'idle'; });
  }
  return scanning;
}

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req, limit = 1e6) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
function loadUser() { try { const u = JSON.parse(fs.readFileSync(USER_FILE, 'utf8')); return { favorites: Array.isArray(u.favorites) ? u.favorites : [], notes: u.notes && typeof u.notes === 'object' ? u.notes : {} }; } catch { return { favorites: [], notes: {} }; } }

const status = () => ({ scanning: !!scanning, progress: { ...progress }, summary: { ...summarize.job }, generatedAt: data && data.generatedAt, partial: !!(data && data.partial), error: lastError });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  // Block requests coming from other websites (DNS-rebinding / cross-site calls).
  const host = String(req.headers.host || '').split(':')[0];
  const origin = req.headers.origin;
  if (!['localhost', '127.0.0.1'].includes(host) || (origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))) return send(res, 403, { error: 'forbidden' });
  try {
    if (req.method === 'GET' && STATIC[url.pathname]) {
      const f = path.join(PUBLIC, STATIC[url.pathname]);
      return send(res, 200, fs.readFileSync(f), TYPES[path.extname(f)]);
    }
    if (url.pathname === '/api/data') {
      if (url.searchParams.get('refresh') === '1') scan();
      if (!data) quickInventory();
      return send(res, 200, { ...data, status: status() });
    }
    if (url.pathname === '/api/status') return send(res, 200, status());
    if (url.pathname === '/api/skill-file') {
      if (DEMO) { const c = demoFiles[url.searchParams.get('id')]; return c ? send(res, 200, { file: 'demo', content: c }) : send(res, 404, { error: 'not found' }); }
      const p = paths[url.searchParams.get('id')];
      if (!p || !p.file || !/\.md$/i.test(p.file)) return send(res, 404, { error: 'not found' });
      return send(res, 200, { file: p.file, content: fs.readFileSync(p.file, 'utf8') });
    }
    if (url.pathname === '/api/open-folder' && req.method === 'POST') {
      if (DEMO) return send(res, 200, { ok: false, demo: true });
      const p = paths[url.searchParams.get('id')];
      if (!p || !p.dir || !fs.existsSync(p.dir)) return send(res, 404, { error: 'not found' });
      const opener = process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'open' : 'xdg-open';
      execFile(opener, [p.dir], () => {});
      return send(res, 200, { ok: true });
    }
    if (url.pathname === '/api/user-data') {
      if (req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        const clean = {
          favorites: [...new Set((Array.isArray(body.favorites) ? body.favorites : []).filter((x) => typeof x === 'string').map((x) => x.slice(0, 300)))].slice(0, 2000),
          notes: Object.fromEntries(Object.entries(body.notes || {}).filter(([k, v]) => typeof v === 'string' && v.trim()).map(([k, v]) => [String(k).slice(0, 300), v.slice(0, 5000)]).slice(0, 2000)),
        };
        if (DEMO) demoUser = clean; else fs.writeFileSync(USER_FILE, JSON.stringify(clean, null, 1));
        return send(res, 200, clean);
      }
      return send(res, 200, DEMO ? demoUser : loadUser());
    }
    if (url.pathname === '/api/summarize' && req.method === 'POST') {
      if (!data) return send(res, 409, { error: 'not ready' });
      if (DEMO) return send(res, 200, status());
      summarize.run(data.entries, {
        all: url.searchParams.get('all') === '1',
        onBatch: (store) => { if (data) { applySummaries(data.entries, store); saveSnapshot(); } },
      });
      return send(res, 200, status());
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: String(e.message || e) });
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.log(`\n  Skill Atlas is already running → http://localhost:${PORT}\n`);
  else console.error(e);
  process.exit(e.code === 'EADDRINUSE' ? 0 : 1);
});
server.listen(PORT, HOST, () => {
  console.log(`\n  Skill Atlas${DEMO ? ' (DEMO, sample data)' : ''} is running →  http://localhost:${PORT}\n`);
  if (DEMO) return loadDemo();
  loadSnapshot();
  scan();
});
