# AGENTS.md

## Project Overview
- Single-file browser userscript (`douban.js`) for Tampermonkey, Violentmonkey, and Greasemonkey.
- Primary purpose: Automatically sync movie ratings and watchlist entries from Douban (`movie.douban.com`) to IMDb (`www.imdb.com`), and inject bidirectional links and resource search links.

## Architecture & Mechanisms
- `douban.js`: Core userscript containing all logic inside an IIFE executed at `document-idle`.
  - **Metadata Header**: Standard userscript header (`@name`, `@version`, `@include`, `@require`, `@grant GM_addStyle`). External libraries (jQuery 3.1.1, String.js) are loaded via `@require`, not npm.
  - **Configuration (`CONFIG`)**: Centralized settings near the top controlling intervals, timeouts, check retries, and UI button positioning.
  - **Inter-Page Sync Protocol**:
    1. Douban initiates sync by opening IMDb title URL with hash state: `#<score>-<target>-<batchId>-<movieIndex>-<doubanId>`.
    2. IMDb script parses hash parameters, simulates UI clicks (rating dialog or watchlist button), polls for DOM confirmation, then redirects back to Douban callback URL: `movie.douban.com/subject/<doubanId>/?from-imdb=true&result=<status>...`.
    3. State & batch progress are also coordinated via `localStorage` keys (`douban-sync-result-<batchId>-<index>`).
  - **DOM Selectors**: Script relies on specific DOM selectors on Douban (`#info`, `.grid-view`, `.aside`) and IMDb (`[data-testid="hero-rating-bar__user-rating"]`, `button[data-testid="tm-box-wl-button"]`). Note: Changes to IMDb/Douban page layouts may require updating these selectors.

## Development & Verification
- **No build step**: Plain ES6+ JavaScript running directly in the browser; no bundlers, transpilers, or `package.json`.
- **Syntax validation**: Run `node -c douban.js` to verify JavaScript syntax before committing.
- **Version format & synchronization**: Uses CalVer (`YYYY.MM.DD`, e.g., `2026.02.07`). When bumping version, update both:
  1. `douban.js` header: `// @version <YYYY.MM.DD>`
  2. `README.md` badge: `![Version](https://img.shields.io/badge/version-<YYYY.MM.DD>-blue.svg)`

## Conventions
- **Language**: User's primary language is Chinese (中文). All explanations, conversational responses, and user-facing communications must be in Chinese.
- **Commit Messages**: Conventional Commits format, e.g. `feat(douban): ...`, `fix(douban): ...`, `docs(README): ...`.
- **Dependencies**: Do NOT add `package.json` or local npm packages unless explicitly requested. All dependencies must remain in `@require` userscript headers.
