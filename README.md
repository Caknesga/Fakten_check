# BAware

A Chrome extension that matches selected claims on demo pages to prepared reviews.
The popup and toolbar show a traffic light summary. The BAware website lists
the claims, explanations, and source references for each rating.

> Demo prototype. The reviews are prepared in `demo-cases.js` and matched locally
> to the visible page text.

## Features
- Traffic-light icon in the toolbar showing the result for the current page
- Compact English popup with the verdict and a link to the full report
- Highlights in the article with the verdict and a report link on hover
- Per-page report cache for previously matched quotes
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
├── website/         # companion site for the full demo reports
├── icons/            # toolbar and store icons
└── docs/
    └── ANLEITUNG.txt # user guide
```

## Install (development)
1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Click **Load unpacked** and select the repository folder.
4. Pin **BAware** via the puzzle icon.
5. Use Chrome 127 or newer and allow the extension's requested access to Spiegel,
   Facebook and ScienceDirect.
6. Open an article whose URL is listed in `demo-cases.js`. The popup opens as soon
   as navigation starts, shows a simulated loading state for about three seconds,
   then reveals the check result or a **Prepared demo rating** while the page
   text is still loading.
   Once the article loads, its text is checked automatically and the popup updates
   with the matching claims or an error if the prepared quotes are absent.
   Switching to an already loaded demo tab also starts a check. No API key is needed.
   The popup opens only while that article is the active tab in the focused window.
   Open **Check options** to check a link manually or change the highlight setting.
7. Select **View details on the BAware website** to open the report for that demo page.

## Trying and editing demo cases

- The current demo URLs cover Spiegel, Facebook, and ScienceDirect. Open the
  full URL, wait for the page to load, and dismiss any consent dialog.
- You can also paste a configured URL into **Check options** and click **Check link**.
  Allow website access when prompted. If the publisher blocks fetching, open the
  article in the active tab and check it there.
- Each case needs its article's URL and at least one claim. Copy `quote` as a
  complete sentence from the visible article, including punctuation. Whitespace
  differences, wrapped lines and equivalent ellipsis/dash characters are ignored,
  but changed or unavailable sentences do not match. Short standalone video
  captions are supported too.
- The shared `page-reader.js` reads article areas and the visible body, including
  captions outside the main article. It waits up to eight seconds for dynamically
  inserted text. This is separate from the popup's three-second demo animation.
- Tracking parameters such as `utm_source` and `fbclid` do not prevent a demo URL
  from matching. Facebook navigation without a full page reload is also checked.
- Set `verdict` to `wahr`, `falsch`, `irrefuehrend`, or `unklar`, and provide an
  explanation and real source URLs in `supporting` and `contradicting`. Use `[]`
  when there are no sources. Give each demo an `id` and English `title` for its
  report link. Add a `translation` for any quote that originally appears in another
  language, keeping `quote` in its original wording for matching.
- After changing extension files, click **Reload** on `chrome://extensions`,
  then reload the article to run a fresh automatic check.
- Automatic checks require host access. When adding demo cases on another domain,
  add that domain to `host_permissions` in `manifest.json` and reload the extension.
- If no quotes match, check whether the article changed or its text is behind a paywall.

Run the local regression checks with `node --test`.

## Privacy and security
- **Never commit an API key.** `.gitignore` excludes `.env` files and `*.key`.
- Supported demo articles are read automatically when loaded in the active tab
  or when you switch to that tab. Manual checks run when you click **Check link**.
  Text matching and report caching happen in Chrome. Report links use the configured
  demo IDs.

## Companion site

The popup uses `homepage_url` in `manifest.json` when a hosted report site is
configured. With no hosted URL, the link opens the bundled `website/index.html`.
Both versions use the reviews from `demo-cases.js`.

## Roadmap
- [ ] To be defined, one improvement step at a time

## Contributing / workflow
- `main` always holds a working version.
- Work on a branch per improvement (`feature/...`), then merge via pull request.


test
