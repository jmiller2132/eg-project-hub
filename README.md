# Eagle Graphics Project Hub

Internal hub for every tool we build. Hosted on Vercel; every push to `main` deploys automatically.

## Layout
- `site/` – what gets deployed
  - `index.html` – the hub page. Add or edit a project in the `GROUPS` list near the bottom.
  - `tools/` – the hosted HTML tools
  - `ai-toolkit.html` – the AI Toolkit showcase (opens hub tools in a frame)
  - `brand/` – logo files (SVG + PNG) used by the Brand Guide
  - `downloads/` – files people download (CSV templates, etc.)
- `src/` – source for pages assembled by `build.py`: order import, code generator, brand guide, AI Toolkit
- `build.py` – run after editing anything in `src/`

## Add a tool
1. Drop the HTML file in `site/tools/`.
2. Add one line for it in `GROUPS` in `site/index.html`.
3. Commit and push. Vercel deploys in under a minute.
