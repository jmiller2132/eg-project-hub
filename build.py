"""Run before every commit:  python build.py
1. Rebuilds the pages assembled from src/ (order import, code generator, brand guide).
2. Checks site/projects.json so a typo can't take the hub down.
Exits with an error and a plain explanation if anything is wrong."""
from pathlib import Path
import json, re, sys

root = Path(__file__).parent; src = root / "src"; site = root / "site"; tools = site / "tools"
css = (src / "shared.css").read_text(); sym = (src / "logo-symbols.svg").read_text().strip()
for page, core in [("order-import", "order-core.js"), ("code-generator", "code-core.js"), ("brand-guide", None)]:
    html = (src / f"{page}.html").read_text().replace("{{CSS}}", css).replace("{{SYMBOLS}}", sym)
    if core:
        html = html.replace("{{CORE}}", (src / core).read_text().replace('if (typeof module !== "undefined") module.exports', "//"))
    (tools / f"{page}.html").write_text(html); print("built", page)

problems = []
try:
    data = json.loads((site / "projects.json").read_text())
except json.JSONDecodeError as e:
    sys.exit(f"projects.json is not valid JSON: line {e.lineno}, column {e.colno}: {e.msg}\n"
             "Usually a missing comma between entries, a trailing comma before ] or }, or a missing quote.")
icons = set(re.findall(r"^ (\w+):'", (site / "index.html").read_text(), re.M))
ids = set()
for s in data.get("sections", []):
    for k in ("id", "title"):
        if not s.get(k): problems.append(f"A section is missing '{k}'.")
    if s.get("id") in ids: problems.append(f"Two sections share the id '{s.get('id')}'.")
    ids.add(s.get("id"))
    for x in s.get("items", []):
        where = f"'{x.get('name', '?')}' in {s.get('title')}"
        if not x.get("name"): problems.append(f"An item in {s.get('title')} has no name.")
        if not x.get("description"): problems.append(f"{where} has no description.")
        if x.get("icon") not in icons: problems.append(f"{where}: icon '{x.get('icon')}' doesn't exist. Use one of: {', '.join(sorted(icons))}.")
        url = x.get("url", "")
        if not url and not x.get("comingSoon"): problems.append(f"{where} has no url (add one, or set \"comingSoon\": true).")
        if url.startswith("/") and not (site / url.lstrip("/")).exists(): problems.append(f"{where} points to {url}, but that file isn't in site/.")
        unknown = set(x) - {"name", "description", "icon", "url", "tag", "download", "comingSoon", "hidden"}
        if unknown: problems.append(f"{where} has unknown field(s): {', '.join(sorted(unknown))}.")
if problems:
    sys.exit("projects.json has problems:\n- " + "\n- ".join(problems))
n = sum(1 for s in data["sections"] for x in s["items"] if not x.get("hidden"))
print(f"projects.json OK: {len(data['sections'])} sections, {n} visible cards")
