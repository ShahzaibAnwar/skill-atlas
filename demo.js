// Demo mode: realistic but entirely made-up skills, projects and history.
// Run `node server.js --demo` to try Skill Atlas (or take screenshots) without reading any of your files.
'use strict';
const { skillFromText } = require('./scanner');
const { assemble, hashOf } = require('./assemble');

const DAY = 864e5;
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const iso = (daysAgo, hour) => { const d = new Date(Date.now() - daysAgo * DAY); d.setHours(hour ?? 9 + Math.floor(rnd() * 9), Math.floor(rnd() * 60), 0, 0); return d.toISOString(); };
const MB = 1048576;

// [name, tools/places, plugin, description, when[], how[], ai summary [title, oneLiner, example], sizeMB, installedDaysAgo]
const SKILLS = [
  ['docx', ['Claude Code:Account skill'], 'office-kit', 'Create, read and edit Word documents (.docx), including tracked changes, comments, headers and tables. Use when the user asks for a Word document or references a .docx file.', ['A report, letter or contract has to be a Word file', 'You need to edit an existing .docx and keep its formatting'], ['Describe the document you want', 'Attach or name the .docx to change'], ['Word Documents', 'Writes and edits Word files, keeping layout, tables and tracked changes intact.', 'Turn these meeting notes into a formatted Word report.'], 1.4, 210],
  ['xlsx', ['Claude Code:Account skill'], 'office-kit', 'Open, create and fix Excel spreadsheets (.xlsx, .csv): formulas, formatting, charts and cleaning messy data. Use when a spreadsheet is the input or the output.', ['A spreadsheet file is the main input or output', 'You need formulas, charts or cleaned-up columns'], ['Name the file or describe the sheet you need'], ['Excel Spreadsheets', 'Builds and cleans up Excel sheets with working formulas, charts and formatting.', 'Clean up this sales export and add monthly totals.'], 1.1, 210],
  ['pptx', ['Claude Code:Account skill'], 'office-kit', 'Create and edit PowerPoint presentations (.pptx): slides, layouts, speaker notes and templates. Use when the user asks for a deck, slides or a .pptx file.', ['You need a slide deck as a PowerPoint file', 'You want to update an existing .pptx'], ['Describe the deck: audience, number of slides, key points'], ['PowerPoint Slide Decks', 'Makes and edits PowerPoint decks with clean layouts and speaker notes.', 'Make a 10-slide pitch deck for our product launch.'], 1.1, 210],
  ['pdf', ['Claude Code:Account skill'], 'office-kit', 'Read, fill, merge, split and extract text or tables from PDF files. Use when a PDF is involved.', ['Pulling tables or text out of a PDF', 'Filling in or merging PDF forms'], ['Attach or name the PDF and say what you need'], ['PDF Tools', 'Reads, fills, merges and splits PDFs, and pulls out text and tables.', 'Extract the invoice table from this PDF into a spreadsheet.'], 2.3, 210],
  ['video-composer', ['Claude Code:Personal skill', 'Gemini CLI:Skill', 'Antigravity:Skill', 'OpenCode:Skill'], null, 'Make, edit and render videos and motion graphics from HTML: promos, explainers, title cards and captioned clips. Read this first for any request to make or edit a video.', ['Any request to create, edit or render a video', 'Turning a website or script into a promo clip'], ['Describe the video: length, style, what it shows', 'Preview it, then ask for a render'], ['Video Maker', 'Turns a script, website or idea into a rendered promo or explainer video.', 'Make a 30-second launch video for our new app.'], 5.6, 120],
  ['captions', ['Claude Code:Plugin'], 'video-studio', 'Add burned-in or soft captions and subtitles to a video, with word-level timing from a transcript.', ['A video needs subtitles or animated captions'], ['Give the video file and the caption style you want'], ['Video Captions', 'Adds timed subtitles or animated captions to your videos.', 'Add bold animated captions to this product clip.'], 0.4, 120],
  ['media-assets', ['Claude Code:Plugin'], 'video-studio', 'Find or generate music, sound effects, images, icons and voiceovers for a video project and keep track of their licenses.', ['A video needs music, sound effects or a voiceover'], ['Say what mood or asset you need'], ['Video Media Helper', 'Finds or creates music, sound effects, images and voiceovers for your videos.', 'Find calm background music for a 1-minute tutorial.'], 3.2, 120],
  ['seo-audit', ['Claude Code:Plugin'], 'seo-suite', 'Full SEO audit of a website: crawlability, Core Web Vitals, structured data, content quality and AI-search readiness, with a prioritized fix list.', ['Your site ranks poorly or traffic dropped', 'Before launching a new site'], ['Give the URL', 'Review the prioritized fix list'], ['Website SEO Audit', 'Checks a website for search ranking problems and lists what to fix first.', 'Audit my site and tell me why traffic dropped.'], 0.6, 95],
  ['local-seo', ['Claude Code:Plugin'], 'seo-suite', 'Local SEO for businesses with a physical location: Google Business Profile, reviews, map rankings and consistent address listings.', ['A shop or office wants to show up in map searches'], ['Give the business name and city'], ['Local Business Search Check', 'Improves how a local business shows up in map searches and reviews.', 'Why does my cafe not show up on Google Maps?'], 0.3, 95],
  ['schema-markup', ['Claude Code:Plugin'], 'seo-suite', 'Detect, validate and generate Schema.org structured data (JSON-LD) for pages: products, articles, FAQs and local businesses.', ['Adding rich results like stars, FAQs or prices to search listings'], ['Name the page type and URL'], ['Search Rich Results', 'Adds the hidden page labels that give you rich results in search.', 'Add product schema to our shop pages.'], 0.2, 95],
  ['build-dashboard', ['Claude Code:Plugin'], 'data-tools', 'Build an interactive HTML dashboard with KPI cards, charts, filters and tables from a data source. Use when someone wants a dashboard or a visual report of numbers.', ['You need a dashboard, KPI board or visual report', 'Turning a query or CSV into charts people can filter'], ['Describe the metrics and the data source', 'Open the generated page in a browser'], ['Build a Visual Dashboard', 'Creates a shareable web dashboard with charts, filters and key numbers.', 'Build a dashboard of monthly sales by region.'], 0.5, 160],
  ['sql-queries', ['Claude Code:Plugin'], 'data-tools', 'Write correct, fast SQL for Postgres, MySQL, BigQuery and Snowflake, and explain query plans.', ['Writing or optimizing a SQL query'], ['Describe the tables and the question'], ['SQL Query Helper', 'Writes and speeds up SQL queries for most databases.', 'Write a query for top customers by revenue this quarter.'], 0.2, 160],
  ['data-viz', ['Claude Code:Plugin'], 'data-tools', 'Create clear charts and data visualizations in Python (matplotlib, plotly) with accessible colors.', ['Making a chart or plot from data'], ['Give the data and the question the chart should answer'], ['Charts and Plots', 'Makes clear, accessible charts from your data in Python.', 'Plot signups per week as a line chart.'], 0.3, 160],
  ['code-review', ['Claude Code:Personal skill'], null, 'Multi-axis code review: correctness, security, performance and readability. Use before merging any change or when asked to review a diff or pull request.', ['Before merging a change', 'When you want a second pair of eyes on a diff'], ['Ask for a review of the current diff or a PR'], ['Code Review', 'Reviews code changes for bugs, security issues and readability before you merge.', 'Review my changes before I open the PR.'], 0.1, 180],
  ['test-driven-development', ['Claude Code:Personal skill'], null, 'Write a failing test first, then the code to pass it. Use when implementing new behavior or fixing a bug that should never come back.', ['Adding new logic', 'Fixing a bug so it stays fixed'], ['Describe the behavior; the test comes first'], ['Test-First Coding', 'Writes the test first, then the code, so bugs stay fixed.', 'Add discount codes, test first.'], 0.1, 180],
  ['debugging-guide', ['Claude Code:Personal skill'], null, 'Systematic root-cause debugging: reproduce, isolate, fix and prevent. Use when tests fail, builds break or behavior is unexpected.', ['Something broke and you do not know why', 'A test or build is failing'], ['Paste the error and what you expected'], ['Bug Detective', 'Finds the real cause of a bug step by step instead of guessing.', 'The checkout page crashes after login, find out why.'], 0.1, 180],
  ['git-workflow', ['Claude Code:Personal skill'], null, 'Clean git practices: atomic commits, branch naming, rebasing, resolving conflicts and splitting messy changes. Use when committing, branching, merging or pushing.', ['Committing, branching, merging or pushing', 'Untangling a messy working tree'], ['Say what you want to commit or merge'], ['Git Helper', 'Keeps commits, branches and merges clean and easy to follow.', 'Split my changes into clean commits and push.'], 0.1, 180],
  ['ci-cd-pipelines', ['Claude Code:Personal skill'], null, 'Set up and fix CI/CD pipelines: GitHub Actions, build and test steps, deploy jobs and release automation. Use when automating build, test or deploy.', ['Automating build, test or deploy', 'A pipeline is failing'], ['Name the platform and what should run'], ['Build & Deploy Automation', 'Sets up pipelines that test and deploy your code automatically.', 'Set up GitHub Actions to test and deploy on every push.'], 0.1, 180],
  ['security-hardening', ['Claude Code:Personal skill'], null, 'Harden apps against common vulnerabilities: input validation, auth, secrets handling and dependency risks (OWASP Top 10).', ['Before shipping anything that handles user data or logins'], ['Point it at the code or feature to check'], ['Security Check-Up', 'Finds and fixes common security holes before you ship.', 'Check our login and signup flow for security issues.'], 0.1, 180],
  ['api-design', ['Claude Code:Personal skill'], null, 'Design stable REST and GraphQL APIs: resource naming, errors, pagination, versioning and type contracts.', ['Designing endpoints or a public interface'], ['Describe the resources and who calls them'], ['API Design Guide', 'Designs clean, stable APIs with clear errors and versioning.', 'Design the endpoints for our orders service.'], 0.1, 180],
  ['frontend-design', ['Claude Code:Plugin'], 'design-pack', 'Distinctive, intentional visual design for web pages and app screens: typography, color, layout and motion that avoid generic template looks.', ['Building or redesigning a page or screen', 'A UI looks bland or templated'], ['Describe the product, audience and mood'], ['Distinctive Web Design', 'Gives pages and screens a distinctive, intentional look instead of a template feel.', 'Redesign our landing page so it stands out.'], 0.2, 140],
  ['ui-polish', ['Claude Code:Personal skill'], null, 'Polish web UI design: typography, color palette, spacing, layout and motion so pages look intentional rather than generic templates.', ['A page works but looks unfinished or generic'], ['Point it at the page to polish'], ['UI Polish', 'Tidies spacing, type and color so a page looks finished.', 'Polish the settings page, it looks off.'], 0.1, 60],
  ['humanizer', ['Claude Code:Personal skill', 'Claude Code:Plugin'], 'writing-kit', 'Rewrite AI-sounding text so it reads like a person wrote it, without changing the meaning. Use when editing prose for AI tells.', ['A draft sounds robotic or AI-written'], ['Paste the text and say who it is for'], ['Make Writing Sound Human', 'Rewrites stiff, robotic text so it sounds natural and personal.', 'Make this announcement sound less like AI wrote it.'], 0.1, 150],
  ['release-notes', ['Claude Code:Plugin'], 'dev-workflow', 'Generate release notes and a changelog entry from the commits since the last tag.', [], ['Type the command after tagging a release'], ['Release Notes Writer', 'Writes release notes from your recent commits.', 'Write release notes for v2.3.'], 0.02, 130, true],
  ['acme-brand-voice', ['Claude Code:Project skill'], null, 'Acme Store tone of voice for product descriptions, emails and social posts: friendly, short sentences, no jargon.', ['Writing any customer-facing copy for Acme Store'], ['Just ask for the copy; the voice is applied automatically'], ['Acme Brand Voice', 'Keeps all Acme Store copy in the same friendly brand voice.', 'Write a product description for the new backpack.'], 0.01, 45],
  ['imagegen', ['Codex:Built-in skill'], null, 'Generate or edit raster images: illustrations, product mockups, textures and transparent-background assets.', ['You need an image, mockup or illustration'], ['Describe the image and the size'], ['Image Generator', 'Creates or edits images, mockups and illustrations from a description.', 'Make a hero illustration for the travel blog.'], 0.3, 200],
  ['browser-testing', ['Codex:Plugin'], 'web-qa', 'Test web apps in a real browser: click through flows, check console errors, network requests and mobile layouts.', ['Checking a web app actually works in the browser'], ['Give the URL and the flow to test'], ['Browser Testing', 'Clicks through your web app in a real browser and reports what breaks.', 'Test the signup flow on mobile size.'], 1.8, 200],
  ['ios-app-builder', ['Codex:Plugin'], 'mobile-kit', 'Build, run and debug iOS apps with SwiftUI, including simulators and performance traces.', ['Working on an iPhone or iPad app'], ['Describe the screen or bug'], ['iPhone App Builder', 'Builds and debugs iPhone apps in SwiftUI.', 'Add a settings screen to the iOS app.'], 2.2, 200],
  ['mcp-server-builder', ['Shared (.agents):Skill'], null, 'Guide for building MCP servers that give AI assistants well-designed tools for external services.', ['Connecting an AI assistant to an API or database'], ['Describe the service and the tools to expose'], ['MCP Server Builder', 'Helps you build connectors that give AI assistants new tools.', 'Build an MCP server for our internal ticket system.'], 0.2, 100],
];

const PROJECTS = { store: '/home/demo/projects/acme-store', blog: '/home/demo/projects/travel-blog', api: '/home/demo/projects/inventory-api', app: '/home/demo/projects/fitness-app', site: '/home/demo/projects/marketing-site' };

// [skillInvokeName, tool, daysAgo, project, prompt, via]
const USES = [
  ['office-kit:docx', 'Claude Code', 2, 'store', 'Turn the supplier meeting notes into a Word report with a summary table'],
  ['office-kit:docx', 'Claude Code', 9, 'api', 'Write the API handover document for the new team as a docx'],
  ['office-kit:docx', 'Claude Code', 15, 'store', 'Update the returns policy document with the new 30-day rule'],
  ['office-kit:docx', 'Claude Code', 33, 'site', 'Draft the agency proposal as a Word document'],
  ['office-kit:docx', 'Claude Code', 61, 'store', 'Make a printable staff handbook from these notes'],
  ['office-kit:docx', 'Claude Code', 88, 'blog', 'Convert the travel guide draft into a formatted Word file'],
  ['office-kit:xlsx', 'Claude Code', 4, 'api', 'Clean up this stock export and add reorder alerts'],
  ['office-kit:xlsx', 'Claude Code', 19, 'store', 'Build a monthly sales sheet with totals per category'],
  ['office-kit:xlsx', 'Claude Code', 47, 'store', 'Fix the broken VLOOKUP formulas in the pricing sheet'],
  ['office-kit:pptx', 'Claude Code', 1, 'store', 'Make a 10-slide quarterly review deck for the board'],
  ['office-kit:pptx', 'Claude Code', 6, 'site', 'Update the pitch deck with the new pricing slide'],
  ['office-kit:pptx', 'Claude Code', 27, 'app', 'Create launch slides for the fitness app beta'],
  ['office-kit:pptx', 'Claude Code', 54, 'store', 'Turn the sales report into presentation slides'],
  ['office-kit:pdf', 'Claude Code', 12, 'api', 'Extract the invoice line items from these supplier PDFs'],
  ['video-composer', 'Claude Code', 3, 'app', 'Make a 30-second launch video for the fitness app'],
  ['video-composer', 'Claude Code', 11, 'site', 'Turn our homepage into a short promo clip'],
  ['video-composer', 'Claude Code', 40, 'blog', 'Make a 1-minute travel montage from these photos'],
  ['video-studio:captions', 'Claude Code', 11, 'site', 'Add animated captions to the promo clip'],
  ['design-pack:frontend-design', 'Claude Code', 1, 'site', 'Redesign the landing page hero so it stands out'],
  ['design-pack:frontend-design', 'Claude Code', 8, 'store', 'Give the product page a more premium look'],
  ['design-pack:frontend-design', 'Claude Code', 22, 'blog', 'Design a magazine-style article layout'],
  ['design-pack:frontend-design', 'Claude Code', 36, 'app', 'Design the onboarding screens'],
  ['design-pack:frontend-design', 'Claude Code', 70, 'site', 'Make the pricing page less generic'],
  ['code-review', 'Claude Code', 0.3, 'api', 'Review my changes to the stock sync before I merge'],
  ['code-review', 'Claude Code', 5, 'store', 'Review the checkout refactor PR'],
  ['code-review', 'Claude Code', 14, 'app', 'Look over the workout timer changes'],
  ['code-review', 'Claude Code', 30, 'api', 'Review the new auth middleware'],
  ['debugging-guide', 'Claude Code', 2, 'store', 'Checkout crashes after login, find out why'],
  ['debugging-guide', 'Claude Code', 10, 'api', 'The nightly import job fails with a timeout'],
  ['debugging-guide', 'Claude Code', 25, 'app', 'Workout history is empty on Android only'],
  ['debugging-guide', 'Claude Code', 52, 'api', 'Tests pass locally but fail in CI'],
  ['humanizer', 'Claude Code', 7, 'blog', 'Make this Lisbon guide intro sound less like AI wrote it'],
  ['humanizer', 'Claude Code', 29, 'site', 'Rewrite the about page so it sounds human'],
  ['seo-suite:seo-audit', 'Claude Code', 9, 'blog', 'Audit the travel blog, traffic dropped last month'],
  ['seo-suite:seo-audit', 'Claude Code', 44, 'site', 'Check the marketing site before launch'],
  ['data-tools:data-viz', 'Claude Code', 96, 'api', 'Plot stock levels per warehouse'],
  ['test-driven-development', 'Claude Code', 84, 'store', 'Add discount codes, test first'],
  ['ui-polish', 'Claude Code', 18, 'app', 'Polish the settings screen spacing'],
  ['dev-workflow:release-notes', 'Claude Code', 13, 'api', 'v2.3', 'slash command'],
  ['dev-workflow:release-notes', 'Claude Code', 41, 'api', 'v2.2', 'slash command'],
  ['skill-creator', 'Claude Code', 20, 'site', 'Turn our brand guidelines into a skill'],
  ['imagegen', 'Codex', 6, 'blog', 'Make a hero illustration for the Lisbon article'],
  ['imagegen', 'Codex', 38, 'site', 'Generate three mockups of the app on a phone'],
  ['browser-testing', 'Codex', 16, 'app', 'Test the signup flow at mobile size'],
];

// Requests you made that never used a skill (they feed the Discover tab)
const OTHER_PROMPTS = [
  ['api', 3, 'Build a dashboard with KPI cards and charts for stock levels per warehouse'],
  ['store', 12, 'We need a sales dashboard with charts and filters by region for the team'],
  ['api', 23, 'Add a chart widget to the admin dashboard showing low-stock items'],
  ['store', 35, 'Build an executive dashboard of monthly revenue with KPI cards'],
  ['site', 58, 'Make a dashboard that shows signups and conversion charts'],
  ['api', 2, 'Commit these changes and push to a new git branch'],
  ['store', 8, 'Merge the feature branch, fix the git conflict, then push'],
  ['app', 17, 'Squash my last commits and push the branch to git'],
  ['api', 31, 'Undo the last git commit but keep the changes'],
  ['api', 5, 'Set up a GitHub Actions pipeline to build and deploy on every push'],
  ['store', 20, 'The deploy pipeline fails at the build step, fix the CI'],
  ['app', 42, 'Automate deploy to staging with a CI pipeline'],
  ['blog', 4, 'Why is the travel blog slow to load on phones?'],
  ['site', 26, 'Add a contact form that emails the sales team'],
  ['store', 49, 'Translate the product pages into Spanish'],
];

function skillMd([name, , , desc, when, how]) {
  return `---\nname: ${name}\ndescription: ${desc}\n---\n# ${name}\n\n${desc}\n\n## When to use\n${when.map((w) => `- ${w}`).join('\n')}\n\n## How to use\n${how.map((h, i) => `${i + 1}. ${h}`).join('\n')}\n\n## Notes\nThis is sample content for Skill Atlas demo mode.\n`;
}

function buildDemo() {
  seed = 7;
  const skills = []; const files = {}; const summaries = {};
  const PLACE = { 'Claude Code': '~/.claude/skills', Codex: '~/.codex', 'Gemini CLI': '~/.gemini/skills', Antigravity: '~/.gemini/antigravity/skills', OpenCode: '~/.config/opencode/skills', 'Shared (.agents)': '~/.agents/skills' };
  for (const s of SKILLS) {
    const [name, places, plugin, desc, , , ai, sizeMB, installedDays, isCommand] = s;
    const text = skillMd(s);
    for (const place of places) {
      const [tool, kind] = place.split(':');
      const pl = kind === 'Plugin' || kind === 'Account skill' ? plugin : null;
      const file = kind === 'Project skill' ? `${PROJECTS.store}/.claude/skills/${name}/SKILL.md`
        : kind === 'Plugin' && tool === 'Claude Code' ? `~/.claude/plugins/cache/community/${plugin}/1.4.0/${isCommand ? 'commands/' + name + '.md' : 'skills/' + name + '/SKILL.md'}`
        : kind === 'Account skill' ? `~/.claude/skills/synced/${name}/SKILL.md`
        : tool === 'Codex' ? `~/.codex/${kind === 'Plugin' ? `plugins/cache/curated/${plugin}/2.0.1/skills` : 'skills/.system'}/${name}/SKILL.md`
        : `${PLACE[tool]}/${name}/SKILL.md`;
      const label = kind === 'Plugin' ? `Plugin "${plugin}" from community-plugins` : kind === 'Account skill' ? 'Synced from your claude.ai account' : kind === 'Project skill' ? `Project: ${PROJECTS.store}` : `Installed in ${PLACE[tool]}`;
      const sk = skillFromText(text, { file, tool, kind, plugin: pl, isCommand: !!isCommand, sourceLabel: label, modified: iso(installedDays - 5), installedAt: iso(installedDays), sizeBytes: Math.round(sizeMB * MB) });
      skills.push(sk);
      files[sk.id] = text;
    }
    summaries[name] = { hash: hashOf({ name, description: desc }), title: ai[0], oneLiner: ai[1], example: ai[2] };
  }

  // session files
  const byKey = {};
  const fileFor = (proj, days, tool = 'Claude Code') => {
    const k = `${tool}|${proj}|${Math.round(days)}`;
    if (!byKey[k]) byKey[k] = { tool, events: [], cwds: [PROJECTS[proj]], prompts: [], mcp: {}, agents: {}, session: 'demo-' + Object.keys(byKey).length, mainCwd: PROJECTS[proj] };
    return byKey[k];
  };
  for (const [skill, tool, days, proj, prompt, via] of USES) {
    const f = fileFor(proj, days, tool); const ts = iso(days);
    f.prompts.push({ ts, cwd: PROJECTS[proj], text: prompt });
    f.events.push({ tool, skill, ts, cwd: PROJECTS[proj], session: f.session, via: via || (tool === 'Codex' ? 'auto (Codex opened it)' : 'auto (Claude chose it)'), prompt, topic: prompt });
  }
  for (const [proj, days, text] of OTHER_PROMPTS) fileFor(proj, days).prompts.push({ ts: iso(days), cwd: PROJECTS[proj], text });

  // MCP + sub-agent usage
  const bump = (f, map, key, n, tools, ts, prompt, task) => {
    const m = f[map][key] || (f[map][key] = { count: 0, first: ts, last: ts, tools: {}, recent: [] });
    m.count += n; if (ts < m.first) m.first = ts; if (ts > m.last) m.last = ts;
    for (const [t, c] of Object.entries(tools || {})) m.tools[t] = (m.tools[t] || 0) + c;
    m.recent.push({ ts, cwd: f.mainCwd, session: f.session, prompt, task });
  };
  for (const f of Object.values(byKey)) {
    if (f.tool !== 'Claude Code') continue;
    const ts = f.events[0] ? f.events[0].ts : f.prompts[0].ts; const p = f.prompts[0].text;
    if (/store|app|site/.test(f.mainCwd) && rnd() > 0.3) bump(f, 'mcp', 'plugin_web-testing_playwright', 6 + Math.floor(rnd() * 30), { browser_navigate: 6, browser_click: 9, browser_take_screenshot: 5, browser_snapshot: 4 }, ts, p);
    if (rnd() > 0.45) bump(f, 'mcp', 'github', 2 + Math.floor(rnd() * 8), { create_pull_request: 1, list_issues: 2, get_file_contents: 3 }, ts, p);
    if (/api|store/.test(f.mainCwd) && rnd() > 0.4) bump(f, 'mcp', 'postgres', 3 + Math.floor(rnd() * 12), { query: 8, list_tables: 2, describe_table: 3 }, ts, p);
    if (rnd() > 0.5) bump(f, 'mcp', 'c0ffee00-1234-4b1d-9a7e-00000000beef', 2 + Math.floor(rnd() * 10), { websearch_query: 5, websearch_fetch: 4 }, ts, p);
    bump(f, 'agents', 'general-purpose', 1 + Math.floor(rnd() * 3), null, ts, p, 'Research and summarize options');
    if (rnd() > 0.5) bump(f, 'agents', 'Explore', 1 + Math.floor(rnd() * 2), null, ts, p, 'Find where the setting is defined');
    if (/api|store/.test(f.mainCwd) && rnd() > 0.6) bump(f, 'agents', 'dev-workflow:code-reviewer', 1, null, ts, p, 'Review the diff for bugs');
  }

  const inv = {
    skills,
    agents: [
      { id: 'agent::dev-workflow:code-reviewer', name: 'code-reviewer', invokeName: 'dev-workflow:code-reviewer', plugin: 'dev-workflow', source: 'Plugin "dev-workflow"', description: 'Reviews a diff for bugs, security issues and missed edge cases, reporting only high-confidence problems.', model: 'sonnet', tools: '', file: null },
      { id: 'agent::seo-suite:seo-crawler', name: 'seo-crawler', invokeName: 'seo-suite:seo-crawler', plugin: 'seo-suite', source: 'Plugin "seo-suite"', description: 'Crawls a site and collects technical SEO signals for the audit.', model: '', tools: '', file: null },
      { id: 'agent::data-tools:analyst', name: 'analyst', invokeName: 'data-tools:analyst', plugin: 'data-tools', source: 'Plugin "data-tools"', description: 'Answers data questions by exploring tables and writing queries.', model: '', tools: '', file: null },
    ],
    mcpConfigs: [
      { key: 'github', name: 'github', tool: 'Claude Code', from: 'Your Claude settings (~/.claude.json)', type: 'http', target: 'api.githubcopilot.com' },
      { key: 'postgres', name: 'postgres', tool: 'Claude Code', from: `Project: ${PROJECTS.api}`, type: 'stdio', target: 'npx @modelcontextprotocol/server-postgres' },
      { key: 'plugin_web-testing_playwright', name: 'playwright', tool: 'Claude Code', from: 'Plugin "web-testing"', type: 'stdio', target: 'npx @playwright/mcp@latest' },
      { key: 'figma', name: 'figma', tool: 'Claude Code', from: 'Your Claude settings (~/.claude.json)', type: 'http', target: 'mcp.figma.com' },
      { key: 'filesystem', name: 'filesystem', tool: 'Codex', from: 'Codex settings (~/.codex/config.toml)', type: 'stdio', target: 'npx @modelcontextprotocol/server-filesystem' },
    ],
    oldVersions: [
      ['Claude Code', 'video-studio', '1.2.0', 'Older version (a newer one is installed)', 6.8, 70],
      ['Claude Code', 'video-studio', '1.3.1', 'Older version (a newer one is installed)', 7.1, 40],
      ['Claude Code', 'web-testing', '0.9.4', 'Older version (a newer one is installed)', 0.4, 55],
      ['Claude Code', 'old-snippets', '2.0.0', 'Plugin no longer installed', 1.2, 150],
      ['Codex', 'mobile-kit', '1.8.0', 'Older version (a newer one is installed)', 2.0, 90],
    ].map(([tool, plugin, version, reason, mb, days]) => {
      const p = tool === 'Codex' ? `~/.codex/plugins/cache/curated/${plugin}/${version}` : `~/.claude/plugins/cache/community/${plugin}/${version}`;
      return { id: 'old::' + p, tool, market: tool === 'Codex' ? 'curated' : 'community', plugin, version, path: p, mtime: iso(days), reason, sizeBytes: Math.round(mb * MB) };
    }),
  };

  const usage = { files: Object.values(byKey), logFiles: { claude: Object.values(byKey).filter((f) => f.tool === 'Claude Code').length, codex: Object.values(byKey).filter((f) => f.tool === 'Codex').length } };
  const result = assemble({ usage, inv, summaries, scanMs: 5 });
  result.data.demo = true;
  return { ...result, files };
}

module.exports = { buildDemo, demoUserData: () => ({ favorites: ['pptx', 'code-review'], notes: { pptx: 'Use this for the quarterly board decks' } }) };
