# Eagle Graphics Project Hub: instructions for Claude

Internal site for Eagle Graphics (promotional products, Kaukauna WI). Hosted on Vercel from this repo:
every commit to `main` deploys to production in about a minute. Owner: Jeff Miller.

## How to work in this repo

- **Never push to `main` unless the person you're working with is Jeff and he asks for it.** Everyone
  else: create a branch and open a pull request. Jeff reviews and merges, and the merge deploys.
- Run `python build.py` before every commit. It rebuilds generated pages and checks `site/projects.json`.
  If it fails, fix what it says. Don't commit a failing build.
- Test pages in a browser (headless is fine) before committing: the page loads, no console errors,
  the tab title is right, symbols like · and × aren't garbled.
- Write to the user in plain language. Most people using this repo aren't developers.

## Layout

- `site/` is what gets deployed (`vercel.json` sets it as the output directory).
  - `index.html`: the hub page. Cards are NOT defined here.
  - `projects.json`: every card on the hub, grouped into sections. This is the file to edit.
  - `tools/`: hosted HTML tools, one self-contained file each.
  - `downloads/`: files people download (CSV templates).
  - `brand/`: logo files used by the Brand Guide.
  - `favicon.*`, `apple-touch-icon.png`: site icons.
- `src/`: source for pages `build.py` assembles: `order-import`, `code-generator`, `brand-guide`.
  Edit these in `src/`, never their copies in `site/tools/`.
  - `order-core.js` is a verified port of the old GUI_V2.exe logic. Its output matched the original
    byte for byte. Don't change its output format without Jeff's sign-off: ShopWorks imports it.

## Common tasks

### Add a tool
1. Save the HTML file to `site/tools/` with a lowercase-hyphenated name, e.g. `box-dieline-studio.html`.
   Replace the existing file when it's an update to a tool already on the hub.
2. Check and fix the file (see "Fixes for uploaded HTML" below).
3. Add an entry to the right section in `site/projects.json`:
   ```json
   {
     "name": "Box Dieline Studio",
     "description": "One sentence on what it does for the person using it.",
     "icon": "box",
     "url": "/tools/box-dieline-studio.html",
     "tag": "Packaging"
   }
   ```
   - `icon` must be a key from the `I` object in `site/index.html` (build.py lists the valid ones).
     To add an icon, add a Lucide (lucide.dev) SVG's inner markup to `I`.
   - `tag` is a short label in the card corner. `"Web"` and `"Live"` show in green.
   - External apps use their full `https://` URL.
   - `"download": true` for files that should download instead of open.
   - `"comingSoon": true` with no `url` for a placeholder card.
   - `"beta": true` adds a Beta label and a "still in the works" note. Use a string instead of
     `true` for a custom note, e.g. `"beta": "Compare against the old program first."` Remove it once
     the tool is proven.
4. Run `python build.py`, test, commit, open a PR (or push, if Jeff says so).

### Hide or remove a tool
Set `"hidden": true` on its entry to take it off the page but keep it for later. Delete the entry
(and its file in `site/tools/`) to remove it for good. Hiding does not lock the app: anyone with
the direct URL can still open it.

### Add a section
Add an object to `sections` with `id`, `eyebrow`, `title`, `blurb`, optional `"shaded": true`
(grey background; alternate with the section above), and `items`. The top menu builds itself.

## Fixes for uploaded HTML

Tools usually come from Claude chats or Claude Design. Check each one for:

- **No charset:** if the file has no `<meta charset="utf-8">`, symbols come out garbled (Â·, Ã—).
  Add `<!DOCTYPE html>`, `<meta charset="utf-8">` and a viewport meta at the top.
- **Blank tab title:** "Bundled Page" exports replace the whole document on load and lose their
  title. Replace `<title>Bundled Page</title>` with the real title plus this script right after it:
  ```html
  <script>(function(){var T="Tool Name";function f(){if(!document.title)document.title=T}f();new MutationObserver(f).observe(document,{childList:true});document.addEventListener("DOMContentLoaded",f);window.addEventListener("load",f)})();</script>
  ```
- **Claude-only features:** search for `window.claude`, `sendPrompt`, `window.storage` and links to
  `claude.ai`. These don't work for people without Claude. Tell the user what won't work.
- **Outside requests:** list any `fetch()` calls and CDN scripts. Public CDNs are fine.

## Design

Follow the Eagle Graphics design system (summary in `site/tools/brand-guide.html` and `src/shared.css`):
green `#76BD1D` as an accent only, green 700 `#4A7812` for filled buttons and green text, grey `#53585A`
body text, `#2A2D2E` headings and dark bands. Jost uppercase headings, Open Sans body, IBM Plex Mono
for SKUs. Squared corners (2–6px). No emoji, no gradients.

## Writing for Jeff

No em dashes in anything written for or as Jeff. Keep copy plain and Midwest-direct.
