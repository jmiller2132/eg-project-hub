# Eagle Graphics Project Hub

Internal hub for every tool we build. Hosted on Vercel; every push to `main` deploys automatically.

## Layout
- `site/` – what gets deployed
  - `index.html` – the hub page. Add or edit a project in the `GROUPS` list near the bottom.
  - `tools/` – the hosted HTML tools
  - `downloads/` – files people download (CSV templates, etc.)
- `src/` – source for the two tools rebuilt from the old .exe programs (order import, code generator)
- `build.py` – rebuilds those two tools from `src/` after editing them

## Add a tool
1. Drop the HTML file in `site/tools/`.
2. Add one line for it in `GROUPS` in `site/index.html`.
3. Commit and push. Vercel deploys in under a minute.
