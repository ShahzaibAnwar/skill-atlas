// Small text-matching engine shared by the scanner (Node) and the dashboard (browser).
// BM25 ranking with light stemming and a synonym list so "make a ppt" finds the pptx skill.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TextIndex = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const STOP = new Set(('a an and are as at be been but by can could do does for from get got has have he her his how i if in into is it its just me my need no not of on or our out please so some than that the their them then there these they this to too up us use used using via want was we were what when where which while who why will with would you your yours also any all each other only own same such very can\'t cannot don\'t lets let\'s like make made new one two via etc eg e.g ie i.e skill skills user users agent claude codex file files thing things help work task tasks way able ok okay yes yeah hi hello thanks thank sure now here more most much many well good best right sure still even really maybe something anything everything should must may might shall whether always never every whenever another per across within without about after before over under again further once both few same so than too very just don should now'.split(/\s+/)));
  const SYN = [
    ['pptx', 'ppt', 'powerpoint', 'slide', 'slides', 'deck', 'presentation', 'keynote'],
    ['xlsx', 'excel', 'spreadsheet', 'sheet', 'sheets', 'workbook', 'csv'],
    ['docx', 'word', 'msword', 'document'],
    ['pdf', 'pdfs'],
    ['video', 'videos', 'clip', 'reel', 'reels', 'film', 'movie', 'footage', 'mp4', 'youtube', 'short', 'shorts'],
    ['animation', 'animate', 'animated', 'motion', 'gsap'],
    ['website', 'site', 'webpage', 'web', 'homepage', 'landing'],
    ['seo', 'ranking', 'rank', 'serp', 'google', 'search', 'keyword', 'keywords'],
    ['image', 'images', 'picture', 'photo', 'photos', 'logo', 'icon', 'illustration', 'png', 'jpg'],
    ['svg', 'vector', 'vectorize'],
    ['email', 'emails', 'mail', 'newsletter'],
    ['test', 'tests', 'testing', 'qa', 'tdd'],
    ['bug', 'bugs', 'error', 'errors', 'fix', 'debug', 'debugging', 'crash', 'broken', 'failing'],
    ['deploy', 'deployment', 'release', 'ship', 'launch', 'publish'],
    ['chart', 'charts', 'graph', 'graphs', 'plot', 'visualization', 'visualize', 'dashboard', 'kpi'],
    ['avatar', 'presenter', 'spokesperson', 'heygen'],
    ['translate', 'translation', 'dub', 'dubbing', 'language'],
    ['voice', 'voiceover', 'tts', 'narration', 'speech', 'audio'],
    ['caption', 'captions', 'subtitle', 'subtitles', 'transcript', 'transcribe'],
    ['scrape', 'scraping', 'crawl', 'crawler', 'extract'],
    ['design', 'ui', 'ux', 'interface', 'layout', 'styling', 'css', 'tailwind', 'frontend'],
    ['review', 'audit', 'critique', 'check', 'inspect'],
    ['plan', 'planning', 'roadmap', 'spec', 'specification', 'requirements'],
    ['write', 'writing', 'rewrite', 'copy', 'copywriting', 'prose', 'blog', 'article'],
    ['humanize', 'humanizer', 'natural', 'ai-sounding'],
    ['security', 'secure', 'vulnerability', 'vulnerabilities', 'harden', 'hardening'],
    ['api', 'endpoint', 'endpoints', 'rest', 'graphql'],
    ['database', 'sql', 'query', 'queries', 'postgres', 'mysql', 'prisma', 'schema'],
    ['git', 'commit', 'branch', 'merge', 'pr', 'pull'],
    ['figma', 'mockup', 'wireframe', 'prototype'],
    ['browser', 'chrome', 'playwright', 'devtools'],
    ['research', 'investigate', 'lookup', 'find'],
    ['marketing', 'campaign', 'ads', 'advert', 'promo', 'promotion'],
    ['performance', 'speed', 'slow', 'fast', 'optimize', 'optimization'],
    ['mobile', 'ios', 'android', 'app'],
    ['reverse', 'decompile', 'disassemble', 'binary', 'apk'],
  ];
  const stem = (w) => {
    if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
    if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
    if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
    if (w.length > 4 && w.endsWith('es') && !w.endsWith('ses')) return w.slice(0, -2);
    if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
    return w;
  };
  const SYNMAP = new Map();
  for (const group of SYN) { const head = stem(group[0]); for (const w of group) SYNMAP.set(stem(w), head); }

  function tokens(text) {
    const out = [];
    for (const raw of String(text || '').toLowerCase().split(/[^a-z0-9+#]+/)) {
      if (raw.length < 2 || STOP.has(raw) || /^\d+$/.test(raw)) continue;
      out.push(stem(raw));
    }
    return out;
  }
  // canonical term: synonyms collapse onto one head word
  const canon = (t) => SYNMAP.get(t) || t;

  class Index {
    // docs: [{ id, fields: [[text, weight], ...] }]
    constructor(docs) {
      this.docs = docs.map((d) => ({ id: d.id, tf: new Map(), len: 0 }));
      this.df = new Map();
      docs.forEach((d, i) => {
        const doc = this.docs[i];
        for (const [text, weight] of d.fields) {
          for (const t of tokens(text)) {
            const c = canon(t);
            doc.tf.set(c, (doc.tf.get(c) || 0) + weight);
            doc.len += weight;
          }
        }
        for (const t of doc.tf.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
      });
      this.N = this.docs.length || 1;
      this.avg = this.docs.reduce((a, d) => a + d.len, 0) / this.N || 1;
    }
    idf(t) { const n = this.df.get(t) || 0; return Math.log(1 + (this.N - n + 0.5) / (n + 0.5)); }
    // returns [{id, score, terms}] sorted desc
    search(query, { limit = 50, k1 = 1.2, b = 0.75 } = {}) {
      const q = [...new Set(tokens(query).map(canon))].filter((t) => this.df.has(t));
      if (!q.length) return [];
      const res = [];
      for (const d of this.docs) {
        let s = 0; const terms = [];
        for (const t of q) {
          const f = d.tf.get(t); if (!f) continue;
          s += this.idf(t) * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / this.avg));
          terms.push(t);
        }
        if (s > 0) res.push({ id: d.id, score: s, terms });
      }
      return res.sort((a, b2) => b2.score - a.score).slice(0, limit);
    }
    // tf-idf vectors for similarity between docs
    vector(i) {
      const d = this.docs[i]; const v = new Map(); let norm = 0;
      for (const [t, f] of d.tf) { const w = (1 + Math.log(f)) * this.idf(t); v.set(t, w); norm += w * w; }
      norm = Math.sqrt(norm) || 1; for (const [t, w] of v) v.set(t, w / norm);
      return v;
    }
  }
  function cosine(a, b) { let s = 0; const [x, y] = a.size < b.size ? [a, b] : [b, a]; for (const [t, w] of x) { const o = y.get(t); if (o) s += w * o; } return s; }
  // which text of a skill entry is searchable, and how much each part counts
  function fieldsForEntry(e, extra) {
    const f = [
      [String(e.name).replace(/[-_:]+/g, ' '), 3], [e.displayName || '', 2], [e.plugin || '', 1],
      [e.description || '', 1], [(e.whenList || []).join(' '), 1], [(e.outline || []).join(' '), 0.3],
    ];
    if (e.ai) f.push([e.ai.oneLiner || '', 2], [e.ai.example || '', 1]);
    if (extra) f.push([extra, 1.5]);
    return f;
  }
  return { Index, tokens, canon, cosine, stem, fieldsForEntry };
});
