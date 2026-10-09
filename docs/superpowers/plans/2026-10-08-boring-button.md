# Boring Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static GitHub Pages anti-scroll app and a Manifest V3 popup that serve short offline microtasks with local-only customization and statistics.

**Architecture:** One dependency-free web app owns rendering, task selection, localStorage persistence, import/export, and accessible interactions. The extension contains the same app files plus a minimal MV3 manifest and popup entry point, with no host permissions or network calls.

**Tech Stack:** HTML, CSS, vanilla JavaScript, JSON, Chrome Manifest V3.

---

### Task 1: Data and shared app shell

**Files:**
- Create: `tasks.json`
- Create: `index.html`
- Create: `styles.css`
- Create: `app.js`

- [ ] Add 40 local tasks across movement, attention, order, observation, and mini-game categories with 10–120 second durations.
- [ ] Build semantic page structure with one primary action, task area, result actions, stats, and a settings drawer.
- [ ] Add CSS variables, Literata/IBM Plex Mono stacks, visible focus/pressed states, responsive layout, and reduced-motion media query.
- [ ] Implement task loading from embedded fallback data, random selection, timer, completion/skip/next actions, localStorage persistence, custom-task CRUD, JSON/CSV import/export, and polite status/error announcements.

### Task 2: MV3 extension wrapper

**Files:**
- Create: `extension/manifest.json`
- Create: `extension/popup.html`
- Create: `extension/popup.js`
- Create: `extension/styles.css`
- Create: `extension/tasks.json`

- [ ] Copy the shared app behavior and data into the extension folder, adapting paths to popup-local assets.
- [ ] Configure MV3 manifest with `action.default_popup`, icons omitted for MVP, and zero host permissions.
- [ ] Verify popup opens offline and persists the same local-only state within the extension origin.

### Task 3: Documentation and fallback deployment

**Files:**
- Modify: `README.md`
- Create: `extension/README.md`

- [ ] Document GitHub Pages deployment, unpacked extension install, permissions, storage model, import/export formats, keyboard controls, and privacy promise.
- [ ] Include a no-build local preview command and a manual QA checklist for desktop/mobile, keyboard, reduced motion, empty state, and invalid imports.

### Task 4: Verification

**Files:**
- No new files.

- [ ] Run a static HTTP server and inspect the page in a browser at desktop and narrow widths.
- [ ] Exercise primary flow, import/export, custom task creation, keyboard focus, reduced motion, and empty-list fallback.
- [ ] Confirm extension manifest parses and all referenced popup files exist.
