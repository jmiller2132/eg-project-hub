"""Rebuilds the pages assembled from src/. Run: python build.py
Everything else in site/ is edited directly (add projects in site/index.html)."""
from pathlib import Path
import shutil
root = Path(__file__).parent; src = root / "src"; tools = root / "site" / "tools"
css = (src / "shared.css").read_text(); sym = (src / "logo-symbols.svg").read_text().strip()
for page, core in [("order-import", "order-core.js"), ("code-generator", "code-core.js"), ("brand-guide", None)]:
    html = (src / f"{page}.html").read_text().replace("{{CSS}}", css).replace("{{SYMBOLS}}", sym)
    if core:
        html = html.replace("{{CORE}}", (src / core).read_text().replace('if (typeof module !== "undefined") module.exports', "//"))
    (tools / f"{page}.html").write_text(html); print("built", page)
shutil.copy(src / "ai-toolkit.html", root / "site" / "ai-toolkit.html"); print("copied ai-toolkit")
