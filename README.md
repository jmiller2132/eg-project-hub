# Eagle Graphics Project Hub

Internal hub for every tool we build. Hosted on Vercel; every commit to `main` deploys automatically.

## Add or update a tool (on github.com, no software needed)

1. Open `site/tools`, click **Add file → Upload files**, and drop in the HTML file.
   To update a tool, upload a file with the same name and it replaces the old one.
2. Open `site/projects.json`, click the pencil icon, and copy an existing entry in the right section.
   Change the name, description, icon and url. Keep the commas between entries.
3. At the bottom, choose **Create a new branch and start a pull request**, then **Propose changes**.
   Jeff reviews and merges it, and it's live a minute later.

If the hub ever shows "The tool list couldn't load", `projects.json` has a typo. Open the file's
**History**, find the last good version, and restore it.

Working with Claude? It reads `CLAUDE.md` in this repo and knows all of this already.

## Layout
- `site/` – what gets deployed
  - `index.html` – the hub page
  - `projects.json` – every card on the hub
  - `tools/` – the hosted HTML tools
  - `downloads/` – files people download
  - `brand/` – logo files used by the Brand Guide
- `src/` – source for the pages `build.py` assembles (order import, code generator, brand guide)
- `build.py` – rebuilds those pages and checks `projects.json`. Run it before committing.
