# Skill Atlas

**See every AI skill you've installed, what it's for, how to use it, and when your AI last used it, all in one local dashboard.**

Works with **Claude Code**, **Codex**, **Gemini CLI**, **Antigravity**, **OpenCode** and shared `~/.agents` skills. Also tracks your **MCP servers** and **sub-agents**. Runs entirely on your own computer.

![License: MIT](https://img.shields.io/badge/license-MIT-green) ![Node](https://img.shields.io/badge/node-%3E%3D18-blue) ![No dependencies](https://img.shields.io/badge/dependencies-none-brightgreen) ![Local only](https://img.shields.io/badge/data-stays%20on%20your%20machine-orange)

Created by **[Muhammad Shahzaib Anwar](https://github.com/ShahzaibAnwar)**.

---

## Why Skill Atlas?

AI coding assistants now support *skills*: packs of instructions the AI loads when your request matches. They're easy to install, from plugins, marketplaces, GitHub repos and claude.ai, and just as easy to forget.

After a few weeks you end up with:

- **Hundreds of skills you can't remember installing.** Which ones do I actually have? Which tool are they in?
- **Descriptions written for the AI, not for you.** `anthropic-skills:pptx` or `hyperframes-registry` doesn't tell you much at a glance.
- **No idea what the AI is actually using.** Skills get picked silently, so you never see which ones help and which ones just sit there.
- **The same skill installed in five places**, and several skills competing for the same kind of request.
- **Leftover plugin versions** quietly taking up disk space.

Skill Atlas reads the skill files and the local session history your AI tools already keep, and turns them into a dashboard you can browse, search and print.

## What it solves

| Problem | What Skill Atlas does |
|---|---|
| "I forgot which skills I have" | Lists every skill across all your AI tools, merges duplicates, and groups them by category |
| "What does this skill even do?" | Shows a plain-English name, one-line summary and example request (optionally written by Claude), plus when to use it and when not to |
| "How do I call it?" | Shows the exact command for each tool (`/plugin:skill` in Claude Code, `$skill` in Codex) with a Copy button |
| "Is the AI using it?" | Shows the last time it was used, how many times, in which project, and **what you asked for** each time |
| "Which skill fits my task?" | Type a task in plain words ("turn my website into a video") and get the best-matching skills, ranked |
| "I installed it and never used it" | **Discover** compares your past requests with skills you never use, and suggests ones that fit what you often ask for |
| "These two skills do the same thing" | Flags overlapping skills so you can keep the one you like |
| "My disk is full of old plugin copies" | **Cleanup** lists leftover plugin versions, duplicate installs and long-unused skills, with sizes (it never deletes anything itself) |
| "What MCP servers do I have, and do I use them?" | Lists MCP servers and sub-agents with call counts, top tools and recent uses |
| "I want a reference card" | Prints a one-page **cheat sheet** of your skills, or saves it as a PDF |

## Features

- **Skills tab:** every skill, with duplicates merged into one card. Cards or a sortable list view, filters by AI tool, category and status (used, last 30 days, never used, starred), weekly chart and a calendar heatmap of usage, plus most-used and recently-used panels.
- **Finder:** search in plain words. A small built-in ranking engine (BM25 with synonyms, so "ppt" finds PowerPoint and "excel" finds spreadsheets) matches your words against each skill's purpose.
- **Skill details:** a plain-English summary, what it does, when and when not to use it, how to run it, your own notes, full usage history ("when and what for"), similar skills, the skill's sections and where it's installed (with Open folder and Read the skill file).
- **Discover tab:** skills that fit your past requests but go unused, and skills that overlap.
- **Projects tab:** every folder you've worked in, with the skills, MCP servers and sub-agents used there.
- **Cleanup tab:** leftover plugin versions, multiple installs and stale skills, with disk sizes.
- **MCP & Agents tab:** MCP servers (configured and used) and sub-agents, with usage stats.
- **Cheat sheet tab:** a printable list of the skills you use and star.
- **Stars and notes:** star favorites and write reminders such as "use this for CEO decks". Notes are searchable.
- **Plain-English summaries:** one click asks your local Claude Code CLI to write a friendly name, a one-line summary and an example request for every skill.
- **Fast:** opens instantly from the last scan and refreshes in the background. Later scans only reread changed files.
- Light and dark mode, works at phone width, keyboard shortcuts.

## Quick start

**Requirements:** [Node.js](https://nodejs.org) 18 or newer (22.15+ recommended, which is needed to read Codex's compressed session logs). There's nothing to `npm install`, because Skill Atlas has no dependencies.

```bash
git clone https://github.com/ShahzaibAnwar/skill-atlas.git
cd skill-atlas
node server.js
```

Then open **http://localhost:4747**.

Or use the launcher, which starts the server and opens your browser:

- **Windows:** double-click `start.bat` (tip: right-click it, choose *Send to → Desktop (create shortcut)*)
- **macOS / Linux:** `sh start.sh`

The first scan reads all your local AI history and can take a minute if you have a lot. After that it opens instantly.

## How to use it

1. **Find a skill for a task:** type what you want to do in the search box, e.g. *"make a PowerPoint deck"* or *"review my code for bugs"*. The best match is highlighted with its command; click **Copy** and paste it into your AI tool.
2. **Learn what a skill does:** click any card. The detail panel explains it in plain words and shows real past requests where the AI used it.
3. **Clear out the clutter:** open **Cleanup** to see old plugin versions and skills you never use. Click **Open folder**, look, and remove things yourself, or uninstall plugins with `/plugin` in Claude Code.
4. **Rediscover what you forgot:** open **Discover** to see installed skills that match things you often ask for.
5. **Keep a reference:** star the skills you care about, then open **Cheat sheet** and click **Print or save as PDF**.
6. **Make descriptions readable (optional):** click **Write summaries** on the Skills tab (see below).

### Keyboard shortcuts

| Key | Action |
|---|---|
| `/` | Search |
| `1` – `6` | Switch tabs |
| `V` | Cards / list view |
| `←` `→` or `J` `K` | Previous / next skill in the detail panel |
| `F` | Star the open skill |
| `N` | Write a note on the open skill |
| `Esc` | Close |
| `?` | Show shortcuts |

### Plain-English summaries (optional)

**Write summaries** runs your locally installed [Claude Code](https://claude.com/claude-code) CLI (`claude -p`, Haiku model) in small batches. It writes a friendly title, a one-line summary and an example request for each skill. This uses a small amount of your Claude plan once (about one request per 20 skills), and results are cached in `.cache/ai-summaries.json`. Only skills that are new or changed are sent again.

Claude Code must be signed in: run `claude auth login` (or `claude`, then `/login`). To use a different model, set `SKILL_ATLAS_MODEL`, for example `SKILL_ATLAS_MODEL=claude-sonnet-5-5`.

## What it reads

| Tool | Skills | Usage history |
|---|---|---|
| Claude Code | `~/.claude/skills`, installed plugins, skills and plugins synced from claude.ai, `.claude/skills` in your projects | `~/.claude/projects/**/*.jsonl`: `Skill` calls, `/slash` commands, MCP tool calls, sub-agent runs |
| Codex | `~/.codex/skills`, `~/.codex/plugins/cache` | `~/.codex/sessions`: skill files opened, `$skill` mentions, MCP calls |
| Gemini CLI | `~/.gemini/skills` | not available (no readable log) |
| Antigravity | `~/.gemini/antigravity/skills` | not available |
| OpenCode | `~/.config/opencode/skills` | not available |
| Shared agents | `~/.agents/skills` | not available |

MCP servers come from `~/.claude.json`, plugin and project `.mcp.json` files, `~/.codex/config.toml` and Gemini/Antigravity settings. Sub-agents come from `~/.claude/agents`, plugin `agents/` folders and project `.claude/agents`.

## Privacy and security

Skill Atlas was built to be safe to run on a work machine.

- **Nothing leaves your computer.** There is no telemetry and no external requests. The only exception is the optional *Write summaries* button, which sends skill names and descriptions (never your history) to Claude through your own Claude Code CLI.
- **Local only.** The server listens on `127.0.0.1` and rejects requests from other websites (Host and Origin checks), so a web page you visit can't read your data.
- **Secrets are masked.** Passwords, tokens, API keys, `Bearer` headers and credentials in URLs (e.g. `postgres://user:pass@…`) are replaced with `••••` before your past requests are stored or shown.
- **MCP settings are shown without** environment variables, headers or full command arguments.
- **Read-only.** It never edits, moves or deletes your skills. Cleanup only opens folders.
- **Your data stays out of git.** Scan results live in `.cache/` and your stars and notes in `user-data.json`; both are in `.gitignore`. Delete them anytime.

## Configuration

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `4747` | Port for the local server |
| `SKILL_ATLAS_MODEL` | `claude-haiku-5-5` | Model used by *Write summaries* |

## Troubleshooting

- **"Claude Code is not signed in"** when writing summaries: run `claude auth login`, then try again. Being signed in to the Claude desktop app is not enough, because the CLI has its own sign-in.
- **"Doesn't recognize the model …"**: an `ANTHROPIC_DEFAULT_*_MODEL` environment variable is redirecting model names. Skill Atlas already ignores these, but you can set `SKILL_ATLAS_MODEL` explicitly.
- **No Codex usage shows up:** update to Node 22.15 or newer, which is needed to read compressed `.jsonl.zst` session logs.
- **Port already in use:** another copy is probably running. Open http://localhost:4747, or set `PORT`.
- **Wrong or missing data:** click **Rescan**, or delete the `.cache` folder to start fresh.

## How it works

```
server.js       Local web server (127.0.0.1), saved snapshot, background rescans
scanner.js      Finds skills, MCP servers, sub-agents and plugin versions; reads session logs (cached per file)
assemble.js     Merges duplicates, finds overlaps and suggestions, builds project, MCP and cleanup views
summarize.js    Optional plain-English summaries via the Claude Code CLI
public/
  index.html    Page shell
  app.js        Dashboard (vanilla JS, no framework, no build step)
  app.css       Styles (light and dark)
  textindex.js  Tiny BM25 search engine shared by the server and the browser
```

No dependencies and no build step: just Node's standard library and plain HTML, CSS and JS.

## Contributing

Issues and pull requests are welcome, especially:

- Support for more AI tools (Cursor, Windsurf, Cline, Continue…) and their usage logs
- Better skill categories and synonyms for the finder
- Translations

Please keep it dependency-free and local-only.

## Author

**Muhammad Shahzaib Anwar**: [github.com/ShahzaibAnwar](https://github.com/ShahzaibAnwar)

If Skill Atlas helps you, a ⭐ on the repo is appreciated.

## License

[MIT](LICENSE) © 2026 Muhammad Shahzaib Anwar
