# Faktencheck Ampel

A Chrome extension (Manifest V3) that checks whether the claims on the open web page
are supported by other, independent sources. The result is shown as a traffic light
(red / yellow / green) in the toolbar, and the checked sentences are highlighted
directly in the article.

> Status: demo prototype. UI language is currently German. Checks use manually
> prepared verdicts in `demo-cases.js`; there is no live research or API call.

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
├── background.js     # service worker: matches demo claims, manages jobs and the toolbar light
├── demo-cases.js     # supported article URLs, exact quotes, verdicts and sources
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
5. Use Chrome 127 or newer and allow the extension's requested Spiegel access.
6. Open an article whose URL is listed in `demo-cases.js`. The popup opens as soon
   as navigation starts, shows a simulated loading state for about three seconds,
   then reveals the prepared demo verdict or the completed check result. This
   initial rating is labelled as a demo preview, not a completed article check.
   Once the article loads, its text is checked automatically and the popup updates
   with the matching claims or an error if the prepared quotes are absent.
   Switching to an already loaded demo tab also starts a check. No API key is needed.
   The popup opens only while that article is the active tab in the focused window.
   You can still open the extension and click **Prüfen** manually.

## Trying and editing demo cases

- The current demo URL is the Spiegel article at the top of `demo-cases.js`.
  Open that full URL, wait for the article to load, and dismiss any consent dialog.
- You can also paste a configured URL into **Link prüfen**. Allow website access
  when prompted. If the publisher blocks fetching, open the article in the active
  tab and check it there.
- Each case needs its article's URL and at least one claim. Copy `quote` as a
  complete sentence from the visible article, including punctuation. Whitespace
  differences are ignored, but changed or unavailable sentences do not match.
- Set `verdict` to `wahr`, `falsch`, `irrefuehrend`, or `unklar`, and provide an
  explanation and real source URLs in `supporting` and `contradicting`. Use `[]`
  when there are no sources; replace the example's placeholder source entries.
- After changing extension files, click **Reload** on `chrome://extensions`,
  then reload the article to run a fresh automatic check.
- Automatic checks require host access. When adding demo cases on another domain,
  add that domain to `host_permissions` in `manifest.json` and reload the extension.
- Other URLs and pasted text are not supported by this demo. If no quotes match,
  check whether the article changed or its text is behind a paywall.

Run the local regression checks with `node --test tests/demo-check.test.cjs`.

## Privacy and security
- **Never commit an API key.** `.gitignore` excludes `.env` files and `*.key`.
- Supported demo articles are read automatically when loaded in the active tab
  or when you switch to that tab, and when you click "Prüfen" manually. Text is
  matched locally against the unchanged demo cases. Reports are cached in
  `chrome.storage.local`.

## Roadmap
- [ ] To be defined, one improvement step at a time

## Contributing / workflow
- `main` always holds a working version.
- Work on a branch per improvement (`feature/...`), then merge via pull request.


test
