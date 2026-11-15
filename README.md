# Faktencheck Ampel

A Chrome extension (Manifest V3) that checks whether the claims on the open web page
are supported by other, independent sources. The result is shown as a traffic light
(red / yellow / green) in the toolbar, and the checked sentences are highlighted
directly in the article.

> Status: early prototype. UI language is currently German.

## Features
- Traffic-light icon in the toolbar showing the result for the current page
- Claim-by-claim verdict: false, misleading, true, unclear, each with explanation and sources
- Highlights in the article (hover for verdict and sources, click to pin)
- Results are cached per page, so revisiting a page shows the result instantly
- Check runs in the background, so the popup can be closed

## Project structure
```
faktencheck-ampel/
├── manifest.json     # extension config (Manifest V3)
├── background.js     # service worker: calls the Claude API, manages jobs and the toolbar light
├── popup.html        # popup UI and styles
├── popup.js          # popup logic
├── highlight.js      # content script: marks claims in the article
├── icons/            # toolbar and store icons
└── docs/
    └── ANLEITUNG.txt # original German user guide
```

## Install (development)
1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Click **Load unpacked** and select the repository folder.
4. Pin "Faktencheck Ampel" via the puzzle icon.
5. Open the popup, click the gear icon and paste your Anthropic API key
   (create one at https://platform.claude.com).

## Privacy and security
- The API key is stored only in `chrome.storage.local` in your own browser.
- **Never commit an API key.** `.gitignore` excludes `.env` files and `*.key`.
- The page text is read only when you click "Prüfen" and is sent only to the Anthropic API.

## Roadmap
- [ ] To be defined, one improvement step at a time

## Contributing / workflow
- `main` always holds a working version.
- Work on a branch per improvement (`feature/...`), then merge via pull request.
