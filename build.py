"""Rebuilds the two web tools that are assembled from src/. Run: python build.py
Everything else in site/ is edited directly (add projects in site/index.html)."""
from pathlib import Path
src = Path(__file__).parent / "src"; out = Path(__file__).parent / "site" / "tools"
css = (src / "shared.css").read_text(); sym = (src / "logo-symbols.svg").read_text().strip()
for page, core in [("order-import", "order-core.js"), ("code-generator", "code-core.js")]:
    js = (src / core).read_text().replace('if (typeof module !== "undefined") module.exports', "//")
    html = (src / f"{page}.html").read_text().replace("{{CSS}}", css).replace("{{SYMBOLS}}", sym).replace("{{CORE}}", js)
    (out / f"{page}.html").write_text(html)
    print("built", page)
